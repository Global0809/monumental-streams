/**
 * One passport seal per stop: a soft chrome disc while unstamped, and a gold seal once earned
 * (place name on the rim, country code, stop number and the date it was stamped).
 * The SVG is decorative; the caption beneath carries the same facts as text.
 */
import { useId, type CSSProperties } from 'react';
import type { Place } from '../../../shared/types.ts';
import { stampDate, tiltFor, type StampInfo } from './logic.ts';

const FRESH_MS = 15 * 60_000;

export function Stamp({ place, index, stamp, status }: { place: Place; index: number; stamp: StampInfo | null; status: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const n = String(index + 1).padStart(2, '0');
  const name = place.name.toUpperCase();
  // Fit the rim text: ~125 units of arc, glyphs ≈ 0.72em each with tracking.
  const size = Math.max(6, Math.min(9.5, 125 / (name.length * 0.72)));
  const fresh = !!stamp && Date.now() - stamp.at < FRESH_MS;

  return (
    <li className="pp-stamp" data-on={stamp ? '' : undefined} data-fresh={fresh || undefined}>
      <svg className="pp-stamp-svg" viewBox="0 0 120 120" aria-hidden="true" style={{ '--pp-tilt': `${stamp ? tiltFor(place.id) : 0}deg` } as CSSProperties}>
        {stamp ? (
          <g className="pp-seal-on">
            <defs>
              <path id={`${uid}-top`} d="M15 60 A45 45 0 0 1 105 60" />
              <path id={`${uid}-bot`} d="M9 60 A51 51 0 0 0 111 60" />
            </defs>
            <circle cx="60" cy="60" r="57" className="pp-seal-disc" />
            <circle cx="60" cy="60" r="56" className="pp-stamp-rim" />
            <circle cx="60" cy="60" r="39" className="pp-stamp-ring" />
            <text className="pp-stamp-arc" style={{ fontSize: size }}>
              <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
                {name}
              </textPath>
            </text>
            <text className="pp-stamp-arc pp-stamp-arc-sm">
              <textPath href={`#${uid}-bot`} startOffset="50%" textAnchor="middle">
                CULTURE PASSPORT
              </textPath>
            </text>
            <text x="60" y="44" textAnchor="middle" className="pp-stamp-n">
              № {n}
            </text>
            <text x="60" y="65" textAnchor="middle" className="pp-stamp-cc">
              {place.country}
            </text>
            <line x1="40" x2="80" y1="70.5" y2="70.5" className="pp-stamp-rule" />
            <text x="60" y="80" textAnchor="middle" className="pp-stamp-date">
              {stampDate(stamp.at)}
            </text>
          </g>
        ) : (
          <g className="pp-stamp-empty">
            <circle cx="60" cy="60" r="54" className="pp-seal-disc" />
            <circle cx="60" cy="60" r="40" className="pp-stamp-empty-in" />
            <text x="60" y="71" textAnchor="middle">
              {index + 1}
            </text>
          </g>
        )}
      </svg>
      <p className="pp-stamp-cap">
        <span className="pp-stamp-name">
          <span className="sr-only">Stop {index + 1}: </span>
          {place.name}
        </span>
        <span className="pp-stamp-status">{status}</span>
      </p>
    </li>
  );
}

/** Shared SVG paint for the seals — rendered once per page. Colours come from the CSS tokens. */
export function SealDefs() {
  return (
    <svg width="0" height="0" className="pp-defs" aria-hidden="true" focusable="false">
      <radialGradient id="pp-seal-chrome" cx="34%" cy="26%" r="82%">
        <stop offset="0" className="pp-seal-chrome-hi" />
        <stop offset="0.55" className="pp-seal-chrome-mid" />
        <stop offset="1" className="pp-seal-chrome-lo" />
      </radialGradient>
      <radialGradient id="pp-seal-gold" cx="34%" cy="26%" r="82%">
        <stop offset="0" className="pp-seal-gold-hi" />
        <stop offset="0.6" className="pp-seal-gold-mid" />
        <stop offset="1" className="pp-seal-gold-lo" />
      </radialGradient>
    </svg>
  );
}
