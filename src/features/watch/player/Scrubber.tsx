/**
 * The seek bar. A pearl-to-gold fill, buffered ranges in soft white, small gaps at chapter
 * boundaries, a gold knob. Pointer + touch drag with pointer capture; role="slider" with arrow
 * (±5 s), Page (±10%) and Home/End keys ([ and ] step chapters from anywhere on the page).
 *
 * Reactive details: under the pointer a ghost fill previews where a click would land; near
 * a chapter boundary the hover point and the drag are pulled onto it (magnetism) — the joint
 * lights up and, while dragging, ticks (and buzzes on phones that can). Hover, drag or
 * keyboard focus shows a tooltip with the time, the chapter name and a sprite frame.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { timecode } from '../../../lib/format.ts';
import { sound } from '../../../systems/sound/engine.ts';
import { bufferedSegments, clamp, magnetTime, SEEK_STEP, seekValueText } from './time.ts';
import { chapterAt, lastStartedIndex, type Cue, type ThumbCue } from './vtt.ts';

export function Scrubber({
  videoRef,
  time,
  duration,
  playing,
  buffered,
  chapters,
  thumbs,
  onSeek,
  onScrub,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  time: number;
  duration: number;
  playing: boolean;
  buffered: { start: number; end: number }[];
  chapters: Cue[];
  thumbs: ThumbCue[];
  onSeek: (t: number) => void;
  onScrub: (active: boolean) => void;
}) {
  const hit = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [snapped, setSnapped] = useState<number | null>(null);
  const [keyFocus, setKeyFocus] = useState(false);
  const lastSnap = useRef<number | null>(null);
  const dur = duration;
  const dragging = drag !== null;
  const shown = drag ?? time;

  const joints = useMemo(() => (dur > 0 ? chapters.map((c) => c.start).filter((s) => s > 0.5 && s < dur - 0.5) : []), [chapters, dur]);

  // Fill and knob follow the element every frame while playing; otherwise mirror state.
  const mode = playing && !dragging ? 'live' : `still:${shown}`;
  useEffect(() => {
    const el = hit.current;
    if (!el) return;
    const set = (t: number) => el.style.setProperty('--pl-p', String(dur > 0 ? clamp(t / dur, 0, 1) : 0));
    if (mode !== 'live') {
      set(shown);
      return;
    }
    let raf = 0;
    const loop = () => {
      set(videoRef.current?.currentTime ?? time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dur]);

  /** Pointer → time, pulled onto a nearby chapter boundary. */
  const at = (e: PointerEvent, magnet = true) => {
    const r = hit.current!.getBoundingClientRect();
    const raw = dur > 0 && r.width > 0 ? clamp((e.clientX - r.left) / r.width, 0, 1) * dur : 0;
    if (!magnet) return { t: raw, joint: null };
    return magnetTime(raw, dur, r.width, joints);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!(dur > 0)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    setKeyFocus(false);
    const p = at(e);
    lastSnap.current = p.joint;
    setSnapped(p.joint);
    setDrag(p.t);
    onScrub(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!(dur > 0)) return;
    const p = at(e);
    if (dragging) {
      setDrag(p.t);
      if (p.joint !== null && p.joint !== lastSnap.current) {
        sound.play('tick');
        if (e.pointerType === 'touch') navigator.vibrate?.(8);
      }
      lastSnap.current = p.joint;
      setSnapped(p.joint);
    } else if (e.pointerType !== 'touch') {
      setHover(p.t);
      setSnapped(p.joint);
    }
  };
  const finish = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!dragging) return;
    const t = at(e).t;
    setDrag(null);
    lastSnap.current = null;
    if (e.pointerType === 'touch') setSnapped(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (commit) onSeek(t);
    onScrub(false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!(dur > 0)) return;
    const cur = videoRef.current?.currentTime ?? time;
    let t: number;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        t = cur - SEEK_STEP;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        t = cur + SEEK_STEP;
        break;
      case 'PageDown':
        t = cur - dur * 0.1;
        break;
      case 'PageUp':
        t = cur + dur * 0.1;
        break;
      case 'Home':
        t = 0;
        break;
      case 'End':
        t = dur;
        break;
      default:
        return;
    }
    e.preventDefault();
    setKeyFocus(true);
    onSeek(clamp(t, 0, dur));
  };

  const tipTime = drag ?? hover ?? (keyFocus ? time : null);
  const tipChapter = tipTime !== null ? chapterAt(chapters, tipTime) : null;
  const thumb = tipTime !== null && thumbs.length ? thumbs[Math.max(0, lastStartedIndex(thumbs, tipTime))] : null;
  const nowChapter = chapterAt(chapters, shown);
  const segments = bufferedSegments(buffered, dur);
  const lit = tipTime !== null && !keyFocus ? snapped : null;

  return (
    <div
      ref={hit}
      className="pl-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.round(dur))}
      aria-valuenow={Math.round(clamp(shown, 0, dur || 0))}
      aria-valuetext={`${seekValueText(shown, dur)}${nowChapter ? `, chapter: ${nowChapter.text}` : ''}`}
      aria-disabled={!(dur > 0) || undefined}
      data-dragging={dragging || undefined}
      data-snapped={lit !== null || undefined}
      data-cursor="drag"
      data-cursor-label="Scrub"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onPointerLeave={() => {
        setHover(null);
        if (!dragging) setSnapped(null);
      }}
      onKeyDown={onKey}
      onFocus={(e) => setKeyFocus(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setKeyFocus(false)}
      style={tipTime !== null && dur > 0 ? ({ ['--pl-h' as string]: String(clamp(tipTime / dur, 0, 1)) } as CSSProperties) : undefined}
    >
      <div className="pl-tendon" aria-hidden="true">
        {segments.map((s, i) => (
          <span key={i} className="pl-buffered" style={{ left: `${s.left}%`, width: `${s.width}%` }} />
        ))}
        {hover !== null && !dragging ? <span className="pl-ghost" /> : null}
        <span className="pl-fill" />
        {joints.map((j) => (
          <span key={j} className="pl-joint" data-on={lit === j || undefined} style={{ left: `${(j / dur) * 100}%` }} />
        ))}
        <span className="pl-knob" />
      </div>
      {tipTime !== null && dur > 0 ? (
        <div className={`pl-tip ${thumb && thumb.w ? 'has-thumb' : ''}`} data-snapped={lit !== null || undefined} aria-hidden="true">
          {thumb && thumb.w ? (
            <span
              className="pl-thumb"
              style={{ width: thumb.w, height: thumb.h, backgroundImage: `url("${thumb.url}")`, backgroundPosition: `-${thumb.x}px -${thumb.y}px` }}
            />
          ) : null}
          {tipChapter ? <span className="pl-tip-chapter">{tipChapter.text}</span> : null}
          <span className="pl-tip-time mono">{timecode(tipTime)}</span>
        </div>
      ) : null}
    </div>
  );
}
