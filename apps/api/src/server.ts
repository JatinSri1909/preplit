import app from './app.js';
import { connectDb } from './database/connect.js';

/**
 * On Vercel there is no process to keep alive — the platform detects this
 * module's default export and invokes it per-request on its own runtime,
 * so calling app.listen() there would bind a port nothing will ever use.
 * Everywhere else (Render, local dev, the batch CLI's fixture server)
 * this is a real long-running process, so it connects once up front and
 * exits loudly on failure rather than serving traffic against a database
 * that was never there.
 */
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000);
  connectDb()
    .then(() => {
      app.listen(port, () => console.log(`API listening on :${port}`));
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err);
      process.exit(1);
    });
}

export default app;
