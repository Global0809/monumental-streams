/**
 * Globe geodata from Natural Earth 1:110m land (world-atlas, public domain):
 *
 *   public/data/globe-dots.json   { spacing, points } — land dots on an ≈equal-area lattice,
 *                                 points = flat [lat, lon, lat, lon, …] rounded to 0.01°
 *   public/data/land-paths.json   { viewBox: "0 0 360 180", d } — equirectangular SVG path
 *                                 (x = lon + 180, y = 90 − lat), rings split at the antimeridian
 *
 * Usage: node scripts/build-globe.ts [--spacing 1.1]
 */
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { formatBytes, fromRoot, toRootRelative, writeJson } from './lib/files.ts';
import { equalAreaLattice, equirectangularPath, isLand, prepareRings, splitAtAntimeridian } from './lib/geo.ts';
import type { Ring } from './lib/geo.ts';

const SOURCE = fromRoot('node_modules', 'world-atlas', 'land-110m.json');
const OUT_DOTS = fromRoot('public', 'data', 'globe-dots.json');
const OUT_PATHS = fromRoot('public', 'data', 'land-paths.json');

const { values } = parseArgs({ options: { spacing: { type: 'string', default: '1.1' } } });
const target = Number(values.spacing);
if (!(target >= 0.25 && target <= 10)) throw new Error('--spacing must be between 0.25 and 10 degrees');

const topology = JSON.parse(readFileSync(SOURCE, 'utf8')) as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land);
const rings: Ring[] = [];
for (const f of land.features) {
  const g = f.geometry;
  const polygons = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
  for (const polygon of polygons) for (const ring of polygon) rings.push(ring.map(([lon, lat]) => [lon, lat]));
}
const prepared = prepareRings(rings);

// Dots: the lattice spacing is adjusted so rows divide 180° exactly.
const lattice = equalAreaLattice(target);
const spacing = 180 / Math.round(180 / target);
const round2 = (v: number) => Math.round(v * 100) / 100;
const points: number[] = [];
for (const [lon, lat] of lattice) if (isLand(lon, lat, prepared)) points.push(round2(lat), round2(lon));
await writeJson(OUT_DOTS, { spacing: Math.round(spacing * 10_000) / 10_000, points }, { compact: true });

// Outline paths.
const parts = prepared.flatMap(splitAtAntimeridian);
await writeJson(OUT_PATHS, { viewBox: '0 0 360 180', d: equirectangularPath(parts, 2) }, { compact: true });

const size = (f: string) => formatBytes(statSync(f).size);
console.log(`${rings.length} land rings from ${toRootRelative(SOURCE)}`);
console.log(`${toRootRelative(OUT_DOTS)}: ${points.length / 2} land dots of ${lattice.length} lattice points (spacing ${spacing.toFixed(4)}°), ${size(OUT_DOTS)}`);
console.log(`${toRootRelative(OUT_PATHS)}: ${parts.length} subpaths, ${size(OUT_PATHS)}`);
