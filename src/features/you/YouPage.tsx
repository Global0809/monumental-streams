/**
 * MY WORLD — the viewer's own space, as an editorial layer over the personal core.
 *
 * The living world takes the `personal` arrangement: every saved story is a seed orbiting the
 * viewer's core (src/stage). Saving anywhere sends a seed flying in; removing one here
 * releases it from the orbit. The page itself is words and controls: a greeting, the title,
 * one line of what is here, the one primary action (pick up the story in progress), the
 * counts as supporting text, who is here (guest or account, membership, sync honesty), then
 * the sections as tabs: continue, saved, places, journeys, history, interests, for you,
 * settings and membership (/my-world?tab=…).
 *
 * DOM ⇄ world: cards light their seeds and the world's hovered seed lights its card; pointing
 * at a counter, a journey or a place singles out the saved seeds it is about.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { activeInterests, activeJourneys, continueWatching, savedIds, savedPlaceIds, visibleHistory } from '../../../shared/library.ts';
import type { ID, Video } from '../../../shared/types.ts';
import { plural, timecode } from '../../lib/format.ts';
import { useArrangement } from '../../stage/store.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useLibrary, useSync } from '../../state/library.ts';
import { auth, useSession } from '../../state/session.ts';
import { useReducedMotion } from '../../systems/motion.ts';
import { sound } from '../../systems/sound/engine.ts';
import { Button, ButtonLink, Tabs, tabPanelProps } from '../../ui/controls.tsx';
import { toast } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { STATUS_LABEL } from '../membership/status.ts';
import { agoLabel, firstName, greeting, historyKey, initials, orbitSubset, parseTab, TAB_LABELS, YOU_TABS, type YouTab } from './helpers.ts';
import { ContinuePanel, ForYouPanel, HistoryPanel, InterestsPanel, JourneysPanel, MembershipSummary, PlacesPanel, SavedPanel } from './panels.tsx';
import { usePendingHistory } from './pending.ts';
import { SettingsPanel } from './SettingsPanel.tsx';
import { OrbitPreview, seedHover, useOrbitPreview } from './world-link.ts';
import './you.css';

export default function YouPage() {
  const cat = useCatalogue();
  const lib = useLibrary();
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const pending = usePendingHistory();
  const reduced = useReducedMotion();
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

  /* ── The world: saved seeds orbit the core; a hovered item singles out the ones it is about ── */
  const orbit = useMemo(() => savedStories.map((v) => v.id), [savedStories]);
  const orbitRef = useRef(orbit);
  orbitRef.current = orbit;
  const [preview, setPreview] = useState<ID[] | null>(null);
  const previewOrbit = useCallback((ids: ID[] | null) => setPreview(ids ? orbitSubset(ids, orbitRef.current) : null), []);
  useArrangement({ kind: 'personal' }, preview);

  const counts = {
    continue: inProgress.length,
    saved: savedStories.length,
    places: new Set([...places, ...stamps]).size,
    journeys: journeys.length,
    history: visibleHistory(lib).filter((h) => !pending.has(historyKey(h))).length,
    interests: activeInterests(lib).filter(known).length,
    stamps: stamps.length,
  };

  // what each counter is about, in the world
  const about = useMemo(() => {
    const atPlaces = (ids: ID[]) => ids.flatMap((p) => cat.videosForPlace(p, true).map((v) => v.id));
    return {
      continue: inProgress.map(({ v }) => v.id),
      saved: orbit,
      places: atPlaces([...new Set([...places, ...stamps])]),
      journeys: journeys.flatMap((j) => j.stops.filter((id) => kindOf(id) === 'video')),
      stamps: Object.values(lib.stamps).map((s) => s.video),
    };
  }, [cat, inProgress, orbit, places, stamps, journeys, lib.stamps]);

  const tabs = YOU_TABS.map((value) => ({
    value,
    label: TAB_LABELS[value],
    count: value === 'settings' || value === 'membership' || value === 'foryou' ? undefined : counts[value],
  }));

  const hour = new Date().getHours();
  const name = firstName(session.user?.name);
  const now = inProgress[0];
  const signedIn = !!session.user;

  return (
    <OrbitPreview.Provider value={previewOrbit}>
      <div className="page you mw">
        <header className="wrap mw-hero">
          <div className="mw-intro">
            <p className="eyebrow mw-greet">
              {greeting(hour)}
              {name ? `, ${name}` : ''}
            </p>
            <h1 className="title-monument mw-title">My World</h1>
            <p className="lede mw-lede">
              {savedStories.length
                ? `${plural(savedStories.length, 'saved story', 'saved stories')} ${savedStories.length === 1 ? 'orbits' : 'orbit'} your core. Everything you start and follow is kept here`
                : 'Save any story, anywhere, and it flies here into your core. Everything you start and follow is kept here'}
              {signedIn ? ', in step across your devices.' : ' — in this browser until you have an account.'}
            </p>

            {now ? (
              <ButtonLink
                to={`${cat.href(now.v.id)}?t=${Math.floor(now.entry.pos)}`}
                variant="primary"
                size="lg"
                icon="play"
                className="mw-resume"
                data-cursor="play"
                data-cursor-label="Resume"
                onClick={() => sound.play('transition')}
                {...seedHover(now.v.id)}
              >
                <span className="mw-resume-title">Pick up {now.v.title}</span>
                <span className="mw-resume-at timecode">at {timecode(now.entry.pos)}</span>
              </ButtonLink>
            ) : null}

            <ul className="mw-vitals" aria-label="My World at a glance">
              <Vital ids={about.continue} n={counts.continue} label="In progress" current={tab === 'continue'} onClick={() => setTab('continue', true)} />
              <Vital ids={about.saved} n={counts.saved} label="Saved" current={tab === 'saved'} onClick={() => setTab('saved', true)} />
              <Vital ids={about.places} n={counts.places} label="Places" current={tab === 'places'} onClick={() => setTab('places', true)} />
              <Vital ids={about.journeys} n={counts.journeys} label="Journeys" current={tab === 'journeys'} onClick={() => setTab('journeys', true)} />
              <Vital ids={about.stamps} n={counts.stamps} label="Passport stamps" current={false} onClick={() => setTab('places', true)} />
            </ul>
          </div>

          <Identity primary={!now} onMembership={() => setTab('membership', true)} />
        </header>

        <div className="wrap mw-body">
          <div className="mw-tabs" ref={tabsRef}>
            <Tabs label="My World sections" value={tab} tabs={tabs} onChange={(t) => setTab(t)} />
          </div>

          <section {...tabPanelProps(tab)} className="mw-panel" key={tab}>
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
    </OrbitPreview.Provider>
  );
}

