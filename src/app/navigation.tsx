/**
 * Primary navigation — the client's exact thirteen destinations, in order — plus a separate
 * utility group (Search, Sound, Settings, Profile).
 *
 * THE VERTEBRAL INDEX. On desktop the destinations hang on a slim luminous spine down the
 * left edge: each one is a vertebra carrying its glyph in its own hue, with its label always
 * visible; the current destination's vertebra is lit gold. Hovering or focusing a category
 * vertebra previews that category in the living world (its stories light up) and lets go on
 * leave — the index and the world answer each other. Tablets get the same spine as a rail
 * (labels surface on hover/focus); it can also be collapsed on desktop. Phones get a compact
 * top bar, a bottom bar (Home, World, Time Machine, My World, Menu) and a menu sheet holding
 * all thirteen plus the utilities.
 *
 * Everything is a real link or button in DOM order; the 3D world is never the only way.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { savedIds } from '../../shared/library.ts';
import { SECTIONS, sectionForPath, type SectionId } from '../../shared/sections.ts';
import { useCatalogue } from '../state/catalogue.tsx';
import { useLibrary, useSync } from '../state/library.ts';
import { useSession } from '../state/session.ts';
import { sound } from '../systems/sound/engine.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { SoundControl } from './SoundControl.tsx';
import { endPreview, startPreview } from './world.ts';
import './navigation.css';

const RAIL_KEY = 'ms.nav.rail.v1';
/** A breath in the spine before these destinations: explore · categories · yours. */
const GROUP_START = new Set<SectionId>(['live', 'my-world']);

function useActiveSection(): SectionId | null {
  const { pathname } = useLocation();
  return sectionForPath(pathname);
}

/** Hover (with a little intent delay) or focus on a destination previews it in the world. */
function useWorldPreview() {
  const cat = useCatalogue();
  const timer = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      endPreview();
    },
    [],
  );
  return {
    enter(id: SectionId, delay: number) {
      window.clearTimeout(timer.current);
      if (delay <= 0) startPreview(cat, id);
      else timer.current = window.setTimeout(() => startPreview(cat, id), delay);
    },
    leave() {
      window.clearTimeout(timer.current);
      endPreview();
    },
  };
}

function profileText(session: ReturnType<typeof useSession>['session']) {
  const name = session.user ? session.user.name : 'Guest';
  const tier = session.membership.premium ? (session.membership.status === 'dev_preview' ? 'Premium · dev preview' : 'Premium') : session.user ? 'Free account' : 'Sign in';
  return { name, tier };
}

/* ───────────── Desktop + tablet: the vertebral index ───────────── */

