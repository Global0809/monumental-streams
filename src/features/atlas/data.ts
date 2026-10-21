/** Static geodata for the atlas (Natural Earth 1:110m land, public domain), fetched once per session. */

export interface GlobeDots {
  spacing: number;
  points: number[]; // flat [lat, lon, lat, lon, …]
}

export interface LandPaths {
  viewBox: string; // "0 0 360 180"
  d: string; // equirectangular path: x = lon + 180, y = 90 − lat
}

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(url)); // allow a retry after a failure
    cache.set(url, p);
  }
  return p;
}

export const loadDots = () => load<GlobeDots>('/data/globe-dots.json');
export const loadLand = () => load<LandPaths>('/data/land-paths.json');
