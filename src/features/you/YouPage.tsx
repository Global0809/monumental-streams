/**
 * MY WORLD — the viewer's own space. A greeting, who is here (guest or account, membership and
 * sync, with the profile actions), the constellation of everything they keep around the story
 * they are in, five live counters, and tabbed sections: continue, saved stories, places,
 * journeys, history, interests, recommendations, settings and membership. Every change applies
 * — and every number updates — immediately. Settings is reachable as /my-world?tab=settings.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { activeInterests, activeJourneys, continueWatching, savedIds, savedPlaceIds, visibleHistory } from '../../../shared/library.ts';
import type { ID, Video } from '../../../shared/types.ts';
import { timecode } from '../../lib/format.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useLibrary, useSync } from '../../state/library.ts';
import { auth, useSession } from '../../state/session.ts';
import { deviceTier } from '../../systems/device.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Tabs, tabPanelProps } from '../../ui/controls.tsx';
import { toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { STATUS_LABEL } from '../membership/status.ts';
import { Constellation, type Core, type Highlight } from './Constellation.tsx';
import type { OrbitItem, RingId } from './constellation.ts';
import { agoLabel, firstName, greeting, historyKey, initials, parseTab, TAB_LABELS, YOU_TABS, type YouTab } from './helpers.ts';
import { ContinuePanel, ForYouPanel, HistoryPanel, InterestsPanel, JourneysPanel, MembershipSummary, PlacesPanel, SavedPanel } from './panels.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { usePendingHistory } from './pending.ts';
import './you.css';

export default function YouPage() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const pending = usePendingHistory();
  const [highlight, setHighlight] = useState<Highlight>(null);
  const reduced = useReducedMotion();
  const [lite] = useState(() => deviceTier() === 'low');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'My World · Monumental Streams';
  }, []);

  const setTab = (t: YouTab, reveal = false) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('tab', t);
        return n;
      },
      { replace: true, preventScrollReset: true },
    );
    if (reveal) {
      sound.play('tick');
      requestAnimationFrame(() => {
        tabsRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        tabsRef.current?.querySelector<HTMLElement>(`#tab-${t}`)?.focus({ preventScroll: true });
      });
    }
  };

  const video = (id: ID) => (kindOf(id) === 'video' ? (cat.get(id) as Video | undefined) : undefined);
  const known = (id: string) => !!cat.get(id);

  const inProgress = useMemo(() => continueWatching(lib).flatMap((c) => (video(c.video) ? [{ v: video(c.video)!, entry: c.entry }] : [])), [cat, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  const savedStories = useMemo(() => savedIds(lib).flatMap((id) => (video(id) ? [video(id)!] : [])), [cat, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = useMemo(() => savedPlaceIds(lib).filter(known), [cat, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  const stamps = useMemo(() => Object.keys(lib.stamps).filter(known), [cat, lib]); // eslint-disable-line react-hooks/exhaustive-deps
  const journeys = useMemo(() => activeJourneys(lib), [lib]);

  const counts = {
    continue: inProgress.length,
    saved: savedStories.length,
    places: new Set([...places, ...stamps]).size,
    journeys: journeys.length,
    history: visibleHistory(lib).filter((h) => !pending.has(historyKey(h))).length,
    interests: activeInterests(lib).filter(known).length,
    stamps: stamps.length,
  };

  // The constellation: one node per real item.
  const orbit = useMemo<Record<RingId, OrbitItem[]>>(() => {
    const stamped = new Set(stamps);
    const placeIds = [...new Set([...places, ...stamps])];
    return {
      continue: inProgress.map(({ v, entry }) => ({ id: v.id, label: v.title, progress: entry.dur ? Math.min(1, entry.pos / entry.dur) : 0 })),
      saved: savedStories.map((v) => ({ id: v.id, label: v.title })),
      places: placeIds.map((id) => ({ id, label: cat.label(id), stamp: stamped.has(id) })),
      journeys: journeys.map((j) => ({ id: j.id, label: j.title || 'Untitled journey' })),
    };
  }, [cat, inProgress, savedStories, places, stamps, journeys]);

  // The centre of the world: the story in progress, else the latest save, else the studio membrane.
  const core = useMemo<Core>(() => {
    const now = inProgress[0];
    if (now)
      return {
        art: now.v.art,
        href: `${cat.href(now.v.id)}?t=${Math.floor(now.entry.pos)}`,
        label: `Pick up ${now.v.title} where you left off, at ${timecode(now.entry.pos)}`,
        kicker: 'In progress',
        caption: now.v.title,
      };
    const last = savedStories[0];
    if (last) return { art: last.art, href: cat.href(last.id), label: `Open ${last.title}, your latest save`, kicker: 'Latest save', caption: last.title };
    return { art: 'art:living-membrane', kicker: 'My World', caption: 'Starts with the first story you save' };
  }, [cat, inProgress, savedStories]);

  const tabs = YOU_TABS.map((value) => ({
    value,
    label: TAB_LABELS[value],
    count: value === 'settings' || value === 'membership' || value === 'foryou' ? undefined : counts[value],
  }));

  const hour = new Date().getHours();
  const name = firstName(session.user?.name);

  return (
    <div className={`page you mw ${lite ? 'is-lite' : ''}`}>
      <header className="mw-head">
        <div className="mw-aura" aria-hidden="true">
          <Art art={core.art} alt="" sizes="small" className="mw-aura-art" />
        </div>
        <div className="wrap mw-head-grid">
          <div className="mw-intro">
            <p className="mw-greet">
              {greeting(hour)}
              {name ? `, ${name}` : ''}
            </p>
            <h1 className="mw-title">
              My <em>World</em>
            </h1>
            <p className="mw-lede">
              Everything you have saved, started and followed, in one place
              {session.user ? ' and in step across your devices.' : ' — kept in this browser until you have an account.'}
            </p>
            <Identity onMembership={() => setTab('membership', true)} />
          </div>
          <Constellation items={orbit} highlight={highlight} core={core} lite={lite || reduced} />
        </div>

        <div className="wrap">
          <ul className="mw-vitals" aria-label="My World at a glance" onPointerLeave={() => setHighlight(null)}>
            <Vital ring="continue" n={counts.continue} label="In progress" current={tab === 'continue'} onHighlight={setHighlight} onClick={() => setTab('continue', true)} />
            <Vital ring="saved" n={counts.saved} label="Saved" current={tab === 'saved'} onHighlight={setHighlight} onClick={() => setTab('saved', true)} />
            <Vital ring="places" n={counts.places} label="Places" current={tab === 'places'} onHighlight={setHighlight} onClick={() => setTab('places', true)} />
            <Vital ring="journeys" n={counts.journeys} label="Journeys" current={tab === 'journeys'} onHighlight={setHighlight} onClick={() => setTab('journeys', true)} />
            <Vital ring="stamps" n={counts.stamps} label="Passport stamps" current={false} onHighlight={setHighlight} onClick={() => setTab('places', true)} />
          </ul>
        </div>
      </header>

      <div className="wrap you-body">
        <div className="you-tabs" ref={tabsRef}>
          <Tabs label="My World sections" value={tab} tabs={tabs} onChange={(t) => setTab(t)} />
        </div>

        <section {...tabPanelProps(tab)} className="you-panel" key={tab}>
          {tab === 'continue' ? <ContinuePanel /> : null}
          {tab === 'saved' ? <SavedPanel onPlaces={() => setTab('places', true)} /> : null}
          {tab === 'places' ? <PlacesPanel /> : null}
          {tab === 'journeys' ? <JourneysPanel /> : null}
          {tab === 'history' ? <HistoryPanel /> : null}
          {tab === 'interests' ? <InterestsPanel /> : null}
          {tab === 'foryou' ? <ForYouPanel /> : null}
          {tab === 'settings' ? <SettingsPanel /> : null}
          {tab === 'membership' ? <MembershipSummary /> : null}
        </section>
      </div>
    </div>
  );
}

/* ───────────── Counters ───────────── */

