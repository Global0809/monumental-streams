import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import art from '../../content/art.json' with { type: 'json' };
import { SECTIONS, type SectionId } from '../../shared/sections.ts';
import { triangleCount } from '../../src/stage/organs/geometry.ts';
import { createOrgan, measure, ORGAN_PALETTE, ORGAN_SECTIONS, organArtId } from '../../src/stage/organs/index.ts';
import { apertureAngle, approachEnergy, emission, heartbeat, rng } from '../../src/stage/organs/motion.ts';
import { voxelLayout } from '../../src/stage/organs/sculptures/gaming.ts';
import { growth } from '../../src/stage/organs/sculptures/culture.ts';
import { seamPoint } from '../../src/stage/organs/sculptures/sports.ts';
import { silhouette } from '../../src/stage/organs/sculptures/fashion.ts';

const ALL = SECTIONS.map((s) => s.id);
const BUDGET = { webgl: 32000, lite: 12000 };

describe('organ motion helpers', () => {
  it('eases energy, snapping on a frozen or jumping clock', () => {
    expect(approachEnergy(0, 1, 0)).toBe(1); // frozen clock (reduced motion) → exact
    expect(approachEnergy(0, 1, -1)).toBe(1);
    expect(approachEnergy(0, 1, 2)).toBe(1); // hidden-tab jump
    const step = approachEnergy(0, 1, 1 / 60);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.2);
    expect(approachEnergy(0.5, 3, 0)).toBe(1); // clamped
    expect(approachEnergy(0.5, Number.NaN, 0)).toBe(0);
  });

  it('beats twice per period and stays in 0..1', () => {
    for (let t = 0; t < 4; t += 0.01) {
      const h = heartbeat(t, 60);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
    expect(heartbeat(0.08, 60)).toBeCloseTo(heartbeat(1.08, 60), 6);
    expect(heartbeat(0.08, 60)).toBeGreaterThan(heartbeat(0.28, 60));
    expect(heartbeat(0.28, 60)).toBeGreaterThan(heartbeat(0.6, 60));
  });

  it('is deterministic and monotonic where it should be', () => {
    const a = rng(5);
    const b = rng(5);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    expect(apertureAngle(1)).toBeGreaterThan(apertureAngle(0));
    expect(emission(0, 2, 0, 3)).toBe(0);
    expect(emission(1, 2, 0, 3)).toBeCloseTo(0.5);
    expect(emission(0, 2, 1, 3)).toBeCloseTo(1 / 3);
  });
});

describe('organ geometry', () => {
  it('keeps the sports seam on the sphere', () => {
    for (let i = 0; i < 50; i++) expect(seamPoint(i * 0.13).length()).toBeCloseTo(1, 6);
  });
  it('builds a hollow voxel shell with a core', () => {
    const vox = voxelLayout(false);
    expect(vox.length).toBeGreaterThan(60);
    expect(vox.some((v) => v.r === 0)).toBe(true);
    expect(vox.every((v) => v.r <= 1)).toBe(true);
    expect(voxelLayout(true).length).toBeLessThan(vox.length);
  });
  it('grows the same culture tree every time', () => {
    const a = growth(4);
    const b = growth(4);
    expect(a.branches.length).toBe(b.branches.length);
    expect(a.tips[3].toArray()).toEqual(b.tips[3].toArray());
    expect(a.tips.length).toBeGreaterThan(10);
  });
  it('follows a dress-form silhouette (waist narrower than bust and hem)', () => {
    expect(silhouette(0.16)).toBeLessThan(silhouette(0.46));
    expect(silhouette(-0.88)).toBeGreaterThan(silhouette(0.46));
  });
});

