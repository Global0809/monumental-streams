/**
 * Interruptible presence for things that open and close (menus, sheets, popovers).
 *
 *   open → mounted with state 'closed' for one frame, then 'open' (so CSS transitions run)
 *   close → state 'closed' at once (transitions reverse from wherever they are), unmounted
 *           after `ms`; reopening before then simply reverses again — nothing restarts.
 *
 * Style the element with transitions keyed on [data-state='open'|'closed'], and make the
 * closing copy inert / aria-hidden so it never reaches assistive tech or the keyboard.
 * Under reduced motion it mounts open and unmounts immediately.
 */
import { useEffect, useRef, useState } from 'react';
import { isReducedMotion } from '../systems/motion.ts';

export type PresenceState = 'open' | 'closed';

export function usePresence(open: boolean, ms = 220): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  useEffect(() => {
    if (open) {
      setMounted(true);
      // already on screen (closing, or reduced motion): reverse straight away
      if (mountedRef.current || isReducedMotion()) {
        setShown(true);
        return;
      }
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setShown(false);
    if (isReducedMotion()) {
      setMounted(false);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [open, ms]);

  return { mounted: mounted || open, state: open && shown ? 'open' : 'closed' };
}
