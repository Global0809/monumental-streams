/**
 * The app shell. A floating glass masthead (see nav.tsx) over full-bleed pages, a phone tab bar,
 * a "more" sheet, and the systems that make it feel alive: cursor, sound, intro, toasts.
 * Main content is a single landmark; route changes are announced and focus moves to the new
 * page's heading.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useCatalogue } from '../state/catalogue.tsx';
import { attachAdapter, usePrefs } from '../state/library.ts';
import { refreshSession, useSession } from '../state/session.ts';
import { Cursor } from '../systems/cursor/Cursor.tsx';
import { setMotionPref } from '../systems/motion.ts';
import { setPreviewMode } from '../systems/previews.ts';
import { sound } from '../systems/sound/engine.ts';
import { Toaster, toast, Dialog } from '../ui/feedback.tsx';
import { Awakening, shouldAwaken } from '../features/entry/Awakening.tsx';
import { ChapterRail } from './nav.tsx';
import { MenuSheetContent, PhoneBar, PhoneTabs, Sidebar } from './sidebar.tsx';
import { SearchPalette } from './SearchPalette.tsx';
import './sidebar.css';
import './shell.css';

function Footer() {
  return (
    <footer className="footer wrap">
      <div className="footer-mark">
        <p className="display chrome-text footer-word">MONUMENTAL STREAMS</p>
        <p className="footer-line">All lives. All stories. One platform.</p>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <Link to="/about">About & honesty notes</Link>
        <Link to="/membership">Membership</Link>
        <Link to="/catalogue?prov=archive">Open archive</Link>
        <Link to="/my-world?tab=settings">Sound, motion & accessibility</Link>
      </nav>
      <p className="footer-fine mono">
        Preview build · Miami gateway · demonstration media is labelled as such · no original episodes are published yet
      </p>
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
  useCatalogue(); // shell only renders once the catalogue exists
  const prefs = usePreferenceSystems();
  useIdentitySync();
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

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Cursor enabled={prefs.cursor === 'organic'} />
      {!awake ? <Awakening onDone={() => setAwake(true)} /> : null}
      <div className="body-plan" inert={!awake || undefined}>
        <Sidebar onSearch={openSearch} />
        <PhoneBar onSearch={openSearch} onMenu={() => setMore(true)} />
        <ChapterRail />
        <main id="main" className="main" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer />
        <PhoneTabs onMenu={() => setMore(true)} />
      </div>
      <Dialog open={more} onClose={() => setMore(false)} title="Menu">
        <MenuSheetContent onSearch={openSearch} />
      </Dialog>
      <SearchPalette open={searching} onClose={() => setSearching(false)} />
      <Toaster />
      <RouteAnnouncer />
      <ScrollRestoration getKey={(loc) => loc.pathname} />
    </>
  );
}

