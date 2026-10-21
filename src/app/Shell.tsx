/**
 * The app shell of THE LIVING ARCHIVE.
 *
 *   z 0   the living world (StageLayer: 3D stage, static fallback, legibility veil)
 *   z 1   the editorial layer: vertebral index, phone bars, chapter rail, <main>, footer
 *   z 60+ the awakening, dialogs (menu sheet, search), toasts, the cursor
 *
 * The shell gives every route a world arrangement before the page refines it (world.ts),
 * applies persisted preferences to the live systems, keeps identity in sync, announces
 * route changes and moves focus to the new page's heading.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useCatalogue } from '../state/catalogue.tsx';
import { attachAdapter, usePrefs } from '../state/library.ts';
import { refreshSession, useSession } from '../state/session.ts';
import { stageStore } from '../stage/store.ts';
import { Cursor } from '../systems/cursor/Cursor.tsx';
import { setMotionPref } from '../systems/motion.ts';
import { setPreviewMode } from '../systems/previews.ts';
import { sound } from '../systems/sound/engine.ts';
import { Toaster, toast, Dialog } from '../ui/feedback.tsx';
import { Awakening, shouldAwaken } from './Awakening.tsx';
import { ChapterRail } from './nav.tsx';
import { MenuSheetContent, PhoneBar, PhoneTabs, SpineIndex } from './navigation.tsx';
import { SearchPalette } from './SearchPalette.tsx';
import { StageLayer } from './StageLayer.tsx';
import { useWorldDirector } from './world.ts';
import './shell.css';

function Footer() {
  return (
    <footer className="footer wrap">
      <div className="footer-mark">
        <p className="footer-word">MONUMENTAL STREAMS</p>
        <p className="footer-line">All lives. All stories. One platform.</p>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <Link to="/about">About & honesty notes</Link>
        <Link to="/membership">Membership</Link>
        <Link to="/catalogue?prov=archive">Open archive</Link>
        <Link to="/my-world?tab=settings">Sound, motion & accessibility</Link>
      </nav>
      <p className="footer-fine">Preview build · Miami gateway · demonstration media is labelled as such · no original episodes are published yet</p>
    </footer>
  );
}

/** Applies persisted preferences to the live systems. */
function usePreferenceSystems() {
  const prefs = usePrefs();
  useEffect(() => setMotionPref(prefs.motion), [prefs.motion]);
  useEffect(() => setPreviewMode(prefs.previews), [prefs.previews]);
  useEffect(() => {
    sound.setPrefs({ master: prefs.sound.master, ambience: prefs.sound.ambience, effects: prefs.sound.effects, programme: prefs.sound.programme, muted: prefs.sound.muted });
  }, [prefs.sound.master, prefs.sound.ambience, prefs.sound.effects, prefs.sound.programme, prefs.sound.muted]);
  return prefs;
}

/** Keeps the library adapter in step with identity (guest ⇄ account). */
function useIdentitySync() {
  const { session, status } = useSession();
  const userId = session.user?.id ?? null;
  const first = useRef(true);
  useEffect(() => {
    if (status === 'loading') return;
    const wasFirst = first.current;
    first.current = false;
    attachAdapter(userId).then(({ mergedGuest }) => {
      if (mergedGuest && !wasFirst) toast('Your guest library was merged into your account and now syncs across devices.', { tone: 'success' });
    });
  }, [userId, status]);
}

function RouteAnnouncer() {
  const { pathname, state } = useLocation();
  const [msg, setMsg] = useState('');
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const organ = pathname.split('/')[1] ?? '';
    const last = prev.current;
    prev.current = pathname;
    if (last === null) return;
    // Within one organ (turning the chronometer, moving around the atlas) keep focus where the
    // viewer is acting; announce politely instead. Callers can also opt out with state.keepFocus.
    const sameOrgan = (last.split('/')[1] ?? '') === organ;
    const keepFocus = sameOrgan || (state as { keepFocus?: boolean } | null)?.keepFocus === true;
    const t = window.setTimeout(() => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      setMsg(h1?.textContent ? `${h1.textContent}` : document.title);
      if (h1 && !keepFocus) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [pathname]);
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {msg}
    </p>
  );
}

export function Shell() {
  const cat = useCatalogue(); // shell only renders once the catalogue exists
  const prefs = usePreferenceSystems();
  useIdentitySync();
  useWorldDirector(cat);
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [awake, setAwake] = useState(() => !shouldAwaken());
  const location = useLocation();

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    setMore(false);
    setSearching(false);
  }, [location.pathname]);

  useEffect(() => {
    // "/" opens search from anywhere (except while typing)
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !t.closest('input, textarea, select, [contenteditable="true"]')) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSearch = () => {
    setMore(false);
    setSearching(true);
  };

  /** What the cursor reticle names when it rests on something in the world. */
  const stageLabel = useCallback(
    (kind: string) => {
      const s = stageStore.get();
      if (kind === 'seed' && s.hovered) return cat.label(s.hovered);
      if (kind === 'place' && s.hoveredPlace) return cat.label(s.hoveredPlace);
      if (kind === 'organ') return 'Enter';
      if (kind === 'vertebra' || kind === 'decade') return 'Travel';
      return '';
    },
    [cat],
  );

  return (
    <>
      <StageLayer />
      <Cursor enabled={prefs.cursor === 'organic'} stage={{ label: stageLabel, subscribe: stageStore.subscribe }} />
      {!awake ? <Awakening onDone={() => setAwake(true)} /> : null}
      <div className="body-plan" inert={!awake || undefined} data-awakening={!awake || undefined}>
        <SpineIndex onSearch={openSearch} />
        <PhoneBar onSearch={openSearch} />
        <ChapterRail />
        <main id="main" className="main" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer />
        <PhoneTabs onMenu={() => setMore(true)} />
      </div>
      <Dialog open={more} onClose={() => setMore(false)} title="Menu" variant="sheet">
        <MenuSheetContent onSearch={openSearch} />
      </Dialog>
      <SearchPalette open={searching} onClose={() => setSearching(false)} />
      <Toaster />
      <RouteAnnouncer />
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </>
  );
}
