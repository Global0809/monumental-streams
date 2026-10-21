/**
 * Render-on-demand scheduler. A frame callback reports what it needs next:
 *   'busy'    something is animating → next animation frame
 *   'ambient' only idle ambient motion → next frame no sooner than 1/30s
 *   'idle'    settled → stop until woken
 * Nothing runs while canRun() is false (hidden tab, quality off, settled behind the player).
 */
export type FrameNeed = 'busy' | 'ambient' | 'idle';

const AMBIENT_MS = 1000 / 30;

export class Loop {
  private raf = 0;
  private timer = 0;
  private disposed = false;
  private readonly frame: (now: number) => FrameNeed;
  private readonly canRun: () => boolean;

  constructor(frame: (now: number) => FrameNeed, canRun: () => boolean) {
    this.frame = frame;
    this.canRun = canRun;
  }

  /** Request a frame (no-op when one is already scheduled). */
  wake() {
    if (this.disposed || this.raf) return;
    if (this.timer) {
      // an ambient wait is pending: something changed, render now
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    if (!this.canRun()) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  get running() {
    return !!(this.raf || this.timer);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.canRun()) return;
    const need = this.frame(now);
    if (this.disposed || !this.canRun()) return;
    if (need === 'busy') this.raf = requestAnimationFrame(this.tick);
    else if (need === 'ambient') {
      const spent = performance.now() - now;
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        if (!this.disposed && this.canRun()) this.raf = requestAnimationFrame(this.tick);
      }, Math.max(0, AMBIENT_MS - spent - 4));
    }
  };

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.timer) window.clearTimeout(this.timer);
    this.raf = 0;
    this.timer = 0;
  }

  dispose() {
    this.stop();
    this.disposed = true;
  }
}
