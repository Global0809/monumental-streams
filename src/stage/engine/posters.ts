/**
 * Poster array: every seed's poster lives in one layer of a 2D array texture, so all seeds draw
 * in a single instanced call however large the catalogue grows. Loading is progressive:
 *   1. the tiny LQIP (inline data URI) for every seed at once,
 *   2. the 640w poster (cat.artFor(art).posterSmall, URL used as-is) by priority, a few at a
 *      time, most prominent seeds first.
 * Only the changed layer is re-uploaded. dispose() cancels pending loads and frees the texture.
 */
import * as THREE from 'three';

interface Source {
  lqip?: string;
  full?: string;
  level: 0 | 1 | 2; // none · lqip · full
  loading: boolean;
  failed: boolean;
  priority: number;
}

const CONCURRENCY = 3;

export class PosterArray {
  readonly texture: THREE.DataArrayTexture;
  readonly width: number;
  readonly height: number;
  readonly layers: number;
  private readonly data: Uint8Array;
  private readonly sources: Source[] = [];
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pending = new Set<HTMLImageElement>();
  private active = 0;
  private primed = false;
  private disposed = false;
  private readonly onChange: () => void;

  constructor(layers: number, opts: { width: number; height: number; base: THREE.Color; onChange: () => void }) {
    this.width = opts.width;
    this.height = opts.height;
    this.layers = Math.max(1, layers);
    this.onChange = opts.onChange;
    const size = this.width * this.height * 4;
    this.data = new Uint8Array(size * this.layers);
    // a deep violet glass tint until the art arrives (sRGB bytes)
    const r = Math.round(opts.base.r * 255);
    const g = Math.round(opts.base.g * 255);
    const b = Math.round(opts.base.b * 255);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
    this.texture = new THREE.DataArrayTexture(this.data, this.width, this.height, this.layers);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < this.layers; i++) this.sources.push({ level: 0, loading: false, failed: false, priority: 0 });
  }

  /** After the first upload, later changes go up one layer at a time. */
  markPrimed() {
    this.primed = true;
  }

  setSource(layer: number, lqip: string | undefined, full: string | undefined) {
    const s = this.sources[layer];
    if (!s) return;
    s.lqip = lqip && lqip.startsWith('data:image/') && lqip.length > 40 ? lqip : undefined;
    s.full = full || undefined;
    if (s.lqip && s.level === 0) this.load(layer, s.lqip, 1);
  }

  /** Higher priority loads first; priority 0 means "not needed yet". */
  setPriority(layer: number, priority: number) {
    const s = this.sources[layer];
    if (s) s.priority = priority;
  }

  /** Start the most wanted full-size posters. */
  pump() {
    if (this.disposed) return;
    while (this.active < CONCURRENCY) {
      let best = -1;
      let bestP = 0;
      for (let i = 0; i < this.sources.length; i++) {
        const s = this.sources[i];
        if (s.level < 2 && !s.loading && !s.failed && s.full && s.priority > bestP) {
          best = i;
          bestP = s.priority;
        }
      }
      if (best < 0) return;
      this.load(best, this.sources[best].full!, 2);
    }
  }

  private load(layer: number, url: string, level: 1 | 2) {
    const s = this.sources[layer];
    s.loading = true;
    if (level === 2) this.active++;
    const img = new Image();
    img.decoding = 'async';
    this.pending.add(img);
    const done = (ok: boolean) => {
      this.pending.delete(img);
      s.loading = false;
      if (level === 2) this.active--;
      if (this.disposed) return;
      if (ok && s.level < level) {
        this.draw(layer, img);
        s.level = level;
      } else if (!ok && level === 2) s.failed = true;
      img.src = '';
      this.pump();
    };
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => done(true), () => done(true));
      else done(true);
    };
    img.onerror = () => done(false);
    img.src = url;
  }

  private draw(layer: number, img: HTMLImageElement) {
    const ctx = this.ctx;
    if (!ctx || !img.naturalWidth || !img.naturalHeight) return;
    const W = this.width;
    const H = this.height;
    // cover-fit
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * k;
    const dh = img.naturalHeight * k;
    try {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      const px = ctx.getImageData(0, 0, W, H).data;
      this.data.set(px, layer * W * H * 4);
    } catch {
      return; // tainted canvas or decode failure: keep the placeholder
    }
    if (this.primed) this.texture.addLayerUpdate(layer);
    this.texture.needsUpdate = true;
    this.onChange();
  }

  level(layer: number) {
    return this.sources[layer]?.level ?? 0;
  }

  dispose() {
    this.disposed = true;
    for (const img of this.pending) {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    }
    this.pending.clear();
    this.texture.dispose();
  }
}
