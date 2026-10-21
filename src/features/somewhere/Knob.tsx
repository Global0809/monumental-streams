/**
 * A rotary knob that is a real control: role="slider" with aria-valuetext, arrow/Page/Home/End
 * keys, drag-to-rotate with pointer capture (pressing on the dial jumps to the nearest detent),
 * snapping detents with a tick sound, and a visible text value with step buttons for touch.
 */
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { sound } from '../../systems/sound/engine.ts';
import { Icon } from '../../ui/Icon.tsx';
import { indexForAngle, knobAngle, type DialOption } from './logic.ts';

/** Fraction of the dial radius around the centre that ignores pointer angle (too jittery). */
const DEAD_ZONE = 0.2;

export function Knob({ name, options, value, onChange, flag }: { name: string; options: DialOption[]; value: string; onChange: (value: string) => void; flag?: string }) {
  const labelId = useId();
  const flagId = useId();
  const dialRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = useRef(index);
  current.current = index;
  const label = options[index]?.label ?? '';

  const commit = (i: number) => {
    const next = Math.min(n - 1, Math.max(0, i));
    if (next === current.current || !options[next]) return;
    current.current = next;
    sound.play('tick');
    onChange(options[next].value);
  };

  const fromPointer = (e: PointerEvent) => {
    const el = dialRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < (r.width / 2) * DEAD_ZONE) return null;
    return indexForAngle((Math.atan2(dx, -dy) * 180) / Math.PI, n);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // no text selection / ghost drag; focus is moved explicitly
    dialRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    const i = fromPointer(e);
    if (i !== null) commit(i);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const i = fromPointer(e);
    if (i !== null) commit(i);
  };
  const endDrag = () => setDragging(false);

  const onKeyDown = (e: KeyboardEvent) => {
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = index - 1;
        break;
      case 'PageUp':
        next = index + 3;
        break;
      case 'PageDown':
        next = index - 3;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    commit(next);
  };

  return (
    <div className="tms-knob" data-flag={flag ? '' : undefined}>
      <p className="tms-knob-name" id={labelId}>
        {name}
      </p>
      <div
        ref={dialRef}
        className="tms-dial"
        role="slider"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, n - 1)}
        aria-valuenow={index}
        aria-valuetext={label}
        aria-describedby={flag ? flagId : undefined}
        data-dragging={dragging || undefined}
        data-cursor="drag"
        data-cursor-label="Turn"
        style={{ '--tms-angle': `${knobAngle(index, n)}deg` } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <svg className="tms-dial-ticks" viewBox="0 0 100 100" aria-hidden="true">
          {options.map((o, i) => (
            <line key={o.value || `any-${i}`} x1="50" y1="2.5" x2="50" y2={i === index ? 10.5 : 7.5} transform={`rotate(${knobAngle(i, n)} 50 50)`} data-on={i === index || undefined} />
          ))}
        </svg>
        <span className="tms-dial-skirt" aria-hidden="true" />
        <span className="tms-dial-cap" aria-hidden="true">
          <span className="tms-dial-pointer" />
        </span>
      </div>
      <div className="tms-knob-readout">
        {/* Pointer conveniences only — the slider itself carries the value for assistive tech and keyboards. */}
        <button type="button" className="tms-knob-step" tabIndex={-1} aria-hidden="true" disabled={index <= 0} onClick={() => commit(index - 1)}>
          <Icon name="left" size={16} />
        </button>
        <p className="tms-knob-value" aria-hidden="true">
          {label}
        </p>
        <button type="button" className="tms-knob-step" tabIndex={-1} aria-hidden="true" disabled={index >= n - 1} onClick={() => commit(index + 1)}>
          <Icon name="right" size={16} />
        </button>
      </div>
      {flag ? (
        <p className="tms-knob-flag" id={flagId}>
          {flag}
        </p>
      ) : null}
    </div>
  );
}
