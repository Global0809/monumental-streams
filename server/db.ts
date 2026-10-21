/**
 * Persistence: node:sqlite (synchronous) at DATA_DIR/monumental.sqlite in WAL mode.
 *
 * Schema changes are append-only entries in MIGRATIONS; each runs once inside a
 * transaction and is recorded in `schema_migrations`. Because DatabaseSync is synchronous
 * and Node is single-threaded, a read-modify-write that contains no `await` is atomic.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { MembershipStatus } from '../shared/types.ts';

export interface UserRow {
  id: string;
  email: string; // normalised (trimmed, lower-case)
  name: string;
  password: string; // encoded scrypt hash, see server/auth.ts
  created_at: string; // ISO
}

export interface SessionRow {
  token_hash: string; // sha256(token) hex — the raw token only ever lives in the cookie
  user_id: string;
  created_at: number; // epoch ms
  expires_at: number; // epoch ms
  refreshed_at: number; // epoch ms, last rolling extension
}

export type MembershipSource = 'stripe' | 'dev-preview';

export interface MembershipRow {
  user_id: string;
  status: MembershipStatus;
  source: MembershipSource | null;
  period_end: string | null; // ISO
  stripe_customer: string | null;
  stripe_subscription: string | null;
  /** `created` (epoch s) of the newest Stripe event applied — guards against out-of-order delivery. */
  stripe_event_at: number | null;
  updated_at: number; // epoch ms
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    refreshed_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE INDEX sessions_expiry ON sessions(expires_at);
  CREATE TABLE libraries (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE memberships (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    source TEXT,
    period_end TEXT,
    stripe_customer TEXT,
    stripe_subscription TEXT,
    stripe_event_at INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX memberships_customer ON memberships(stripe_customer);
  CREATE INDEX memberships_subscription ON memberships(stripe_subscription);
  CREATE TABLE billing_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    received_at INTEGER NOT NULL
  );
  `,
];

export interface AppDatabase {
  sqlite: DatabaseSync;
  /** Runs `fn` inside BEGIN IMMEDIATE … COMMIT (ROLLBACK on throw). `fn` must be synchronous. */
  transaction<T>(fn: () => T): T;
  users: {
    insert(row: UserRow): void;
    byEmail(email: string): UserRow | undefined;
    byId(id: string): UserRow | undefined;
  };
  sessions: {
    insert(row: SessionRow): void;
    find(tokenHash: string): SessionRow | undefined;
    extend(tokenHash: string, expiresAt: number, now: number): void;
    delete(tokenHash: string): void;
    purgeExpired(now: number): number;
  };
  libraries: {
    get(userId: string): { json: string; updated_at: number } | undefined;
    put(userId: string, json: string, now: number): void;
  };
  memberships: {
    get(userId: string): MembershipRow | undefined;
    byStripeCustomer(customerId: string): MembershipRow | undefined;
    byStripeSubscription(subscriptionId: string): MembershipRow | undefined;
    save(row: MembershipRow): void;
  };
  billingEvents: {
    has(id: string): boolean;
    record(id: string, type: string, now: number): void;
  };
  close(): void;
}

function migrate(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null } | undefined;
  const current = row?.v ?? 0;
  for (let version = current + 1; version <= MIGRATIONS.length; version++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[version - 1]);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDatabase(dataDir: string): AppDatabase {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(path.join(dataDir, 'monumental.sqlite'));
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(sqlite);

  // node:sqlite returns plain records; the casts below narrow them to the table shapes above.
  const one = <T>(sql: string) => {
    const stmt = sqlite.prepare(sql);
    return (...args: (string | number | null)[]) => stmt.get(...args) as T | undefined;
  };
  const run = (sql: string) => {
    const stmt = sqlite.prepare(sql);
    return (...args: (string | number | null)[]) => stmt.run(...args);
  };

  const userInsert = run('INSERT INTO users (id, email, name, password, created_at) VALUES (?, ?, ?, ?, ?)');
  const sessionInsert = run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, refreshed_at) VALUES (?, ?, ?, ?, ?)');
  const membershipSave = run(`
    INSERT INTO memberships (user_id, status, source, period_end, stripe_customer, stripe_subscription, stripe_event_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      status = excluded.status, source = excluded.source, period_end = excluded.period_end,
      stripe_customer = excluded.stripe_customer, stripe_subscription = excluded.stripe_subscription,
      stripe_event_at = excluded.stripe_event_at, updated_at = excluded.updated_at`);
  const libraryPut = run(`
    INSERT INTO libraries (user_id, json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`);
  const sessionExtend = run('UPDATE sessions SET expires_at = ?, refreshed_at = ? WHERE token_hash = ?');
  const sessionDelete = run('DELETE FROM sessions WHERE token_hash = ?');
  const purge = run('DELETE FROM sessions WHERE expires_at <= ?');
  const eventRecord = run('INSERT OR IGNORE INTO billing_events (id, type, received_at) VALUES (?, ?, ?)');
  const eventCount = one<{ n: number }>('SELECT COUNT(*) AS n FROM billing_events WHERE id = ?');

  return {
    sqlite,
    transaction(fn) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    users: {
      insert: (u) => void userInsert(u.id, u.email, u.name, u.password, u.created_at),
      byEmail: one<UserRow>('SELECT * FROM users WHERE email = ?'),
      byId: one<UserRow>('SELECT * FROM users WHERE id = ?'),
    },
    sessions: {
      insert: (s) => void sessionInsert(s.token_hash, s.user_id, s.created_at, s.expires_at, s.refreshed_at),
      find: one<SessionRow>('SELECT * FROM sessions WHERE token_hash = ?'),
      extend: (hash, expiresAt, now) => void sessionExtend(expiresAt, now, hash),
      delete: (hash) => void sessionDelete(hash),
      purgeExpired: (now) => Number(purge(now).changes),
    },
    libraries: {
      get: one<{ json: string; updated_at: number }>('SELECT json, updated_at FROM libraries WHERE user_id = ?'),
      put: (userId, json, now) => void libraryPut(userId, json, now),
    },
    memberships: {
      get: one<MembershipRow>('SELECT * FROM memberships WHERE user_id = ?'),
      byStripeCustomer: one<MembershipRow>('SELECT * FROM memberships WHERE stripe_customer = ? ORDER BY updated_at DESC LIMIT 1'),
      byStripeSubscription: one<MembershipRow>('SELECT * FROM memberships WHERE stripe_subscription = ? LIMIT 1'),
      save: (m) =>
        void membershipSave(
          m.user_id,
          m.status,
          m.source,
          m.period_end,
          m.stripe_customer,
          m.stripe_subscription,
          m.stripe_event_at,
          m.updated_at,
        ),
    },
    billingEvents: {
      has: (id) => (eventCount(id)?.n ?? 0) > 0,
      record: (id, type, now) => void eventRecord(id, type, now),
    },
    close: () => sqlite.close(),
  };
}
