/**
 * Entitlement-checked playback.
 *
 * POST /api/playback/:idOrSlug decides whether the caller may watch a video right now and,
 * if so, returns stream URLs carrying a short-lived HMAC-signed token:
 *
 *   token = base64url(JSON {m: mediaId, s: userId|'anon', p: 0|1, e: expiry epoch s})
 *           + '.' + base64url(HMAC-SHA256(PLAYBACK_TOKEN_SECRET, payload))
 *
 * GET /stream/:mediaKey/* serves files from MEDIA_DIR/protected/<mediaKey>/ only after
 * verifying the token (signature, expiry, media match). Premium tokens are additionally
 * bound to the signed-in user, who must still be entitled when each file is fetched, so a
 * copied URL is useless outside that account and stops working once membership lapses.
 * HLS playlists are rewritten so every child URI carries the token.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { kindOf } from '../shared/catalogue.ts';
import type { MediaAsset, Video } from '../shared/types.ts';
import { currentUser } from './auth.ts';
import { assetPathWithinKey, mediaKey, protectedDir } from './content.ts';
import type { AppContext } from './context.ts';
import { entitlementFor } from './entitlements.ts';
import { HttpError, clientIp } from './http.ts';
import { enforceRateLimit } from './security.ts';

export const TOKEN_TTL_SECONDS = 4 * 3600;

export interface PlaybackClaims {
  m: string; // media id
  s: string; // user id or 'anon'
  p: 0 | 1; // 1 = premium playback (bound to the user's live entitlement)
  e: number; // expiry, epoch seconds
}

const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('base64url');

export function signPlaybackToken(secret: string, claims: PlaybackClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export type TokenCheck = { ok: true; claims: PlaybackClaims } | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

export function verifyPlaybackToken(secret: string, token: string, nowSeconds: number): TokenCheck {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(secret, body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'signature' };
  let claims: PlaybackClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PlaybackClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.m !== 'string' || typeof claims.s !== 'string' || (claims.p !== 0 && claims.p !== 1) || typeof claims.e !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.e <= nowSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

/**
 * Appends the token to every URI in an HLS playlist: plain URI lines and URI="…" attributes
 * (#EXT-X-MEDIA, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF, keys…). Absolute or protocol-relative
 * URLs are left untouched so the token never leaks to another host.
 */
export function rewritePlaylist(text: string, token: string): string {
  const withToken = (uri: string) => {
    if (!uri || uri.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri;
    return `${uri}${uri.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) return line.replace(/URI="([^"]*)"/g, (_m, uri: string) => `URI="${withToken(uri)}"`);
      return withToken(trimmed);
    })
    .join('\n');
}

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
};

function streamUrl(asset: MediaAsset, manifestPath: string, token: string): string {
  const key = mediaKey(asset.id)!; // validated when the manifest was loaded
  const rel = assetPathWithinKey(key, manifestPath)!;
  return `/stream/${key}/${rel.split('/').map(encodeURIComponent).join('/')}?t=${token}`;
}

export function playbackRouter(ctx: AppContext) {
  const router = express.Router();

  router.post('/playback/:idOrSlug', (req, res) => {
    enforceRateLimit(res, [[ctx.limits.playback, clientIp(req)]]);
    const cat = ctx.content.catalogue;
    const ref = req.params.idOrSlug;
    const entity = ref.includes(':') ? cat.get(ref) : cat.bySlug('video', ref);
    if (!entity || kindOf(entity.id) !== 'video') throw new HttpError(404, 'not_found', 'We couldn’t find that video.');
    const video = entity as Video;

    const now = ctx.now();
    const access = cat.effectiveAccess(video, now);
    const asset = video.media ? ctx.content.media[video.media] : undefined;
    if (access === 'unavailable' || !asset) {
      throw new HttpError(409, 'unavailable', 'This video isn’t available to watch yet.');
    }

    const user = currentUser(res);
    const premium = access === 'premium';
    if (premium && !entitlementFor(ctx.db, user?.id ?? null, ctx.policy, now).premium) {
      throw new HttpError(403, 'premium_required', 'This video is part of the premium membership.', { signedIn: user !== null });
    }

    const expires = Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS;
    const token = signPlaybackToken(ctx.config.playbackTokenSecret, { m: asset.id, s: user?.id ?? 'anon', p: premium ? 1 : 0, e: expires });
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ...(asset.hls ? { hls: streamUrl(asset, asset.hls, token) } : {}),
      mp4: streamUrl(asset, asset.mp4, token),
      captions: asset.captions,
      ...(asset.chapters ? { chapters: asset.chapters } : {}),
      ...(asset.thumbnails ? { thumbnails: asset.thumbnails } : {}),
      expiresAt: new Date(expires * 1000).toISOString(),
    });
  });

  return router;
}

const isSafeSegment = (s: string) => s.length > 0 && !s.startsWith('.') && !/[\\/\0:]/.test(s);

export function streamRouter(ctx: AppContext) {
  const router = express.Router();

  router.get('/:mediaKey/*file', async (req, res, next) => {
    const key = req.params.mediaKey;
    const segments = req.params.file as unknown as string[];
    if (mediaKey(key) !== key || !segments.every(isSafeSegment)) throw new HttpError(400, 'bad_path', 'Invalid media path.');
    const ext = path.extname(segments[segments.length - 1]).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) throw new HttpError(404, 'not_found', 'Media not found.');

    const token = typeof req.query.t === 'string' ? req.query.t : '';
    const now = ctx.now();
    const check = verifyPlaybackToken(ctx.config.playbackTokenSecret, token, Math.floor(now.getTime() / 1000));
    if (!check.ok) {
      throw check.reason === 'expired'
        ? new HttpError(403, 'token_expired', 'This playback link has expired. Start playback again.')
        : new HttpError(403, 'invalid_token', 'This playback link is not valid.');
    }
    const { claims } = check;
    if (mediaKey(claims.m) !== key) throw new HttpError(403, 'invalid_token', 'This playback link is not valid.');
    if (claims.p === 1) {
      const user = currentUser(res);
      if (!user || user.id !== claims.s) throw new HttpError(403, 'invalid_token', 'This playback link belongs to another session.');
      if (!entitlementFor(ctx.db, user.id, ctx.policy, now).premium) {
        throw new HttpError(403, 'premium_required', 'This video is part of the premium membership.', { signedIn: true });
      }
    }

    const base = protectedDir(ctx.config.mediaDir, key);
    const file = path.resolve(base, ...segments);
    const relative = path.relative(base, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new HttpError(400, 'bad_path', 'Invalid media path.');

    res.setHeader('Content-Type', contentType);
    if (ext === '.m3u8') {
      let text: string;
      try {
        text = await readFile(file, 'utf8');
      } catch {
        throw new HttpError(404, 'not_found', 'Media not found.');
      }
      res.setHeader('Cache-Control', 'private, no-store'); // embeds the token
      res.send(rewritePlaylist(text, token));
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    // `root` keeps send's dotfile check scoped to the path inside the media folder.
    const options = { root: base, dotfiles: 'deny' as const, cacheControl: false, acceptRanges: true };
    res.sendFile(segments.join('/'), options, (err?: NodeJS.ErrnoException & { status?: number }) => {
      if (!err || res.headersSent) return; // aborted range requests land here after headers; nothing to do
      next(err.status === 404 || err.code === 'ENOENT' ? new HttpError(404, 'not_found', 'Media not found.') : err);
    });
  });

  return router;
}
