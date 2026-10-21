/**
 * The organ bay: hosts the category ORGANS (src/stage/organs, built by createOrgan) in the
 * slots a form asks for — nine around the spine on Home, one filling the chamber on a
 * category page. Organs grow in and shrink away (scale, so their own materials stay
 * untouched), receive energy when hovered or active, and are disposed once they have been
 * gone for a few seconds. A failing organ is skipped; the stage carries on without it.
 */
import * as THREE from 'three';
import type { SectionId } from '../../../shared/sections.ts';
import { organPosition, type FormLayout, type OrganSlot } from '../layouts.ts';
import { createOrgan } from '../organs/index.ts';
import type { FrameCtx, Hit } from './furniture.ts';

interface Hosted {
  section: SectionId;
  organ: ReturnType<typeof createOrgan>;
  holder: THREE.Group;
  slot: OrganSlot | null;
  level: number;
  energy: number;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  start: number;
  goneFor: number;
  /** world-radius scale while present (kept while shrinking away) */
  base: number;
}

const DISPOSE_AFTER = 4; // seconds hidden

export class OrganBay {
  readonly group = new THREE.Group();
  private readonly hosted = new Map<SectionId, Hosted>();
  private quality: 'webgl' | 'lite';
  private hovered: SectionId | null = null;
  private form: FormLayout | null = null;
  private readonly failed = new Set<SectionId>();

  constructor(quality: 'webgl' | 'lite') {
    this.quality = quality;
  }

  setQuality(q: 'webgl' | 'lite') {
    this.quality = q;
  }

  setForm(form: FormLayout, clock: number, instant: boolean) {
    this.form = form;
    const wanted = new Map(form.organs.map((o) => [o.section, o]));
    for (const [section, slot] of wanted) {
      let h = this.hosted.get(section);
      if (!h) {
        if (this.failed.has(section)) continue;
        try {
          const organ = createOrgan(section, { quality: this.quality });
          const holder = new THREE.Group();
          holder.name = `organ-holder:${section}`;
          holder.add(organ.object);
          this.group.add(holder);
          h = { section, organ, holder, slot, level: 0, energy: 0, pos: new THREE.Vector3(...slot.pos), from: new THREE.Vector3(...slot.pos), start: -1e9, goneFor: 0, base: slot.radius / Math.max(0.01, organ.radius || 1) };
          this.hosted.set(section, h);
        } catch (err) {
          this.failed.add(section);
          console.warn(`[stage] organ ${section} unavailable`, err);
          continue;
        }
      } else {
        h.from.copy(h.pos);
        h.start = instant ? -1e9 : clock;
      }
      h.slot = slot;
      if (instant) h.level = slot.presence;
    }
    for (const [section, h] of this.hosted) if (!wanted.has(section)) h.slot = null;
  }

  setHovered(s: SectionId | null) {
    this.hovered = s;
  }

  /** Returns true while organs are growing, shrinking or travelling. */
  update(dt: number, clock: number, ctx: FrameCtx, active: SectionId | null): boolean {
    let busy = false;
    const form = this.form;
    for (const [section, h] of this.hosted) {
      const target = h.slot ? h.slot.presence : 0;
      const before = h.level;
      h.level = target + (h.level - target) * Math.exp(-2.8 * dt);
      if (Math.abs(h.level - target) < 0.002) h.level = target;
      if (h.level !== before) busy = true;
      if (h.slot && form) {
        const p = organPosition(h.slot, form, ctx.t);
        const k = Math.min(1, Math.max(0, (clock - h.start) / 1.2));
        if (k < 1) {
          busy = true;
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          h.pos.set(h.from.x + (p[0] - h.from.x) * e, h.from.y + (p[1] - h.from.y) * e, h.from.z + (p[2] - h.from.z) * e);
        } else h.pos.set(p[0], p[1], p[2]);
      }
      const radius = Math.max(0.01, h.organ.radius || 1);
      if (h.slot) h.base = h.slot.radius / radius;
      const want = h.base;
      const s = want * (0.25 + 0.75 * h.level);
      h.holder.scale.setScalar(Math.max(1e-4, s));
      h.holder.position.copy(h.pos);
      h.holder.visible = h.level > 0.01;
      const eTarget = section === this.hovered ? 1 : section === active ? 0.6 : 0.2;
      h.energy = eTarget + (h.energy - eTarget) * Math.exp(-5 * dt);
      if (Math.abs(h.energy - eTarget) > 0.003) busy = true;
      if (h.holder.visible) {
        try {
          h.organ.update(ctx.t, h.energy * h.level);
        } catch {
          /* an organ's own animation failing must not stop the stage */
        }
      }
      if (h.level <= 0.01 && !h.slot) {
        h.goneFor += dt;
        if (h.goneFor > DISPOSE_AFTER) this.release(section);
      } else h.goneFor = 0;
    }
    return busy;
  }

  /** Release organs that have left and finished shrinking (called on a timer by the engine). */
  sweep() {
    for (const [section, h] of [...this.hosted]) if (!h.slot && h.level <= 0.01) this.release(section);
  }

  pick(x: number, y: number, ctx: FrameCtx): Hit | null {
    const cam = ctx.camera;
    const v = new THREE.Vector3();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const ppuK = ctx.view.h / 2 / Math.tan((cam.fov * Math.PI) / 360);
    let best: Hit | null = null;
    for (const [section, h] of this.hosted) {
      if (!h.slot || h.level < 0.5) continue;
      const depth = v.copy(h.pos).sub(cam.position).dot(fwd);
      if (depth < 0.5) continue;
      v.copy(h.pos).project(cam);
      const sx = ((v.x + 1) / 2) * ctx.view.w;
      const sy = ((1 - v.y) / 2) * ctx.view.h;
      const r = h.slot.radius * 0.9 * (ppuK / depth);
      if ((x - sx) ** 2 + (y - sy) ** 2 > r * r) continue;
      if (!best || depth < best.depth) best = { kind: 'organ', id: section, depth };
    }
    return best;
  }

  positionOf(section: SectionId): THREE.Vector3 | null {
    return this.hosted.get(section)?.pos ?? null;
  }

  private release(section: SectionId) {
    const h = this.hosted.get(section);
    if (!h) return;
    this.hosted.delete(section);
    h.holder.removeFromParent();
    try {
      h.organ.dispose();
    } catch {
      /* ignore */
    }
  }

  dispose() {
    for (const s of [...this.hosted.keys()]) this.release(s);
    this.group.removeFromParent();
  }
}
