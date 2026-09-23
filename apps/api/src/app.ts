import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
if (existsSync(path.resolve(process.cwd(), '../../.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
}
import express from 'express';
import cors from 'cors';
import { connectDb } from './database/connect.js';
import { sessionMiddleware } from './modules/auth/session.middleware.js';
import { requireAuth } from './common/middleware/require-auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { kitsRouter } from './modules/kits/kits.routes.js';
import { llmPoolStatus } from './modules/kits/kits.helpers.js';

const app = express();
// Every deployment target (Vercel, Render, ...) terminates TLS at its own
// edge/proxy and forwards to this process over plain HTTP, signalling the
// original scheme via X-Forwarded-Proto. Without this, Express's
// req.secure is always false behind that proxy, which makes the
// session cookie's `secure: true` option (see session.middleware.ts) silently
// refuse to set the cookie at all in production — not a rejected cookie,
// no Set-Cookie header sent in the first place.
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  }),
);
app.use(sessionMiddleware());

/**
 * On a persistent server (Render, local dev) the database is connected
 * once at startup, before anything is listening. On Vercel there is no
 * startup phase to hang that off — each request may hit a cold function
 * instance — so every request awaits the connection instead. connectDb()
 * is idempotent (see database/connect.ts's `connected` flag), so on a warm
 * instance this resolves immediately and adds no real latency.
 */
app.use((_req, _res, next) => {
  connectDb().then(() => next(), next);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

/**
 * Per-model rate-limit headroom for the Groq pool — not a secret, so
 * this is a diagnostics endpoint like /health rather than behind
 * requireAuth. Answers "is the model pool actually helping" without
 * digging through logs.
 */
app.get('/llm-status', (_req, res) => {
  res.json({ models: llmPoolStatus() ?? [] });
});

app.use('/auth', authRouter);
app.use('/kits', requireAuth, kitsRouter);

// Centralized error handler — anything an async route handler throws
// (including a rejected promise, since Express 5-style async handlers are
// not used here) lands here as a structured JSON error rather than an
// unhandled stack trace leaking to the client (brief Section 13: "Handle
// errors gracefully and return useful, structured messages to the
// interface").
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unexpected error.' },
  });
});

export default app;
