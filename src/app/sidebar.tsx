/**
 * Primary navigation — the client's exact thirteen destinations, in order — plus a separate
 * utility group (Search, Sound, Settings, Profile).
 *
 * Desktop: a tall glass sidebar with the gold-chrome wordmark. A liquid highlight glides to
 * whichever item the pointer or keyboard focus is on; the current destination glows gold.
 * Tablet: the sidebar collapses to an icon rail (labels appear on hover/focus) and can be
 * pinned open. Phones: a top bar with the wordmark and utilities, a floating tab bar for the
 * most used destinations and a full menu sheet that lists all thirteen.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { SECTIONS, sectionForPath, type SectionId } from '../../shared/sections.ts';
import { savedIds } from '../../shared/library.ts';
import { useLibrary, useSync } from '../state/library.ts';
import { useSession } from '../state/session.ts';
import { sound } from '../systems/sound/engine.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { SoundControl } from './SoundControl.tsx';

const RAIL_KEY = 'ms.nav.rail.v1';

function useActiveSection(): SectionId | null {
  const { pathname } = useLocation();
  return sectionForPath(pathname);
}

/** The liquid highlight: one element that glides between items (pointer or keyboard). */
function useGlide(listRef: RefObject<HTMLElement | null>, activeId: SectionId | null) {
  const [style, setStyle] = useState<{ top: number; height: number; opacity: number }>({ top: 0, height: 0, opacity: 0 });
  const place = useCallback(
    (el: HTMLElement | null) => {
      const list = listRef.current;
      if (!list || !el) return setStyle((s) => ({ ...s, opacity: 0 }));
      setStyle({ top: el.offsetTop, height: el.offsetHeight, opacity: 1 });
    },
    [listRef],
  );
  const toActive = useCallback(() => {
    place(listRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [listRef, place]);
  useLayoutEffect(() => {
    toActive();
  }, [activeId, toActive]);
  useEffect(() => {
    const onResize = () => toActive();
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(toActive).catch(() => undefined);
    return () => window.removeEventListener('resize', onResize);
  }, [toActive]);
  return { style, place, toActive };
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const active = useActiveSection();
  const lib = useLibrary();
  const { session } = useSession();
  const sync = useSync();
  const listRef = useRef<HTMLUListElement>(null);
  const { style, place, toActive } = useGlide(listRef, active);
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const savedCount = savedIds(lib).length;

  const toggleRail = () => {
    setRail((r) => {
      try {
        localStorage.setItem(RAIL_KEY, r ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !r;
    });
    sound.play('transition');
  };

  return (
    <aside className={`sidebar ${rail ? 'is-rail' : ''}`} aria-label="Monumental Streams">
      <Link to="/" className="side-wordmark" data-cursor-label="Home">
        <span className="side-wordmark-main">MONUMENTAL</span>
        <span className="side-wordmark-mark" aria-hidden="true">
          M
        </span>
        <span className="side-wordmark-sub">Streams</span>
        <span className="sr-only"> — home</span>
      </Link>

      <nav className="side-nav" aria-label="Main">
        <span className="side-glide" aria-hidden="true" style={{ transform: `translateY(${style.top}px)`, height: style.height, opacity: style.opacity }} />
        <ul ref={listRef} onPointerLeave={toActive} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && toActive()}>
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <NavLink
                  to={s.path}
                  end={s.path === '/'}
                  viewTransition
                  className="side-link"
                  data-nav={s.id}
                  aria-current={on ? 'page' : undefined}
                  data-cursor-label={s.label}
                  onPointerEnter={(e) => place(e.currentTarget.parentElement)}
                  onFocus={(e) => place(e.currentTarget.parentElement)}
                  onClick={() => sound.play('transition')}
                >
                  <span className="side-icon" aria-hidden="true">
                    <Icon name={s.icon as IconName} size={20} />
                  </span>
                  <span className="side-label">{s.label}</span>
                  {s.id === 'live' ? <span className="side-live-dot" aria-hidden="true" /> : null}
                  {s.id === 'my-world' && savedCount > 0 ? (
                    <span className="side-count" aria-label={`${savedCount} saved`}>
                      {savedCount}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="side-utils" aria-label="Utilities">
        <div className="side-tiles">
          <button type="button" className="side-tile" onClick={onSearch} aria-keyshortcuts="/" data-cursor-label="Search ( / )">
            <Icon name="search" size={19} />
            <span>Search</span>
          </button>
          <div className="side-tile side-sound">
            <SoundControl />
          </div>
          <Link to="/my-world?tab=settings" className="side-tile" data-cursor-label="Settings">
            <Icon name="settings" size={19} />
            <span>Settings</span>
          </Link>
        </div>
        <div className="side-foot">
          <Link
            to={session.user ? '/my-world' : '/account'}
            className="side-profile"
            data-cursor-label="Profile"
          >
            <span className="sr-only">Profile: </span>
            <span className="side-avatar" aria-hidden="true">
              {session.user ? session.user.name.slice(0, 1).toUpperCase() : <Icon name="user" size={18} />}
              <span className={`side-sync sync-${session.user ? sync.state : 'local'}`} />
            </span>
            <span className="side-profile-text">
              <span className="side-profile-name">{session.user ? session.user.name : 'Guest'}</span>
              <span className={`side-profile-tier ${session.membership.premium ? 'is-premium' : ''}`}>
                {session.membership.premium ? (session.membership.status === 'dev_preview' ? 'Premium · dev preview' : 'Premium') : session.user ? 'Free account' : 'Sign in'}
              </span>
            </span>
          </Link>
          <button type="button" className="side-collapse" onClick={toggleRail} aria-pressed={rail} aria-label={rail ? 'Expand navigation' : 'Collapse navigation'} title={rail ? 'Expand navigation' : 'Collapse navigation'}>
            <Icon name={rail ? 'right' : 'left'} size={16} />
          </button>
        </div>
      </nav>
    </aside>
  );
}

/** Phones: compact top bar (wordmark + utilities). */
export function PhoneBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { session } = useSession();
  return (
    <header className="phonebar">
      <Link to="/" className="phone-wordmark" aria-label="Monumental Streams — home">
        MONUMENTAL
      </Link>
      <div className="phone-tools">
        <button type="button" className="icon-btn btn-quiet" aria-label="Search" onClick={onSearch}>
          <Icon name="search" />
        </button>
        <SoundControl />
        <Link to={session.user ? '/my-world' : '/account'} className="icon-btn btn-quiet" aria-label={session.user ? 'Profile' : 'Profile — sign in'}>
          <Icon name="user" />
        </Link>
        <button type="button" className="icon-btn btn-quiet" aria-label="Menu" aria-haspopup="dialog" onClick={onMenu}>
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}

/** Phones: the most used destinations within thumb reach; the menu holds all thirteen. */
export function PhoneTabs({ onMenu }: { onMenu: () => void }) {
  const active = useActiveSection();
  const tabs = SECTIONS.filter((s) => ['home', 'world', 'time-machine', 'my-world'].includes(s.id));
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map((s) => (
        <NavLink key={s.id} to={s.path} end={s.path === '/'} viewTransition className="tab" data-nav={s.id} aria-current={active === s.id ? 'page' : undefined} onClick={() => sound.play('transition')}>
          <Icon name={s.icon as IconName} size={22} />
          <span>{s.label}</span>
        </NavLink>
      ))}
      <button type="button" className="tab" onClick={onMenu} aria-haspopup="dialog">
        <Icon name="menu" size={22} />
        <span>Menu</span>
      </button>
    </nav>
  );
}

/** The full menu (phones, and the "all destinations" sheet): all thirteen + utilities. */
export function MenuSheetContent({ onSearch }: { onSearch: () => void }) {
  const active = useActiveSection();
  return (
    <div className="menu-sheet">
      <ul className="menu-grid">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link to={s.path} className="menu-item" aria-current={active === s.id ? 'page' : undefined}>
              <Icon name={s.icon as IconName} size={22} />
              <span>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="menu-utils">
        <button type="button" className="btn btn-chrome" onClick={onSearch}>
          <Icon name="search" size={18} />
          <span>Search</span>
        </button>
        <Link to="/my-world?tab=settings" className="btn btn-chrome">
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </Link>
        <Link to="/membership" className="btn btn-chrome">
          <Icon name="diamond" size={18} />
          <span>Membership</span>
        </Link>
        <Link to="/about" className="btn btn-chrome">
          <Icon name="info" size={18} />
          <span>About</span>
        </Link>
      </div>
    </div>
  );
}
