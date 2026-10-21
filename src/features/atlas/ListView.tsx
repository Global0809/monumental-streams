/**
 * The list — the accessible alternative to the globe and map, always one tap away. A searchable
 * hierarchy (country/territory → state/county → city → neighbourhood/district/venue) with kind
 * labels and story counts. Search keeps the ancestors of every match so context is never lost.
 * Under the lens the counts are matches, and "stories only" prunes empty branches.
 */
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ID } from '../../../shared/types.ts';
import { plural } from '../../lib/format.ts';
import { sound } from '../../systems/sound/engine.ts';
import { EmptyState } from '../../ui/feedback.tsx';
import { Icon } from '../../ui/Icon.tsx';
import { filterTree, KIND_LABEL, type TreeNode } from './model.ts';
import { useHot } from './parts.tsx';

export default function ListView({ tree, selectedId, hrefFor, lensed = false, storiesOnly = false }: { tree: TreeNode[]; selectedId: ID | null; hrefFor: (slug: string) => string; lensed?: boolean; storiesOnly?: boolean }) {
  const [q, setQ] = useState('');
  const id = useId();
  const { tree: shown, matches } = useMemo(() => filterTree(tree, q), [tree, q]);
  const query = q.trim();

  return (
    <div className="atlas-list">
      <div className="atlas-list-head">
        <label htmlFor={id} className="atlas-list-label">
          Find a place
        </label>
        <div className="atlas-list-search">
          <Icon name="search" size={18} />
          <input
            id={id}
            className="input atlas-list-input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="City, neighbourhood, borough, alias…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <p className="atlas-list-count" aria-live="polite" aria-atomic="true">
          {query ? `${plural(matches, 'place')} match “${query}”` : storiesOnly ? `${plural(matches, 'place')} with stories` : `${plural(matches, 'place')} mapped`}
        </p>
      </div>
      {shown.length ? (
        <ul className="atlas-tree" aria-label="Places by region">
          {shown.map((n) => (
            <TreeItem key={n.place.id} node={n} depth={0} selectedId={selectedId} hrefFor={hrefFor} searching={!!query} lensed={lensed} />
          ))}
        </ul>
      ) : (
        query ? (
          <EmptyState icon="globe" title="Nothing mapped by that name">
            <p>Try another spelling, an alias like “Calle Ocho”, or a kind of place such as “borough”.</p>
          </EmptyState>
        ) : (
          <EmptyState icon="filter" title="No places hold matching stories yet">
            <p>Widen the lens above — another category, era or access level — or turn off “Stories only”.</p>
          </EmptyState>
        )
      )}
    </div>
  );
}

function TreeItem({ node, depth, selectedId, hrefFor, searching, lensed }: { node: TreeNode; depth: number; selectedId: ID | null; hrefFor: (slug: string) => string; searching: boolean; lensed: boolean }) {
  const p = node.place;
  const current = p.id === selectedId;
  const hot = useHot(p.id);
  return (
    <li className="atlas-tree-item" data-depth={Math.min(depth, 4)}>
      <Link
        to={hrefFor(p.slug)}
        className="atlas-tree-link"
        aria-current={current ? 'page' : undefined}
        data-match={searching && node.match ? 'true' : undefined}
        data-status={p.status}
        data-zero={lensed && node.count === 0 ? true : undefined}
        onClick={() => sound.play('select')}
        {...hot}
      >
        <span className="atlas-tree-node" aria-hidden="true" />
        <span className="atlas-tree-name">{p.name}</span>
        <span className="atlas-tree-kind">
          <span className="sr-only">, </span>
          {KIND_LABEL[p.kind]}
        </span>
        <span className="atlas-tree-count">
          <span className="sr-only">, </span>
          {lensed ? plural(node.count, 'match', 'matches') : p.status === 'expanding' && node.count === 0 ? 'Expanding' : plural(node.count, 'story', 'stories')}
        </span>
      </Link>
      {node.children.length ? (
        <ul className="atlas-tree-children">
          {node.children.map((c) => (
            <TreeItem key={c.place.id} node={c} depth={depth + 1} selectedId={selectedId} hrefFor={hrefFor} searching={searching} lensed={lensed} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
