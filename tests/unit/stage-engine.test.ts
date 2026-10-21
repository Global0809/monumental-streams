import { describe, expect, it } from 'vitest';
import { angleDelta, damped, fromSpherical, median, settled, shouldDowngrade, smoothDamp, smoothDampAngle, toSpherical } from '../../src/stage/engine/damp.ts';
import { cssAlpha, isStageTarget, STAGE_BLOCK } from '../../src/stage/engine/pointer.ts';
import { occludedBySphere } from '../../src/stage/engine/seeds.ts';
import * as THREE from 'three';

const run = (seconds: number, step: (dt: number) => void, fps = 60) => {
  for (let i = 0; i < Math.round(seconds * fps); i++) step(1 / fps);
};

describe('camera damping', () => {
  it('a move settles in the 0.9–1.4s window', () => {
    const d = damped(0);
    run(0.6, (dt) => smoothDamp(d, 10, 0.4, dt));
    expect(d.value).toBeGreaterThan(5); // well under way after 0.6s
    expect(d.value).toBeLessThan(9.9);
    run(0.8, (dt) => smoothDamp(d, 10, 0.4, dt));
    expect(Math.abs(d.value - 10)).toBeLessThan(0.15); // effectively there by ~1.4s
    run(3, (dt) => smoothDamp(d, 10, 0.4, dt));
    expect(settled(d, 10)).toBe(true);
  });

  it('is interruptible: retargeting mid-flight keeps velocity continuous (no jump)', () => {
    const d = damped(0);
    run(0.3, (dt) => smoothDamp(d, 10, 0.4, dt));
    const before = d.value;
    const v = d.velocity;
    expect(v).toBeGreaterThan(0);
    smoothDamp(d, -10, 0.4, 1 / 60); // new target behind us
    expect(Math.abs(d.value - before)).toBeLessThan(Math.abs(v) / 60 + 0.05);
    run(3, (dt) => smoothDamp(d, -10, 0.4, dt));
    expect(Math.abs(d.value + 10)).toBeLessThan(0.01);
  });

  it('is frame-rate independent', () => {
    const a = damped(0);
    const b = damped(0);
    run(0.7, (dt) => smoothDamp(a, 5, 0.4, dt), 30);
    run(0.7, (dt) => smoothDamp(b, 5, 0.4, dt), 144);
    expect(Math.abs(a.value - b.value)).toBeLessThan(0.08);
  });

  it('angles take the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    const d = damped(3);
    run(2, (dt) => smoothDampAngle(d, -3, 0.4, dt));
    // went forward past π rather than back through 0
    expect(d.value).toBeGreaterThan(3);
    expect(Math.abs(angleDelta(d.value, -3))).toBeLessThan(0.01);
  });

  it('spherical round trip', () => {
    const s = toSpherical(3, 4, -12);
    const [x, y, z] = fromSpherical(s.r, s.theta, s.phi);
    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(4, 9);
    expect(z).toBeCloseTo(-12, 9);
  });
});

describe('auto-downgrade', () => {
  it('needs a full sample and a slow median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(shouldDowngrade(Array(20).fill(80))).toBe(false); // not enough evidence yet
    expect(shouldDowngrade(Array(40).fill(16.7))).toBe(false);
    expect(shouldDowngrade([...Array(30).fill(50), ...Array(10).fill(16)])).toBe(true);
    expect(shouldDowngrade([...Array(30).fill(16), ...Array(10).fill(200)])).toBe(false); // a few hitches are not "consistently slow"
  });
});

/* ───────── pointer targeting with a tiny fake DOM ───────── */

interface FakeEl {
  tag: string;
  cls: string[];
  attrs: Record<string, string>;
  parentElement: FakeEl | null;
  ownerDocument: FakeDoc;
  classList: { contains(c: string): boolean };
  closest(sel: string): FakeEl | null;
}
interface FakeDoc {
  documentElement: FakeEl;
  body: FakeEl;
}

