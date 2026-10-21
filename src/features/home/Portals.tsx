/**
 * The quieter end of Home: the discovery tools (Take Me Somewhere, Culture Passport) as
 * secondary tiles whose studio loops wake on hover or focus, and the viewer's own My World
 * summary, whose counts change the moment something is saved, followed or stamped anywhere
 * on the page.
 */
import { useRef } from 'react';
import { Link } from 'react-router';
import type { ID } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { Art } from '../../ui/Pod.tsx';
import { useLoop } from '../programme/useLoop.ts';
import { myWorldSummary } from './home-model.ts';

export interface ToolSpec {
  key: 'somewhere' | 'passport';
  to: string;
  art: ID;
  name: string;
  line: string;
  icon: IconName;
}

export const TOOLS: ToolSpec[] = [
  { key: 'somewhere', to: '/somewhere', art: 'art:take-me-somewhere', name: 'Take Me Somewhere', line: 'Give it your time and a mood; it fits real runtimes into a route.', icon: 'compass' },
  { key: 'passport', to: '/passport', art: 'art:culture-passport', name: 'Culture Passport', line: 'Collect a stamp for each place you watch a story in.', icon: 'passport' },
];

export function Tools({ lines }: { lines: Record<ToolSpec['key'], string> }) {
  return (
    <ul className="home-tools">
      {TOOLS.map((t) => (
        <li key={t.key}>
          <Tool spec={t} stat={lines[t.key]} />
        </li>
      ))}
    </ul>
  );
}

function Tool({ spec, stat }: { spec: ToolSpec; stat: string }) {
  const cat = useCatalogue();
  const art = cat.artFor(spec.art);
  const vid = useRef<HTMLVideoElement>(null);
  const loop = useLoop(vid, art?.previewSmall ? { small: art.previewSmall, large: art.previewSmall } : null);
  return (
    <Link
      to={spec.to}
      className="home-tool"
      data-on={loop.playing || undefined}
      data-react="light"
      data-cursor="open"
      data-cursor-label="Open"
      onPointerEnter={loop.wake}
      onPointerLeave={loop.sleep}
      onFocus={loop.wake}
      onBlur={loop.sleep}
      onClick={() => sound.play('transition')}
    >
      <span className="home-tool-art" aria-hidden="true">
        <Art art={spec.art} alt="" />
        {art?.previewSmall ? <video ref={vid} className="home-tool-preview" muted loop playsInline preload="none" tabIndex={-1} /> : null}
      </span>
      <span className="home-tool-text">
        <span className="home-tool-name">
          <Icon name={spec.icon} size={18} className="home-tool-icon" />
          {spec.name}
        </span>
        <span className="home-tool-line">{spec.line}</span>
        <span className="home-tool-stat">{stat}</span>
      </span>
      <Icon name="arrow" size={18} className="home-tool-go" />
    </Link>
  );
}

const VITALS: { key: 'inProgress' | 'saved' | 'places' | 'journeys' | 'following' | 'stamps'; label: string; to: string }[] = [
  { key: 'inProgress', label: 'In progress', to: '/my-world?tab=continue' },
  { key: 'saved', label: 'Saved stories', to: '/my-world?tab=saved' },
  { key: 'places', label: 'Saved places', to: '/my-world?tab=saved' },
  { key: 'journeys', label: 'Journeys', to: '/my-world?tab=journeys' },
  { key: 'following', label: 'Following', to: '/my-world?tab=interests' },
  { key: 'stamps', label: 'Passport stamps', to: '/passport' },
];

export function MyWorldPanel() {
  const lib = useLibrary();
  const s = myWorldSummary(lib);
  return (
    <section className="section wrap home-me-section" id="home-my-world" aria-labelledby="home-my-world-title" data-reveal>
      <div className="home-me">
        <span className="home-me-core" aria-hidden="true" />
        <div className="home-me-copy">
          <h2 id="home-my-world-title" className="home-me-title">
            My World
          </h2>
          <p className="home-me-lede">
            {s.empty
              ? 'Save a story with its bookmark, follow what you love, start a journey — it all gathers here, on this device until you sign in.'
              : 'Everything you saved, watched and followed, in one place.'}
          </p>
          <ButtonLink to="/my-world" variant="chrome" icon="user" data-cursor-label="My World">
            Open My World
          </ButtonLink>
        </div>
        <ul className="home-me-vitals" aria-label="Your library">
          {VITALS.map((v) => (
            <li key={v.key}>
              <Link to={v.to} className="home-me-vital" data-zero={s[v.key] === 0 || undefined} onClick={() => sound.play('transition')}>
                <b>{s[v.key]}</b>
                <span>{v.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
