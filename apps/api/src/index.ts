import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
if (existsSync(path.resolve(process.cwd(), '../../.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
}
import express from 'express';
import cors from 'cors';
import { connectDb } from './db/connect.js';
import { sessionMiddleware, requireAuth } from './auth/session.js';
import { authRouter } from './routes/authRoutes.js';
import { kitsRouter } from './routes/kitsRoutes.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  }),
);
app.use(sessionMiddleware());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
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

const port = Number(process.env.PORT ?? 4000);

connectDb()
  .then(() => {
    app.listen(port, () => console.log(`API listening on :${port}`));
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