function matches(el: FakeEl, sel: string): boolean {
  return sel.split(',').some((raw) => {
    const s = raw.trim();
    if (s === '#main') return el.attrs.id === 'main';
    const attr = /^\[([a-z-]+)(?:=("?)([^"\]]*)\2)?\]$/.exec(s);
    if (attr) return attr[1] in el.attrs && (attr[3] === undefined || el.attrs[attr[1]] === attr[3]);
    return el.tag === s;
  });
}

function makeDoc() {
  const doc = {} as FakeDoc;
  const mk = (tag: string, parent: FakeEl | null, attrs: Record<string, string> = {}, cls: string[] = []): FakeEl => {
    const el: FakeEl = {
      tag,
      cls,
      attrs,
      parentElement: parent,
      ownerDocument: doc,
      classList: { contains: (c) => cls.includes(c) },
      closest(sel) {
        for (let n: FakeEl | null = el; n; n = n.parentElement) if (matches(n, sel)) return n;
        return null;
      },
    };
    return el;
  };
  doc.documentElement = mk('html', null);
  doc.body = mk('body', doc.documentElement);
  const plan = mk('div', doc.body, {}, ['body-plan']);
  const nav = mk('nav', plan);
  const main = mk('main', plan, { id: 'main' });
  const section = mk('section', main);
  const heading = mk('h1', section);
  const link = mk('a', section);
  const blocked = mk('div', section, { 'data-stage-block': '' });
  const inBlocked = mk('div', blocked);
  const slider = mk('div', section, { role: 'slider' });
  return { doc, plan, nav, main, section, heading, link, inBlocked, slider, mk };
}

describe('stage pointer targets', () => {
  const t = makeDoc();
  const is = (el: FakeEl) => isStageTarget(el as unknown as EventTarget);
  it('answers the background and open space in the main area', () => {
    expect(is(t.doc.body)).toBe(true);
    expect(is(t.doc.documentElement)).toBe(true);
    expect(is(t.plan)).toBe(true);
    expect(is(t.main)).toBe(true);
    expect(is(t.section)).toBe(true);
  });
  it('never answers through interactive or content elements, or outside main', () => {
    expect(is(t.heading)).toBe(false);
    expect(is(t.link)).toBe(false);
    expect(is(t.inBlocked)).toBe(false);
    expect(is(t.slider)).toBe(false);
    expect(is(t.nav)).toBe(false);
    expect(isStageTarget(null)).toBe(false);
    for (const sel of ['a', 'button', 'input', 'select', 'textarea', 'label', '[role=button]', '[role=slider]', '[data-stage-block]', 'canvas']) expect(STAGE_BLOCK).toContain(sel);
  });
  it('reads CSS alpha for glass-panel detection', () => {
    expect(cssAlpha('transparent')).toBe(0);
    expect(cssAlpha('rgba(0, 0, 0, 0)')).toBe(0);
    expect(cssAlpha('rgb(24 18 34 / 0.72)')).toBeCloseTo(0.72);
    expect(cssAlpha('rgb(10, 8, 17)')).toBe(1);
    expect(cssAlpha('rgb(10 8 17 / 40%)')).toBeCloseTo(0.4);
  });
});

describe('globe occlusion for picking', () => {
  const eye = new THREE.Vector3(0, 0, 20);
  const c = new THREE.Vector3(0, 0, 0);
  it('hides seeds behind the globe, never those in front of or beside it', () => {
    expect(occludedBySphere(eye, new THREE.Vector3(0, 0, -5.4), c, 5)).toBe(true); // far side
    expect(occludedBySphere(eye, new THREE.Vector3(0, 0, 5.4), c, 5)).toBe(false); // near side
    expect(occludedBySphere(eye, new THREE.Vector3(6, 0, -2), c, 5)).toBe(false); // beside the limb
    expect(occludedBySphere(eye, new THREE.Vector3(0, 0, 10), c, 5)).toBe(false); // between eye and globe
  });
});
