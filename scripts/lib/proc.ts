/**
 * Child-process helpers for the media scripts: ffmpeg / ffprobe wrappers and a small
 * concurrency pool. Commands are spawned without a shell, so arguments (including filter
 * graphs containing quotes, commas and pipes) are passed verbatim.
 */
import { spawn } from 'node:child_process';
import type { StdioOptions } from 'node:child_process';

export interface RunResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Stream the child's output to this process instead of capturing it (results are then empty). */
  inherit?: boolean;
}

/**
 * Runs a command to completion; rejects with the tail of stderr on a non-zero exit. Callers
 * pass absolute paths rather than a working directory (Windows caps a child's cwd at MAX_PATH).
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const stdio: StdioOptions = opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'];
    const child = spawn(cmd, args, { windowsHide: true, stdio });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const fail = (e: Error) => reject(new Error(`${cmd} failed: ${e.message}`));
    child.stdout?.on('data', (d: Buffer) => out.push(d)).on('error', fail);
    child.stderr?.on('data', (d: Buffer) => err.push(d)).on('error', fail);
    child.on('error', fail);
    child.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) return resolve({ stdout, stderr });
      const tail = stderr.trim().split(/\r?\n/).slice(-12).join('\n');
      const shown = args.map((a) => (a.length > 160 ? `${a.slice(0, 157)}...` : a)).join(' ');
      reject(new Error(`${cmd} exited with code ${code}\n  ${cmd} ${shown}\n${tail}`));
    });
  });
}

/**
 * Runs ffmpeg non-interactively, overwriting outputs. `loglevel` defaults to "error"; use
 * "info" when a filter reports its result on stderr (e.g. loudnorm's JSON measurement).
 */
export function ffmpeg(args: string[], opts: RunOptions & { loglevel?: 'error' | 'info' } = {}): Promise<RunResult> {
  return run('ffmpeg', ['-hide_banner', '-nostdin', '-y', '-loglevel', opts.loglevel ?? 'error', ...args], opts);
}

/* ───────────────────────── ffprobe ───────────────────────── */

export interface ProbeStream {
  index: number;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  codec_name?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  field_order?: string;
  duration?: string;
  nb_frames?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
  side_data_list?: { rotation?: number }[];
}

export interface ProbeResult {
  streams: ProbeStream[];
  format: { duration?: string; size?: string; bit_rate?: string; format_name?: string };
}

export async function ffprobe(file: string): Promise<ProbeResult> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  return JSON.parse(stdout) as ProbeResult;
}

/** Parses an ffprobe rational such as "30000/1001" (returns 0 for "0/0" or garbage). */
export function parseRational(r: string | undefined): number {
  if (!r) return 0;
  const [n, d] = r.split('/').map(Number);
  if (!Number.isFinite(n)) return 0;
  if (d === undefined) return n;
  return d ? n / d : 0;
}

/* ───────────────────────── concurrency ───────────────────────── */

/**
 * Maps `items` through `fn` with at most `limit` promises in flight. Never rejects: every
 * item's outcome is reported, so one failed asset does not abort the others.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
