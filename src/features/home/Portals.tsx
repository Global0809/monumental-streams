/**
 * The quieter end of Home: the discovery tools (Take Me Somewhere, Culture Passport) as two
 * typographic invitations, and the viewer's own My World summary, whose counts change the
 * moment something is saved, followed or stamped anywhere on the page. Pointing at the
 * summary lights the viewer's saved stories in the world.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { kindOf } from '../../../shared/catalogue.ts';
import { savedIds } from '../../../shared/library.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { useLibrary } from '../../state/library.ts';
import { sound } from '../../systems/sound/engine.ts';
import { ButtonLink } from '../../ui/controls.tsx';
import { Icon, type IconName } from '../../ui/Icon.tsx';
import { myWorldSummary } from './home-model.ts';
import { useLightZone } from './light.ts';

export interface ToolSpec {
  key: 'somewhere' | 'passport';
  to: string;
  name: string;
  line: string;
  icon: IconName;
}

export const TOOLS: ToolSpec[] = [
  { key: 'somewhere', to: '/somewhere', name: 'Take Me Somewhere', line: 'Give it your time and a mood; it fits real runtimes into a route.', icon: 'compass' },
  { key: 'passport', to: '/passport', name: 'Culture Passport', line: 'Collect a stamp for each place you watch a story in.', icon: 'passport' },
];

export function Tools({ lines }: { lines: Record<ToolSpec['key'], string> }) {
  return (
    <ul className="home-tools">
      {TOOLS.map((t) => (
        <li key={t.key}>
          <Link to={t.to} className="home-tool" data-cursor="open" data-cursor-label="Open" onClick={() => sound.play('transition')}>
            <span className="home-tool-name">
              <Icon name={t.icon} size={20} className="home-tool-icon" />
              {t.name}
            </span>
            <span className="home-tool-line">{t.line}</span>
            <span className="home-tool-stat">{lines[t.key]}</span>
          </Link>
        </li>
      ))}
    </ul>
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
  const cat = useCatalogue();
  const lib = useLibrary();
  const s = myWorldSummary(lib);
  const saved = useMemo(() => savedIds(lib).filter((id) => kindOf(id) === 'video' && !!cat.get(id)), [cat, lib]);
  const zone = useLightZone(() => saved);
  return (
    <section className="section wrap home-me" id="home-my-world" aria-labelledby="home-my-world-title" data-reveal>
      <div className="home-col" {...zone}>
        <h2 id="home-my-world-title" className="home-h2">
          My World
        </h2>
        <p className="home-support home-me-line">
          {s.empty
            ? 'Save a story with its bookmark, follow what you love, start a journey: it all gathers here, on this device until you sign in.'
            : 'Everything you saved, watched and followed, in one place.'}
        </p>
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
        <ButtonLink to="/my-world" variant="chrome" icon="user" data-cursor-label="My World">
          Open My World
        </ButtonLink>
      </div>
    </section>
  );
}
