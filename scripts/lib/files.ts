/** Filesystem helpers shared by the media, globe and content scripts. */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Project root (scripts/lib → ../..). */
export const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Absolute path from a project-relative one (forward slashes accepted on every OS). */
export const fromRoot = (...parts: string[]) => path.join(ROOT, ...parts);

/** Project-relative path with forward slashes, for logs, docs and JSON. */
export const toRootRelative = (abs: string) => path.relative(ROOT, abs).split(path.sep).join('/');

/** SHA-256 of a file's contents (streamed, so large archive films are fine). */
export function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => h.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

export const hashString = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Writes JSON with a trailing newline, creating parent directories. Pretty-printed by default;
 * `compact` for data files shipped to browsers.
 */
export async function writeJson(file: string, value: unknown, opts: { compact?: boolean } = {}): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, opts.compact ? undefined : 2)}\n`);
}

/** Replaces `dest` (file or directory) with `src` via rename, removing whatever was there. */
export async function replacePath(src: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await rename(src, dest);
}

/** Total size in bytes of a file or directory tree (0 when missing). */
export function sizeOf(p: string): number {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((sum, name) => sum + sizeOf(path.join(p, name)), 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** "1:05.3" style duration for reports. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
