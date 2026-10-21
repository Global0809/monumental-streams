/**
 * Scene furniture contract: a piece of the world that appears with some forms (the spine, the
 * globe, the helix, the personal core). Each eases its own presence, is created lazily when a
 * form first needs it and disposed after it has been hidden for a while.
 */
import type * as THREE from 'three';
import type { FormLayout } from '../layouts.ts';
import type { Presence } from './shared.ts';

export interface FrameCtx {
  camera: THREE.PerspectiveCamera;
  view: { w: number; h: number };
  form: FormLayout;
  /** 1 normal, 0 under reduced motion / watch. */
  motion: number;
  /** Ambient clock (seconds). */
  t: number;
}

export type HitKind = 'seed' | 'place' | 'decade' | 'organ';

export interface Hit {
  kind: HitKind;
  /** seed id, place id, decade (as string) or section id */
  id: string;
  depth: number;
}

export interface Piece {
  readonly group: THREE.Object3D;
  readonly presence: Presence;
  /** Returns true while animating beyond ambient motion. */
  update(dt: number, ctx: FrameCtx): boolean;
  pick?(x: number, y: number, ctx: FrameCtx): Hit | null;
  dispose(): void;
}
