/**
 * Render harness for the organs (used by tools/organ-render.html and scripts/render-organs.ts).
 * A pure scene: one organ, the brand night with a soft haze of its hue, drifting motes and a
 * gentle bloom. No UI. Deterministic: a still frame depends only on (organ, time, energy).
 *
 *   ?organ=<section|all>&w=1600&h=900&t=2.4&energy=0.35&quality=webgl|lite&dpr=1&bloom=0.6&animate=0
 *
 * organ=all renders a 3×3 contact sheet of the nine organs (a review aid, no bloom).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { SectionId } from '../../../shared/sections.ts';
import { createOrgan, type Organ } from './index.ts';
import { createKit, type Kit } from './kit.ts';
import { clamp01 } from './motion.ts';
import { FAMILY, ORGAN_PALETTE, ORGAN_SECTIONS } from './palette.ts';
import { hash1 } from './parts.ts';

export interface HarnessParams {
  organ: SectionId | 'all';
  width: number;
  height: number;
  time: number;
  energy: number;
  quality: 'webgl' | 'lite';
  dpr: number;
  bloom: number;
  animate: boolean;
  /** Fraction of the frame height the organ's diameter fills. */
  fill: number;
}

const SECTION_IDS: readonly string[] = ['home', 'world', 'time-machine', 'live', 'movies', 'music', 'sports', 'gaming', 'news', 'fashion', 'culture', 'kids', 'my-world'];