describe('createOrgan', () => {
  for (const id of ALL) {
    it(`${id}: builds, animates, fits a unit sphere and stays in budget`, () => {
      for (const quality of ['webgl', 'lite'] as const) {
        const organ = createOrgan(id, { quality });
        expect(organ.object).toBeInstanceOf(THREE.Object3D);
        expect(organ.radius).toBe(1);
        for (const [t, e] of [
          [0, 0],
          [0.5, 1],
          [3.7, 0.4],
          [3.7, 0.4],
          [120, 0],
        ]) organ.update(t, e);
        const { center, radius } = measure(organ.object);
        expect(radius + center.length()).toBeLessThan(1.15);
        expect(radius).toBeGreaterThan(0.6);
        expect(triangleCount(organ.object)).toBeLessThan(BUDGET[quality]);
        organ.dispose();
      }
    });
  }

  it('lite is lighter than webgl for every organ', () => {
    for (const id of ORGAN_SECTIONS) {
      const a = createOrgan(id, { quality: 'webgl' });
      const b = createOrgan(id, { quality: 'lite' });
      expect(triangleCount(b.object)).toBeLessThan(triangleCount(a.object));
      a.dispose();
      b.dispose();
    }
  });

  it('dispose releases every geometry and material and detaches', () => {
    const parent = new THREE.Group();
    const organ = createOrgan('music', { quality: 'webgl' });
    parent.add(organ.object);
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    organ.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      geos.add(m.geometry);
      mats.add(m.material as THREE.Material);
    });
    const disposed = new Set<object>();
    for (const x of [...geos, ...mats]) x.addEventListener('dispose', () => disposed.add(x));
    organ.dispose();
    expect(disposed.size).toBe(geos.size + mats.size);
    expect(organ.object.parent).toBeNull();
    expect(() => organ.update(1, 1)).not.toThrow();
  });

  it('is still under a frozen clock (reduced motion renders a still)', () => {
    const organ = createOrgan('sports', { quality: 'webgl' });
    const snap = () => {
      const out: number[] = [];
      organ.object.updateMatrixWorld(true);
      organ.object.traverse((o) => out.push(...o.matrixWorld.elements));
      return out;
    };
    organ.update(2, 0.5);
    const a = snap();
    organ.update(2, 0.5);
    expect(snap()).toEqual(a);
    organ.dispose();
  });

  it('keeps Live dormant: no motion and no travelling pulses', () => {
    const organ = createOrgan('live', { quality: 'webgl' });
    const snap = () => {
      organ.object.updateMatrixWorld(true);
      const out: number[] = [];
      organ.object.traverse((o) => out.push(...o.matrixWorld.elements));
      return out;
    };
    organ.update(1, 0);
    const a = snap();
    organ.update(9, 0);
    expect(snap()).toEqual(a);
    organ.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (m?.name === 'organ-filament') expect(m.uniforms.uPulse.value).toBe(0);
      if (m?.name === 'organ-glass') expect(m.uniforms.uCore.value).toBe(0);
    });
    organ.dispose();
  });
});

describe('organ palette and artwork', () => {
  it('has a hue for every section', () => {
    for (const id of ALL) expect(ORGAN_PALETTE[id as SectionId].hue).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('covers Live and every category', () => {
    const cats = SECTIONS.filter((s) => s.kind === 'category' || s.kind === 'live').map((s) => s.id);
    expect([...ORGAN_SECTIONS].sort()).toEqual([...cats].sort());
  });
  it('registers generated organ art and uses it for every category and Live', () => {
    for (const id of ORGAN_SECTIONS) {
      const entry = art.find((a) => a.id === organArtId(id));
      expect(entry, organArtId(id)).toBeTruthy();
      expect(entry!.kind).toBe('generated');
      expect(entry!.provisional).toBe(false);
      expect(entry!.stem).toBe(`organ-${id}`);
      expect(SECTIONS.find((s) => s.id === id)!.art).toBe(organArtId(id));
    }
  });
});

describe('organ render harness parameters', () => {
  it('parses a poster request and falls back safely', async () => {
    const { parseHarnessParams } = await import('../../src/stage/organs/harness.ts');
    const p = parseHarnessParams('?organ=kids&w=1600&h=900&t=1.5&energy=0.35&dpr=2');
    expect(p).toMatchObject({ organ: 'kids', width: 1600, height: 900, time: 1.5, energy: 0.35, dpr: 2, quality: 'webgl', animate: false });
    const bad = parseHarnessParams('?organ=<script>&w=-5&energy=9&quality=ultra&dpr=99');
    expect(bad.organ).toBe('movies');
    expect(bad.width).toBe(64);
    expect(bad.energy).toBe(1);
    expect(bad.quality).toBe('webgl');
    expect(bad.dpr).toBe(3);
    expect(parseHarnessParams('?organ=all').organ).toBe('all');
  });
});
