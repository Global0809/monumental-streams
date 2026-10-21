/**
 * Entry for tools/organ-render.html. All logic lives in src/stage/organs/harness.ts (type-checked
 * with the app); this file only wires the page to it and publishes readiness for Playwright:
 *   document.documentElement.dataset.ready = '1'   and   window.__organStats = { triangles, calls }
 */
import { mountHarness, parseHarnessParams } from '../src/stage/organs/harness.ts';
import { ORGAN_SECTIONS } from '../src/stage/organs/palette.ts';

const params = parseHarnessParams(location.search);
const canvas = document.getElementById('organ') as HTMLCanvasElement;
document.title = `Organ render — ${params.organ}`;

if (params.organ === 'all') {
  ORGAN_SECTIONS.forEach((id, i) => {
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = id;
    label.style.left = `${(i % 3) * (params.width / 3) + 16}px`;
    label.style.top = `${Math.floor(i / 3) * (params.height / 3) + 14}px`;
    document.body.append(label);
  });
}

try {
  const harness = mountHarness(canvas, params);
  harness.ready.then((stats) => {
    (window as unknown as { __organStats: unknown }).__organStats = stats;
    document.documentElement.dataset.ready = '1';
  });
  window.addEventListener('pagehide', () => harness.dispose(), { once: true });
} catch (err) {
  document.documentElement.dataset.ready = 'error';
  console.error(err);
}