/* ───────────── Counts: supporting text that opens its section ───────────── */

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

function Vital({ ids, n, label, current, onClick }: { ids: ID[]; n: number; label: string; current: boolean; onClick: () => void }) {
  const bump = useBump(n);
  const preview = useOrbitPreview(ids);
  return (
    <li>
      <button type="button" className={`mw-vital ${current ? 'is-current' : ''}`} onClick={onClick} aria-label={`${n} ${label} — show`} {...preview}>
        <span key={bump} className={`mw-vital-n ${bump ? 'is-bumped' : ''}`}>
          {n}
        </span>{' '}
        <span className="mw-vital-l">{label.toLowerCase()}</span>
      </button>
    </li>
  );
}

/* ───────────── Who is here ───────────── */

function Identity({ primary, onMembership }: { primary: boolean; onMembership: () => void }) {
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
      <section className="mw-id" aria-label="Profile">
        <p className="mw-id-sub">
          <span className="mw-dot" aria-hidden="true" />
          Checking who is here…
        </p>
      </section>
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
    <section className="mw-id" aria-label="Profile">
      <div className="mw-id-who">
        <span className={`mw-avatar ${m.premium ? 'is-premium' : ''}`} aria-hidden="true">
          {user ? initials(user.name) || <Icon name="user" size={20} /> : <Icon name="user" size={20} />}
        </span>
        <div className="mw-id-text">
          <p className="mw-id-name">{user ? user.name : 'Guest'}</p>
          {syncState ? (
            <p className={`mw-id-sub mw-sync mw-sync-${syncState.tone}`}>
              <span className="mw-dot" aria-hidden="true" />
              <span>Synced to your account</span>
              <span aria-hidden="true">·</span>
              <span role="status" aria-live="polite" className="mw-sync-word">
                {syncState.word}
              </span>
              {sync.state === 'saved' && sync.lastSyncedAt ? <span className="mw-sync-ago">{agoLabel(sync.lastSyncedAt, now)}</span> : null}
            </p>
          ) : (
            <p className="mw-id-sub mw-sync mw-sync-guest">
              <span className="mw-dot" aria-hidden="true" />
              No account · saved in this browser only
            </p>
          )}
        </div>
      </div>

      {user && (sync.state === 'error' || sync.state === 'offline') && sync.message ? (
        <p className="notice mw-sync-msg">
          <Icon name="info" size={18} />
          <span>{sync.message}</span>
        </p>
      ) : null}

      {!user ? (
        <p className="mw-id-note">
          An account keeps My World in step across your devices; everything already here merges in.
          {status === 'offline' ? ' The account service is unreachable right now, so this browser is all there is for the moment.' : ''}
        </p>
      ) : null}

      <div className="mw-id-actions">
        {user ? (
          <>
            <button type="button" className={`mw-member ${m.premium ? 'is-premium' : ''}`} onClick={onMembership} aria-label={`${STATUS_LABEL[m.status]} — show membership`}>
              <Icon name={m.premium ? 'diamond' : 'lock'} size={15} />
              <span>{STATUS_LABEL[m.status]}</span>
            </button>
            <ButtonLink to="/account" variant="quiet" icon="user">
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
            <ButtonLink to="/account?mode=register&next=/my-world" variant={primary ? 'primary' : 'aurum'} icon="user">
              Create a free account
            </ButtonLink>
            <ButtonLink to="/account?mode=signin&next=/my-world" variant="quiet">
              Sign in
            </ButtonLink>
          </>
        )}
      </div>

    </section>
  );
}
