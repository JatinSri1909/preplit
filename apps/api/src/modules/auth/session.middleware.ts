import cookieSession from 'cookie-session';

/**
 * Minimal session handling (brief Section 1): signed, httpOnly cookies
 * carrying just a userId — no server-side session store needed for this
 * scope. "Sensible handling of expired or invalid sessions" means:
 * requireAuth returns 401 for a missing/expired/tampered session rather
 * than letting the request reach a protected handler.
 */
export function sessionMiddleware() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set. See .env.example.');
  const isProduction = process.env.NODE_ENV === 'production';
  return cookieSession({
    name: 'session',
    secret,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    // Deployed, the web app and the API sit on
    // different registrable domains, so every authenticated request from
    // the browser is cross-site. `lax` would silently drop the session
    // cookie on those requests and every protected route would 401.
    // `none` is what actually works there, and it requires `secure`.
    // Locally both run on localhost, so `lax` is correct and lets the
    // app work over plain http.
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  });
}