export function SpineIndex({ onSearch }: { onSearch: () => void }) {
  const active = useActiveSection();
  const lib = useLibrary();
  const { session } = useSession();
  const sync = useSync();
  const preview = useWorldPreview();
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const savedCount = savedIds(lib).length;
  const { name, tier } = profileText(session);

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
    <aside className={`index ${rail ? 'is-rail' : ''}`} aria-label="Monumental Streams">
      <Link to="/" className="index-mark" data-cursor-label="Home">
        <span className="index-mark-word">MONUMENTAL</span>
        <span className="index-mark-sub">Streams</span>
        <span className="index-mark-glyph" aria-hidden="true">
          M
        </span>
        <span className="sr-only"> — home</span>
      </Link>

      <nav className="index-nav" aria-label="Main">
        <span className="index-cord" aria-hidden="true" />
        <ul className="index-spine" onPointerLeave={preview.leave}>
          {SECTIONS.map((s, i) => {
            const on = active === s.id;
            return (
              <li key={s.id} data-group-start={GROUP_START.has(s.id) || undefined} style={{ ['--i' as string]: i }}>
                <NavLink
                  to={s.path}
                  end={s.path === '/'}
                  viewTransition
                  className="vertebra"
                  data-nav={s.id}
                  data-hue={s.id}
                  aria-current={on ? 'page' : undefined}
                  data-cursor-label={s.label}
                  onPointerEnter={() => preview.enter(s.id, 90)}
                  onFocus={() => preview.enter(s.id, 0)}
                  onBlur={preview.leave}
                  onClick={() => sound.play('transition')}
                >
                  <span className="vertebra-bone" aria-hidden="true">
                    <Icon name={s.icon as IconName} size={16} strokeWidth={1.7} />
                  </span>
                  <span className="vertebra-label">{s.label}</span>
                  {s.id === 'live' ? <span className="vertebra-live" aria-hidden="true" /> : null}
                  {s.id === 'my-world' && savedCount > 0 ? (
                    <span className="vertebra-count" aria-label={`${savedCount} saved`}>
                      {savedCount}
                    </span>
                  ) : null}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="index-utils" aria-label="Utilities">
        <button type="button" className="util" onClick={onSearch} aria-keyshortcuts="/" data-cursor-label="Search ( / )">
          <span className="util-glyph" aria-hidden="true">
            <Icon name="search" size={17} />
          </span>
          <span className="util-label">Search</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
        <div className="util util-sound">
          <SoundControl />
        </div>
        <Link to="/my-world?tab=settings" className="util" data-cursor-label="Settings">
          <span className="util-glyph" aria-hidden="true">
            <Icon name="settings" size={17} />
          </span>
          <span className="util-label">Settings</span>
        </Link>
        <div className="index-foot">
          <Link to={session.user ? '/my-world' : '/account'} className="util util-profile" data-cursor-label="Profile">
            <span className="sr-only">Profile: </span>
            <span className="util-avatar" aria-hidden="true">
              {session.user ? session.user.name.slice(0, 1).toUpperCase() : <Icon name="user" size={16} />}
              <span className={`util-sync sync-${session.user ? sync.state : 'local'}`} />
            </span>
            <span className="util-profile-text">
              <span className="util-profile-name">{name}</span>
              <span className={`util-profile-tier ${session.membership.premium ? 'is-premium' : ''}`}>{tier}</span>
            </span>
          </Link>
          <button
            type="button"
            className="index-collapse"
            onClick={toggleRail}
            aria-pressed={rail}
            aria-label={rail ? 'Expand navigation' : 'Collapse navigation'}
            title={rail ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Icon name={rail ? 'right' : 'left'} size={15} />
          </button>
        </div>
      </nav>
    </aside>
  );
}

/* ───────────── Phones ───────────── */

/** Compact top bar: wordmark, Search, sound, Profile. Content comes first. */
export function PhoneBar({ onSearch }: { onSearch: () => void }) {
  const { session } = useSession();
  const { name } = profileText(session);
  return (
    <header className="phonebar">
      <Link to="/" className="phone-mark" aria-label="Monumental Streams — home">
        <span aria-hidden="true">MONUMENTAL</span>
      </Link>
      <div className="phone-tools">
        <button type="button" className="icon-btn btn-quiet" aria-label="Search" aria-keyshortcuts="/" onClick={onSearch}>
          <Icon name="search" />
        </button>
        <SoundControl compact />
        <Link to={session.user ? '/my-world' : '/account'} className="icon-btn btn-quiet phone-profile" aria-label={`Profile: ${name}${session.user ? '' : ' — sign in'}`}>
          {session.user ? <span className="phone-avatar">{session.user.name.slice(0, 1).toUpperCase()}</span> : <Icon name="user" />}
        </Link>
      </div>
    </header>
  );
}

const PHONE_TABS: SectionId[] = ['home', 'world', 'time-machine', 'my-world'];

/** Bottom bar: the most used destinations within thumb reach; the menu holds all thirteen. */
export function PhoneTabs({ onMenu }: { onMenu: () => void }) {
  const active = useActiveSection();
  const tabs = SECTIONS.filter((s) => PHONE_TABS.includes(s.id));
  return (
    <nav className="tabbar" aria-label="Primary">
      {tabs.map((s) => (
        <NavLink
          key={s.id}
          to={s.path}
          end={s.path === '/'}
          viewTransition
          className="tab"
          data-nav={s.id}
          data-hue={s.id}
          aria-current={active === s.id ? 'page' : undefined}
          onClick={() => sound.play('transition')}
        >
          <span className="tab-mark" aria-hidden="true" />
          <Icon name={s.icon as IconName} size={21} />
          <span className="tab-label">{s.label}</span>
        </NavLink>
      ))}
      <button type="button" className="tab" onClick={onMenu} aria-haspopup="dialog" data-current={active && !PHONE_TABS.includes(active) ? '' : undefined}>
        <span className="tab-mark" aria-hidden="true" />
        <Icon name="menu" size={21} />
        <span className="tab-label">Menu</span>
      </button>
    </nav>
  );
}

/** The full menu (phones): all thirteen destinations as one spine, plus the utilities. */
export function MenuSheetContent({ onSearch }: { onSearch: () => void }) {
  const active = useActiveSection();
  return (
    <div className="menu-sheet">
      <ul className="menu-spine">
        {SECTIONS.map((s) => (
          <li key={s.id} data-group-start={GROUP_START.has(s.id) || undefined}>
            <Link to={s.path} className="menu-item" data-hue={s.id} aria-current={active === s.id ? 'page' : undefined} onClick={() => sound.play('transition')}>
              <span className="vertebra-bone" aria-hidden="true">
                <Icon name={s.icon as IconName} size={16} strokeWidth={1.7} />
              </span>
              <span className="menu-item-label">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="menu-utils">
        <button type="button" className="btn btn-ghost" onClick={onSearch}>
          <Icon name="search" size={18} />
          <span>Search</span>
        </button>
        <Link to="/my-world?tab=settings" className="btn btn-ghost">
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </Link>
        <Link to="/membership" className="btn btn-ghost">
          <Icon name="diamond" size={18} />
          <span>Membership</span>
        </Link>
        <Link to="/about" className="btn btn-ghost">
          <Icon name="info" size={18} />
          <span>About</span>
        </Link>
      </div>
    </div>
  );
}
