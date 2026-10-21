/**
 * "My World › Account" — pages that live under My World (account, membership) say so, so the
 * viewer always knows where they are and has one step back to their own space.
 */
import { Link } from 'react-router';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import './crumbs.css';

export function MyWorldCrumbs({ here, tab }: { here: string; tab?: string }) {
  return (
    <nav className="mw-crumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={tab ? `/my-world?tab=${tab}` : '/my-world'} onClick={() => sound.play('transition')}>
            <Icon name="user" size={15} />
            <span>My World</span>
          </Link>
        </li>
        <li aria-current="page">
          <Icon name="right" size={14} />
          <span>{here}</span>
        </li>
      </ol>
    </nav>
  );
}
