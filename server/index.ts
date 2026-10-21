/**
 * Monumental Streams server: composes the Express 5 app and, when run directly
 * (`node server/index.ts`), listens and shuts down gracefully.
 *
 * Middleware order matters:
 *   security headers → compression → session → Stripe webhook (raw body, own signature)
 *   → CSRF + Origin check → library (256 kb JSON) → JSON (32 kb) → API routes → JSON 404
 *   → /stream (token-gated) → /media/public → built client (production) → error handler
 */
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import compression from 'compression';
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from 'express';
import { authRouter, sessionMiddleware } from './auth.ts';
import { billingMode, billingRouter, webhookHandlers } from './billing.ts';
import { ConfigError, loadConfig, type ServerConfig } from './config.ts';
import { ContentError, loadContent, type LoadedContent } from './content.ts';
import type { AppContext } from './context.ts';
import { openDatabase } from './db.ts';
import { devPreviewEnabled, devPreviewRouter } from './dev-preview.ts';
import { HttpError } from './http.ts';
import { libraryRouter } from './library.ts';
import { consoleLogger, type Logger } from './log.ts';
import { playbackRouter, streamRouter } from './playback.ts';
import { publicApiRouter } from './public-api.ts';
import { createCsrf, createRateLimiter, securityHeaders } from './security.ts';

export interface CreateAppOptions {
  config: ServerConfig;
  /** Pre-loaded content; loaded from config.contentDir / config.mediaDir when omitted. */
  content?: LoadedContent;
  logger?: Logger;
  /** Clock override (tests). */
  now?: () => Date;
  /** fetch used for the Stripe API (tests stub it). */
  fetch?: typeof fetch;
}

export interface MonumentalApp {
  app: Express;
  ctx: AppContext;
  /** Stops background timers and closes the database. */
  close(): void;
}

const MINUTE = 60_000;
const API_BODY_LIMIT = '32kb';
const SESSION_PURGE_INTERVAL = 6 * 60 * MINUTE;

/** Compress API/HTML/JSON, never protected streams or already-compressed media. */
function shouldCompress(req: Request, res: Response): boolean {
  if (req.originalUrl.startsWith('/stream/')) return false;
  const type = String(res.getHeader('Content-Type') ?? '');
  if (/^(video|audio|image)\//.test(type)) return false;
  return compression.filter(req, res);
}

const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, next) => {
    if (res.headersSent) return next(err); // let Express close the half-sent response
    if (err instanceof HttpError) {
      res.status(err.status).json({ code: err.code, message: err.message, ...err.extra });
      return;
    }
    // body-parser errors carry an HTTP status and a `type`.
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status === 413) {
      res.status(413).json({ code: 'payload_too_large', message: 'The request body is too large.' });
      return;
    }
    if (status >= 400 && status < 500) {
      const code = err?.type === 'entity.parse.failed' ? 'invalid_json' : 'bad_request';
      res.status(status).json({ code, message: code === 'invalid_json' ? 'The request body is not valid JSON.' : 'The request could not be processed.' });
      return;
    }
    logger.error(`${req.method} ${req.originalUrl} failed`, err);
    res.status(500).json({ code: 'server_error', message: 'Something went wrong on our side. Please try again.' });
  };

/** Production: serve the Vite build with immutable hashed assets and an SPA fallback. */
function mountClient(app: Express, config: ServerConfig, logger: Logger) {
  const indexFile = path.join(config.distDir, 'index.html');
  if (!config.production) {
    app.get('/', (_req, res) => {
      res.type('text/plain').send(`Monumental Streams API (${config.env}). Open the web app at ${config.appOrigin}.`);
    });
    return;
  }
  if (!existsSync(indexFile)) {
    logger.warn(`No client build at ${indexFile} — run "npm run build". Serving the API only.`);
    return;
  }
  app.use('/assets', express.static(path.join(config.distDir, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: false }));
  app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || /^\/(api|stream|media)(\/|$)/.test(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
}

export async function createApp(options: CreateAppOptions): Promise<MonumentalApp> {
  const { config } = options;
  const logger = options.logger ?? consoleLogger;
  let content = options.content;
  if (!content) {
    content = await loadContent({ contentDir: config.contentDir, mediaDir: config.mediaDir });
    for (const w of content.warnings) logger.warn(`content: ${w}`);
  }
  const db = openDatabase(config.dataDir);

  const ctx: AppContext = {
    config,
    db,
    content,
    csrf: createCsrf(config.sessionSecret, config.production),
    logger,
    policy: { devPreviewEnabled: config.devPreviewMembership, production: config.production },
    limits: {
      authPerIdentity: createRateLimiter(15 * MINUTE, 10),
      authPerIp: createRateLimiter(15 * MINUTE, 100),
      playback: createRateLimiter(MINUTE, 120),
    },
    now: options.now ?? (() => new Date()),
    fetch: options.fetch ?? globalThis.fetch,
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders(config.production));
  app.use(compression({ filter: shouldCompress }));
  app.use(['/api', '/stream'], sessionMiddleware(ctx));

  // Stripe signs the raw body, so this must run before any JSON parsing and before CSRF.
  app.post('/api/billing/webhook', ...webhookHandlers(ctx));

  app.use('/api', ctx.csrf.protect(config.appOrigin));
  app.use('/api', libraryRouter(ctx)); // carries its own larger body limit
  app.use('/api', express.json({ limit: API_BODY_LIMIT }));
  app.use('/api', publicApiRouter(ctx), authRouter(ctx), playbackRouter(ctx), billingRouter(ctx));
  if (devPreviewEnabled(ctx)) app.use('/api', devPreviewRouter(ctx));
  app.use('/api', (req, res) => {
    res.status(404).json({ code: 'not_found', message: `No API route for ${req.method} ${req.originalUrl.split('?')[0]}.` });
  });

  app.use('/stream', streamRouter(ctx));
  app.use('/media/public', express.static(path.join(config.mediaDir, 'public'), { maxAge: '1d', index: false, dotfiles: 'ignore' }));
  mountClient(app, config, logger);

  app.use((_req, res) => {
    res.status(404).json({ code: 'not_found', message: 'Not found.' });
  });
  app.use(errorHandler(logger));

  const purge = setInterval(() => db.sessions.purgeExpired(Date.now()), SESSION_PURGE_INTERVAL);
  purge.unref();

  return {
    app,
    ctx,
    close() {
      clearInterval(purge);
      db.close();
    },
  };
}

async function main() {
  const config = loadConfig();
  const logger = consoleLogger;
  for (const w of config.warnings) logger.warn(w);
  const { app, ctx, close } = await createApp({ config, logger });

  const server: Server = app.listen(config.port, config.host, (err?: Error) => {
    if (err) {
      logger.error(`Could not listen on ${config.host}:${config.port}`, err);
      process.exit(1);
    }
    const shownHost = config.host === '0.0.0.0' || config.host === '::' ? 'localhost' : config.host;
    logger.info(
      `Monumental Streams server on http://${shownHost}:${config.port} (${config.env}; catalogue ${ctx.content.version}; ` +
        `${ctx.content.raw.videos.length} videos; billing ${billingMode(config.stripe)})`,
    );
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received — closing connections`);
    server.close(() => {
      close();
      process.exit(0);
    });
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err instanceof ContentError || err instanceof ConfigError ? err.message : err);
    process.exit(1);
  });
}
