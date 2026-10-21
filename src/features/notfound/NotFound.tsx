import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { ButtonLink } from '../../ui/controls.tsx';
import { Art } from '../../ui/Pod.tsx';
import './notfound.css';

export default function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = 'Not found · Monumental Streams';
  }, []);
  return (
    <div className="page nf">
      <div className="nf-backdrop" aria-hidden="true">
        <Art art="art:living-membrane" alt="" sizes="large" eager className="nf-backdrop-art" />
        <span className="nf-backdrop-shade" />
      </div>
      <div className="wrap nf-inner">
        <p className="kicker">Page not found</p>
        <h1 className="page-title nf-title">
          No signal at this <em>address</em>
        </h1>
        <p className="page-lede nf-lede">
          <code className="nf-path">{pathname}</code> doesn’t lead anywhere in the organism. It may have moved, or the link was mistyped.
        </p>
        <div className="nf-actions">
          <ButtonLink to="/" variant="primary">
            Back to Stream
          </ButtonLink>
          <ButtonLink to="/world" icon="globe">
            Open the atlas
          </ButtonLink>
          <ButtonLink to={`/catalogue?q=${encodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '')}`} icon="search">
            Search for it
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
