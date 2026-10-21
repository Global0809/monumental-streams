/**
 * Uniforms shared by every stage material (one object each, so a single write updates all):
 * ambient time, motion (0 under reduced motion / watch), fog (matches scene.fog, which the
 * organs honour) and the device pixel ratio for point sizes.
 */
import * as THREE from 'three';

export interface SharedUniforms {
  uTime: { value: number };
  uMotion: { value: number };
  uFogColor: { value: THREE.Color };
  uFogDensity: { value: number };
  uPixelRatio: { value: number };
}

export function createShared(night: THREE.Color): SharedUniforms {
  return {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uFogColor: { value: night.clone() },
    uFogDensity: { value: 0.012 },
    uPixelRatio: { value: 1 },
  };
}

/** Exp² fog factor, identical to three's FogExp2 (for CPU-side decisions). */
export const fogFactor = (depth: number, density: number) => 1 - Math.exp(-((depth * density) ** 2));

/** Presence fade helper for furniture: eased level, hidden when ~0. */
export class Presence {
  level = 0;
  target = 0;
  /** seconds spent fully hidden (furniture is disposed after a while) */
  hiddenFor = 0;
  step(dt: number, rate = 2.6): boolean {
    const before = this.level;
    this.level = this.target + (this.level - this.target) * Math.exp(-rate * dt);
    if (Math.abs(this.level - this.target) < 0.002) this.level = this.target;
    if (this.level <= 0.001) this.hiddenFor += dt;
    else this.hiddenFor = 0;
    return this.level !== before;
  }
  snap() {
    this.level = this.target;
  }
}
