/**
 * Camera rig. Each form names a shot (position, target, fov, horizontal bias); the rig moves
 * there on critically damped springs in spherical coordinates around the target, so moves
 * arc around the subject instead of cutting through it, and a new shot retargets mid-flight
 * without a jolt. Dragging adds a temporary orbit (with inertia) that eases back on the next
 * shot. Under reduced motion every move is an instant cut.
 */
import * as THREE from 'three';
import type { CameraShot, Vec3 } from '../layouts.ts';
import { damped, fromSpherical, settled, smoothDamp, smoothDampAngle, snap, toSpherical, type Damped } from './damp.ts';

const SMOOTH = 0.4; // ≈ 1.2s moves
const PITCH_LIMIT = 1.25;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private tx = damped(0);
  private ty = damped(0);
  private tz = damped(0);
  private r = damped(30);
  private th = damped(0);
  private ph = damped(0.1);
  private fov = damped(40);
  private bias = damped(0);
  private goal = { target: [0, 0, 0] as Vec3, r: 30, th: 0, ph: 0.1, fov: 40, bias: 0 };
  /** User orbit (drag) on top of the shot. */
  private yaw = damped(0);
  private pitch = damped(0);
  private yawVel = 0;
  private pitchVel = 0;
  private dragging = false;
  /** Keep the viewer's orbit (after a drag) instead of easing it home. */
  private keepOrbit = false;
  private orbitMode: 'free' | 'yaw' | 'none' = 'none';
  private w = 1;
  private h = 1;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  }

  setShot(shot: CameraShot, opts: { instant: boolean; orbit: 'free' | 'yaw' | 'none'; keepOrbit?: boolean }) {
    const off = toSpherical(shot.pos[0] - shot.target[0], shot.pos[1] - shot.target[1], shot.pos[2] - shot.target[2]);
    this.goal = { target: shot.target, r: off.r, th: off.theta, ph: off.phi, fov: shot.fov, bias: shot.bias };
    this.orbitMode = opts.orbit;
    if (!opts.keepOrbit) {
      // a new subject: the viewer's orbit eases home (instant under reduced motion)
      this.yawVel = 0;
      this.pitchVel = 0;
    }
    if (opts.instant) {
      snap(this.tx, shot.target[0]);
      snap(this.ty, shot.target[1]);
      snap(this.tz, shot.target[2]);
      snap(this.r, off.r);
      snap(this.th, off.theta);
      snap(this.ph, off.phi);
      snap(this.fov, shot.fov);
      snap(this.bias, shot.bias);
      if (!opts.keepOrbit) {
        snap(this.yaw, 0);
        snap(this.pitch, 0);
      }
    }
    this.keepOrbit = !!opts.keepOrbit;
  }

  /** Horizontal bias only (e.g. after a resize changes the layout's framing). */
  setBias(b: number) {
    this.goal.bias = b;
  }

  canOrbit() {
    return this.orbitMode !== 'none';
  }

  beginDrag() {
    this.dragging = true;
    this.yawVel = 0;
    this.pitchVel = 0;
    this.keepOrbit = true;
  }

  /** dx, dy in CSS px since the last move; dt seconds. */
  drag(dx: number, dy: number, dt: number) {
    if (this.orbitMode === 'none') return;
    const k = 0.0034;
    const dyaw = -dx * k;
    const dpitch = this.orbitMode === 'free' ? dy * k * 0.8 : dy * k * 0.25;
    this.yaw.value += dyaw;
    this.pitch.value = this.clampPitch(this.pitch.value + dpitch);
    this.yaw.velocity = 0;
    this.pitch.velocity = 0;
    if (dt > 0) {
      this.yawVel = dyaw / dt;
      this.pitchVel = dpitch / dt;
    }
  }

  endDrag() {
    this.dragging = false;
  }

  private clampPitch(p: number) {
    const lim = this.orbitMode === 'free' ? PITCH_LIMIT : 0.35;
    const base = this.ph.value;
    return Math.max(-lim - base, Math.min(lim - base, p));
  }

  resize(w: number, h: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.camera.aspect = this.w / this.h;
  }

  /** Advance; returns true while anything is still moving. */
  update(dt: number): boolean {
    const g = this.goal;
    smoothDamp(this.tx, g.target[0], SMOOTH, dt);
    smoothDamp(this.ty, g.target[1], SMOOTH, dt);
    smoothDamp(this.tz, g.target[2], SMOOTH, dt);
    smoothDamp(this.r, g.r, SMOOTH * 1.05, dt);
    smoothDampAngle(this.th, g.th, SMOOTH * 1.1, dt);
    smoothDamp(this.ph, g.ph, SMOOTH, dt);
    smoothDamp(this.fov, g.fov, SMOOTH, dt);
    smoothDamp(this.bias, g.bias, SMOOTH * 1.2, dt);

    let orbitMoving = false;
    if (!this.dragging) {
      if (this.keepOrbit && (Math.abs(this.yawVel) > 1e-3 || Math.abs(this.pitchVel) > 1e-3)) {
        // inertia after a fling
        this.yaw.value += this.yawVel * dt;
        this.pitch.value = this.clampPitch(this.pitch.value + this.pitchVel * dt);
        const decay = Math.exp(-3.2 * dt);
        this.yawVel *= decay;
        this.pitchVel *= decay;
        orbitMoving = true;
      } else if (!this.keepOrbit) {
        smoothDampAngle(this.yaw, 0, SMOOTH * 1.2, dt);
        smoothDamp(this.pitch, 0, SMOOTH * 1.2, dt);
        orbitMoving = !settled(this.yaw, 0) || !settled(this.pitch, 0);
      }
    }
    this.apply();
    const moving =
      !settled(this.tx, g.target[0]) ||
      !settled(this.ty, g.target[1]) ||
      !settled(this.tz, g.target[2]) ||
      !settled(this.r, g.r) ||
      !settled(this.th, this.th.value + angleGap(this.th, g.th)) ||
      !settled(this.ph, g.ph) ||
      !settled(this.fov, g.fov, 0.01) ||
      !settled(this.bias, g.bias, 1e-4);
    return moving || orbitMoving || this.dragging;
  }

  private apply() {
    const cam = this.camera;
    const phi = Math.max(-PITCH_LIMIT - 0.2, Math.min(PITCH_LIMIT + 0.2, this.ph.value + this.pitch.value));
    const [ox, oy, oz] = fromSpherical(this.r.value, this.th.value + this.yaw.value, phi);
    cam.position.set(this.tx.value + ox, this.ty.value + oy, this.tz.value + oz);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tx.value, this.ty.value, this.tz.value);
    cam.fov = this.fov.value;
    const b = this.bias.value;
    if (Math.abs(b) > 1e-4) cam.setViewOffset(this.w, this.h, -b * this.w, 0, this.w, this.h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}

function angleGap(d: Damped, target: number) {
  let x = (target - d.value) % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x <= -Math.PI) x += Math.PI * 2;
  return x;
}