/** A number that pulses when it changes (never on first render). */
function useBump(n: number) {
  const prev = useRef(n);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current !== n) {
      prev.current = n;
      setBump((b) => b + 1);
    }
  }, [n]);
  return bump;
}

function Vital({
  ring,
  n,
  label,
  current,
  onClick,
  onHighlight,
}: {
  ring: RingId | 'stamps';
  n: number;
  label: string;
  current: boolean;
  onClick: () => void;
  onHighlight: (h: Highlight) => void;
}) {
  const bump = useBump(n);
  return (
    <li>
      <button
        type="button"
        className={`mw-vital mw-vital-${ring} ${current ? 'is-current' : ''}`}
        data-react="light"
        onClick={onClick}
        onPointerEnter={() => onHighlight(ring)}
        onFocus={() => onHighlight(ring)}
        onBlur={() => onHighlight(null)}
        aria-label={`${n} ${label} — show`}
      >
        <span className="mw-vital-node" aria-hidden="true" />
        <span key={bump} className={`mw-vital-n ${bump ? 'is-bumped' : ''}`}>
          {n}
        </span>
        {' '}
        <span className="mw-vital-l">{label}</span>
      </button>
    </li>
  );
}

/* ───────────── Who is here ───────────── */

function Identity({ onMembership }: { onMembership: () => void }) {
  const { session, status } = useSession();
  const sync = useSync();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (status === 'loading') {
    return (
      <div className="mw-id panel">
        <p className="mw-pill mw-pill-idle">
          <span className="mw-dot" aria-hidden="true" />
          Checking who is here…
        </p>
      </div>
    );
  }

  const user = session.user;
  const m = session.membership;

  const signOut = async () => {
    setBusy(true);
    try {
      await auth.signOut();
      sound.play('close');
      toast('Signed out. This browser now shows its own guest library; your account keeps everything.', { tone: 'success' });
    } catch (e) {
      toast((e as { status?: number }).status === 0 ? 'The connection dropped. Check your network and try again.' : 'We couldn’t sign you out just now. Please try again.', {
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const syncState = !user
    ? null
    : sync.mode !== 'server'
      ? { word: 'Connecting…', tone: 'idle' }
      : sync.state === 'saving'
        ? { word: 'Saving…', tone: 'saving' }
        : sync.state === 'saved'
          ? { word: 'Saved', tone: 'saved' }
          : sync.state === 'offline'
            ? { word: 'Offline', tone: 'offline' }
            : sync.state === 'error'
              ? { word: 'Sync error', tone: 'error' }
              : { word: 'Up to date', tone: 'saved' };

  return (
    <section className="mw-id panel" aria-label="Profile">
      <div className="mw-id-top">
        <span className={`mw-avatar ${m.premium ? 'is-premium' : ''}`} aria-hidden="true">
          {user ? initials(user.name) || <Icon name="user" size={22} /> : <Icon name="user" size={22} />}
        </span>
        <div className="mw-id-who">
          <p className="mw-id-name">{user ? user.name : 'Guest'}</p>
          <p className="mw-id-sub">{user ? user.email : 'No account · this browser only'}</p>
        </div>
      </div>

      <div className="mw-pills">
        <button type="button" className={`mw-pill mw-pill-member ${m.premium ? 'is-premium' : ''}`} onClick={onMembership} aria-label={`${user ? STATUS_LABEL[m.status] : 'Guest'} — show membership`}>
          <Icon name={m.premium ? 'diamond' : 'lock'} size={14} />
          <span>{user ? STATUS_LABEL[m.status] : 'Guest'}</span>
        </button>
        {syncState ? (
          <p className={`mw-pill mw-sync mw-sync-${syncState.tone}`}>
            <span className="mw-dot" aria-hidden="true" />
            <span>Synced to your account</span>
            <span className="mw-sep" aria-hidden="true">
              ·
            </span>
            <span role="status" aria-live="polite" className="mw-sync-word">
              {syncState.word}
            </span>
            {sync.state === 'saved' && sync.lastSyncedAt ? <span className="mw-sync-ago">{agoLabel(sync.lastSyncedAt, now)}</span> : null}
          </p>
        ) : (
          <p className="mw-pill mw-sync mw-sync-guest">
            <span className="mw-dot" aria-hidden="true" />
            Saved in this browser only
          </p>
        )}
      </div>

      {user && (sync.state === 'error' || sync.state === 'offline') && sync.message ? (
        <p className="notice mw-sync-msg">
          <Icon name="info" size={18} />
          <span>{sync.message}</span>
        </p>
      ) : null}

      {!user ? (
        <p className="mw-id-note">
          Create a free account to keep this in step across your devices &mdash; everything already here merges in automatically.
          {status === 'offline' ? ' The account service is unreachable right now, so this browser is all there is for the moment.' : ''}
        </p>
      ) : null}

      <div className="mw-id-actions">
        {user ? (
          <>
            <ButtonLink to="/account" variant="chrome" icon="user">
              Account
            </ButtonLink>
            <ButtonLink to="/my-world?tab=settings" variant="quiet" icon="settings" replace preventScrollReset>
              Settings
            </ButtonLink>
            <Button variant="quiet" icon="arrow" onClick={signOut} busy={busy} disabled={busy}>
              {busy ? 'Signing out…' : 'Sign out'}
            </Button>
          </>
        ) : (
          <>
            <ButtonLink to="/account?mode=register&next=/my-world" variant="primary" icon="user" data-react="magnet">
              Create a free account
            </ButtonLink>
            <ButtonLink to="/account?mode=signin&next=/my-world" variant="ghost">
              Sign in
            </ButtonLink>
          </>
        )}
      </div>
    </section>
  );
}
