/**
 * NOT FOUND — a calm dead end over the quiet field, with a helpful way back: home (the one
 * primary action), search for what the address seemed to name, the world, or one step back.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useArrangement } from '../../stage/store.ts';
import { Button, ButtonLink } from '../../ui/controls.tsx';
import './notfound.css';

/** "/watch/coney-island" → "coney island": the last path segment, readable as a search. */
function searchTermFor(pathname: string): string {
  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  let term = last;
  try {
    term = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  return term.replace(/[-_+]+/g, ' ').trim();
}

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // there is somewhere to go back to only when this tab arrived here from another page of the app
  const [canGoBack] = useState(() => (window.history.state as { idx?: number } | null)?.idx ? true : false);
  useArrangement({ kind: 'quiet' });
  useEffect(() => {
    document.title = 'Not found · Monumental Streams';
  }, []);
  const term = searchTermFor(pathname);

  return (
    <div className="page wrap nf">
      <p className="eyebrow">Page not found</p>
      <h1 className="title-monument nf-title">
        No signal at this <em>address</em>
      </h1>
      <p className="lede nf-lede">
        <code className="nf-path">{pathname}</code> doesn’t lead anywhere in the archive. It may have moved, or the link was mistyped.
      </p>
      <div className="nf-actions">
        <ButtonLink to="/" variant="primary" icon="home">
          Back to Home
        </ButtonLink>
        <ButtonLink to={term ? `/catalogue?q=${encodeURIComponent(term)}` : '/catalogue'} icon="search">
          {term ? `Search for “${term}”` : 'Search the archive'}
        </ButtonLink>
        <ButtonLink to="/world" variant="quiet" icon="globe">
          Open World
        </ButtonLink>
        {canGoBack ? (
          <Button variant="quiet" icon="left" onClick={() => navigate(-1)}>
            Go back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
