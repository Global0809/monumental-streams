/**
 * Device capability tiers so advanced effects adapt instead of failing.
 * high: WebGL globe at full density, previews on hover; mid: lighter globe; low: SVG map, posters only.
 */
export type Tier = 'high' | 'mid' | 'low';

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

let webglCache: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement('canvas');
    webglCache = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function saveData(): boolean {
  const n = navigator as Navigator & NavigatorExtras;
  return !!n.connection?.saveData || /(^|-)2g$/.test(n.connection?.effectiveType ?? '');
}

export function deviceTier(): Tier {
  const n = navigator as Navigator & NavigatorExtras;
  const cores = n.hardwareConcurrency ?? 4;
  const mem = n.deviceMemory ?? 4;
  if (!hasWebGL() || saveData()) return 'low';
  if (cores >= 8 && mem >= 4) return 'high';
  if (cores >= 4) return 'mid';
  return 'low';
}

export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