/** Parses the harness query string (pure; unknown values fall back to safe defaults). */
export function parseHarnessParams(search: string): HarnessParams {
  const q = new URLSearchParams(search);
  const num = (k: string, d: number, lo: number, hi: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  const organ = q.get('organ') ?? 'movies';
  return {
    organ: organ === 'all' || SECTION_IDS.includes(organ) ? (organ as SectionId | 'all') : 'movies',
    width: Math.round(num('w', 1600, 64, 4096)),
    height: Math.round(num('h', 900, 64, 4096)),
    time: num('t', 2.4, 0, 1e6),
    energy: clamp01(num('energy', 0.35, 0, 1)),
    quality: q.get('quality') === 'lite' ? 'lite' : 'webgl',
    dpr: num('dpr', 1, 0.5, 3),
    bloom: num('bloom', 0.5, 0, 3),
    animate: q.get('animate') === '1',
    fill: num('fill', 0.7, 0.2, 1),
  };
}

const BG_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`;

const BG_FS = /* glsl */ `
uniform vec3 uNight; uniform vec3 uPlum; uniform vec3 uHue; uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p - vec2(0.0, 0.02));
  vec3 col = uNight;
  col = mix(col, uPlum, smoothstep(0.9, 0.0, r) * 0.7);
  col += uHue * 0.035 * exp(-r * r * 4.5);
  col += uHue * 0.018 * exp(-pow((vUv.y - 0.16) * 6.0, 2.0));
  col *= 1.0 - 0.5 * smoothstep(0.35, 1.0, length((vUv - 0.5) * vec2(1.2, 1.0)) * 1.35);
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.008;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <colorspace_fragment>
}`;

interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  organ: Organ;
  bg: THREE.Mesh;
  kit: Kit;
  motes: THREE.InstancedMesh;
}

function buildStage(section: SectionId, p: HarnessParams, aspect: number): Stage {
  const scene = new THREE.Scene();
  const pal = ORGAN_PALETTE[section];
  const kit = createKit('webgl');

  const bgMat = new THREE.ShaderMaterial({
    vertexShader: BG_VS,
    fragmentShader: BG_FS,
    uniforms: {
      uNight: { value: new THREE.Color(FAMILY.night) },
      uPlum: { value: new THREE.Color('#1a1426') },
      uHue: { value: new THREE.Color(pal.hue) },
      uRes: { value: new THREE.Vector2(aspect, 1) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const bg = kit.mesh(new THREE.PlaneGeometry(1, 1), bgMat, 'backdrop');
  bg.frustumCulled = false;
  bg.renderOrder = -1000;
  scene.add(bg);

  const organ = createOrgan(section, { quality: p.quality });
  scene.add(organ.object);

  // Drifting motes: gold, pearl and the organ's hue, in a loose shell around the sculpture.
  const count = 150;
  const motes = kit.halos({ hue: '#ffffff', size: 1, intensity: 0.55, twinkle: 0.7, falloff: 7 }, count, 'motes');
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const tints = [FAMILY.gold, pal.hue, '#f3effc', pal.hue];
  for (let i = 0; i < count; i++) {
    const u = hash1(i + 1) * 2 - 1;
    const a = hash1(i + 101) * Math.PI * 2;
    const r = 1.5 + 3.6 * hash1(i + 201) ** 0.7;
    const s = Math.sqrt(1 - u * u);
    const pos = new THREE.Vector3(Math.cos(a) * s * r, u * r * 0.7, Math.sin(a) * s * r - 0.6);
    const size = 0.018 + 0.05 * hash1(i + 301) ** 3;
    motes.setMatrixAt(i, m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(size, size, size)));
    motes.setColorAt(i, c.set(tints[i % tints.length]));
  }
  scene.add(motes);

  const view = (organ.object.userData.view as { yaw: number; pitch: number } | undefined) ?? { yaw: 0.3, pitch: 0.15 };
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 100);
  const d = 1 / (p.fill * Math.tan(THREE.MathUtils.degToRad(15)));
  camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(d);
  camera.lookAt(0, 0, 0);
  return { scene, camera, organ, bg, kit, motes };
}

export interface HarnessHandle {
  /** Resolves once the requested still has been drawn (or the first animated frame). */
  ready: Promise<{ triangles: number; calls: number }>;
  dispose(): void;
}

export function mountHarness(canvas: HTMLCanvasElement, p: HarnessParams): HarnessHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(p.dpr);
  renderer.setSize(p.width, p.height, false);
  canvas.style.width = `${p.width}px`;
  canvas.style.height = `${p.height}px`;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const grid = p.organ === 'all';
  const ids: SectionId[] = grid ? [...ORGAN_SECTIONS] : [p.organ as SectionId];
  const cols = grid ? 3 : 1;
  const rows = grid ? 3 : 1;
  const cw = p.width / cols;
  const ch = p.height / rows;
  const stages = ids.map((id) => buildStage(id, p, cw / ch));

  let composer: EffectComposer | null = null;
  if (!grid) {
    const rt = new THREE.WebGLRenderTarget(p.width * p.dpr, p.height * p.dpr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(p.dpr);
    composer.setSize(p.width, p.height);
    composer.addPass(new RenderPass(stages[0].scene, stages[0].camera));
    if (p.bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(p.width, p.height), p.bloom, 0.5, 0.86));
    composer.addPass(new OutputPass());
  }

  const draw = (t: number, energy: number) => {
    for (const s of stages) {
      s.organ.update(t, energy);
      s.kit.shared.uTime.value = t;
    }
    if (composer) {
      composer.render();
      return;
    }
    renderer.setScissorTest(true);
    stages.forEach((s, i) => {
      const x = (i % cols) * cw;
      const y = (rows - 1 - Math.floor(i / cols)) * ch;
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.render(s.scene, s.camera);
    });
    renderer.setScissorTest(false);
  };

  let raf = 0;
  let disposed = false;
  const stats = () => {
    let triangles = 0;
    for (const s of stages) triangles += (s.organ.object.userData.triangles as number) ?? 0;
    return { triangles, calls: renderer.info.render.calls };
  };

  const ready = new Promise<{ triangles: number; calls: number }>((resolve) => {
    if (!p.animate) {
      // Settle energy first (the organ eases), then draw the requested still twice.
      draw(p.time, p.energy);
      requestAnimationFrame(() => {
        draw(p.time, p.energy);
        requestAnimationFrame(() => resolve(stats()));
      });
      return;
    }
    const start = performance.now();
    let first = true;
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      draw(p.time + (performance.now() - start) / 1000, p.energy);
      if (first) {
        first = false;
        resolve(stats());
      }
    };
    loop();
  });

  return {
    ready,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const s of stages) {
        s.organ.dispose();
        s.kit.dispose();
        s.motes.dispose();
      }
      composer?.dispose();
      renderer.dispose();
    },
  };
}
