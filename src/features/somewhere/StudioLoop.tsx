/**
 * A framed studio loop for a page head. Shows the poster; plays the 480p preview loop only
 * while in view and only when canAutoplay() allows (preview pref, motion, data saver, tab
 * visibility, programme playback). Always labelled as provisional when the art registry says so.
 */
import { useEffect, useRef, useState } from 'react';
import type { ID } from '../../../shared/types.ts';
import { useCatalogue } from '../../state/catalogue.tsx';
import { canAutoplay, releasePreview, requestPreview } from '../../systems/previews.ts';
import { Art } from '../../ui/Pod.tsx';
import './studio-loop.css';

export function StudioLoop({ art, caption, className = '' }: { art: ID; caption: string; className?: string }) {
  const cat = useCatalogue();
  const a = cat.artFor(art);
  const wrap = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = a?.previewSmall;

  useEffect(() => {
    const el = wrap.current;
    const v = video.current;
    if (!el || !v || !src) return;
    let visible = false;
    const sync = () => {
      if (visible && canAutoplay()) {
        if (!v.getAttribute('src')) v.src = src;
        requestPreview(v);
      } else {
        releasePreview(v);
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, { threshold: 0.3 });
    io.observe(el);
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPause);
    window.addEventListener('ms:previews', sync);
    return () => {
      io.disconnect();
      window.removeEventListener('ms:previews', sync);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPause);
      releasePreview(v);
      v.removeAttribute('src');
      v.load();
    };
  }, [src]);

  if (!a) return null;
  return (
    <figure ref={wrap} className={`tms-loop ${className}`} data-playing={playing || undefined}>
      <div className="tms-loop-frame">
        <Art art={art} />
        {src ? <video ref={video} className="tms-loop-video" muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} /> : null}
      </div>
      <figcaption className="tms-loop-cap">
        {caption}
        {a.provisional ? <span> · provisional art</span> : null}
      </figcaption>
    </figure>
  );
}
