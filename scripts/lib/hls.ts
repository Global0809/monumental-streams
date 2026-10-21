/**
 * HLS helpers: parse media playlists, measure segment bit rates, derive RFC 6381 codec
 * strings from encoded files, write the master playlist and verify a finished package.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface MediaSegment {
  uri: string;
  duration: number;
}

/** Parses a VOD media playlist. Throws when it is not a complete (ENDLIST) playlist. */
export function parseMediaPlaylist(text: string): MediaSegment[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== '#EXTM3U') throw new Error('missing #EXTM3U header');
  if (!lines.includes('#EXT-X-ENDLIST')) throw new Error('missing #EXT-X-ENDLIST (not a VOD playlist)');
  const segments: MediaSegment[] = [];
  let pending: number | null = null;
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) pending = Number.parseFloat(line.slice(8));
    else if (line && !line.startsWith('#')) {
      if (pending === null || !Number.isFinite(pending)) throw new Error(`segment ${line} has no #EXTINF duration`);
      segments.push({ uri: line, duration: pending });
      pending = null;
    }
  }
  if (segments.length === 0) throw new Error('playlist has no segments');
  return segments;
}

export interface SegmentStats {
  segments: number;
  duration: number; // seconds (sum of EXTINF)
  peakBandwidth: number; // bits/s, highest single segment (HLS BANDWIDTH)
  averageBandwidth: number; // bits/s over the whole rendition (HLS AVERAGE-BANDWIDTH)
  bytes: number;
}

/**
 * Measures a rendition from its playlist and segment files on disk. Every segment must
 * exist and be non-empty.
 */
export function measureRendition(playlistFile: string): SegmentStats {
  const dir = path.dirname(playlistFile);
  const segments = parseMediaPlaylist(readFileSync(playlistFile, 'utf8'));
  let bytes = 0;
  let duration = 0;
  let peak = 0;
  for (const seg of segments) {
    const file = path.join(dir, seg.uri);
    if (!existsSync(file)) throw new Error(`missing segment ${seg.uri} in ${playlistFile}`);
    const size = statSync(file).size;
    if (size === 0) throw new Error(`empty segment ${seg.uri} in ${playlistFile}`);
    bytes += size;
    duration += seg.duration;
    peak = Math.max(peak, (size * 8) / seg.duration);
  }
  return {
    segments: segments.length,
    duration,
    peakBandwidth: Math.ceil(peak),
    averageBandwidth: Math.ceil((bytes * 8) / duration),
    bytes,
  };
}

/**
 * RFC 6381 codec string for the H.264 stream of an MP4, read from its avcC box
 * (profile_idc, constraint flags, level_idc) — e.g. "avc1.64001f" for High@3.1.
 */
export function avc1CodecFromMp4(file: string): string {
  const buf = readFileSync(file);
  const at = buf.indexOf('avcC');
  // Box layout after the type: configurationVersion(1) profile(1) compatibility(1) level(1).
  if (at < 0 || buf[at + 4] !== 1) throw new Error(`no avcC box found in ${file}`);
  const hex = (b: number) => b.toString(16).padStart(2, '0');
  return `avc1.${hex(buf[at + 5])}${hex(buf[at + 6])}${hex(buf[at + 7])}`;
}

export interface VariantEntry {
  uri: string; // relative to the master playlist
  bandwidth: number;
  averageBandwidth: number;
  width: number;
  height: number;
  codecs: string;
  frameRate: number;
}

/**
 * Master playlist. The first listed variant is where players start before they have a
 * bandwidth estimate (hls.js and Safari both honour this), so callers put the default
 * rendition first and the rest from highest to lowest.
 */
export function masterPlaylist(variants: VariantEntry[]): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const v of variants) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},AVERAGE-BANDWIDTH=${v.averageBandwidth},` +
        `RESOLUTION=${v.width}x${v.height},CODECS="${v.codecs}",FRAME-RATE=${v.frameRate.toFixed(3)}`,
      v.uri,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Variant URIs listed in a master playlist. */
export function parseMasterVariants(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== '#EXTM3U') throw new Error('missing #EXTM3U header');
  const uris: string[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const uri = lines[i + 1];
      if (!uri || uri.startsWith('#')) throw new Error('#EXT-X-STREAM-INF without a URI');
      uris.push(uri);
    }
  });
  if (uris.length === 0) throw new Error('master playlist lists no variants');
  return uris;
}

/**
 * Structural check of a published package: the master parses, every variant playlist
 * parses, every segment exists, and each variant lasts `expectedDuration` (±0.25 s).
 * Returns per-variant stats keyed by URI.
 */
export function verifyHlsPackage(masterFile: string, expectedDuration: number): Map<string, SegmentStats> {
  const dir = path.dirname(masterFile);
  const out = new Map<string, SegmentStats>();
  for (const uri of parseMasterVariants(readFileSync(masterFile, 'utf8'))) {
    const stats = measureRendition(path.join(dir, uri));
    if (Math.abs(stats.duration - expectedDuration) > 0.25) {
      throw new Error(`${uri} lasts ${stats.duration.toFixed(3)}s, expected ${expectedDuration.toFixed(3)}s`);
    }
    out.set(uri, stats);
  }
  return out;
}
