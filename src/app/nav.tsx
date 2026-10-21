/**
 * The chapter rail: on long pages, a slim right-edge column showing scroll progress and one
 * node per page chapter (registered with useChapters). Desktop only.
 */
import { jumpTo, useChapterState } from './chapters.ts';

/** Slim right-edge rail: scroll progress plus one node per page chapter. Desktop only. */
export function ChapterRail() {
  const { list, active, progress } = useChapterState();
  if (list.length < 2) return null;
  return (
    <nav className="chapter-rail" aria-label="Chapters on this page">
      <span className="chapter-rail-track" aria-hidden="true">
        <span className="chapter-rail-fill" style={{ transform: `scaleY(${progress})` }} />
      </span>
      <ol>
        {list.map((c, i) => (
          <li key={c.id}>
            <button type="button" className="chapter-node" aria-current={active === c.id ? 'location' : undefined} onClick={() => jumpTo(c.id)} data-cursor-label={c.label}>
              <span className="chapter-dot" aria-hidden="true" />
              <span className="chapter-name" aria-hidden="true">
                {c.label}
              </span>
              <span className="sr-only">
                Chapter {i + 1}: {c.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
