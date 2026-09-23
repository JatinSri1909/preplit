import type { Request, Response } from 'express';
import { RegisterSchema, LoginSchema } from './auth.validation.js';
import { hashPassword, verifyPassword } from './auth.service.js';
import { User } from './auth.model.js';

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }
  const { email, password } = parsed.data;

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
    return;
  }

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await User.create({ email, passwordHash });
  } catch (err) {
    // The findOne check above is a check-then-act race: two concurrent
    // registrations for the same email can both pass it before either
    // insert lands, and the second insert then hits the unique index.
    // That's the ordinary "email taken" case racing with itself, not an
    // internal error — report it the same way, not as a raw 500.
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
      return;
    }
    throw err;
  }

  req.session = { userId: user.id };
  res.status(201).json({ id: user.id, email: user.email });
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: parsed.error.message } });
    return;
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    // Same generic message whether the email doesn't exist or the
    // password is wrong — don't leak which one it was.
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' } });
    return;
  }

  req.session = { userId: user.id };
  res.json({ id: user.id, email: user.email });
}

/**
 * Who am I? The web app calls this on load to decide between the signed-in
 * and signed-out shell. Deliberately outside `requireAuth`: "not signed
 * in" is a normal answer to this question, not an error, and a 401 here
 * would make every first page load look like a failure in the console.
 */
export async function me(req: Request, res: Response): Promise<void> {
  const userId = req.session?.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    res.json({ user: null });
    return;
  }
  const user = await User.findById(userId).select('email').lean().catch(() => null);
  // A valid-looking cookie for a user that no longer exists is an
  // expired session by any useful definition — clear it rather than
  // leaving the client in a half-signed-in state.
  if (!user) {
    req.session = null;
    res.json({ user: null });
    return;
  }
  res.json({ user: { id: String(user._id), email: user.email } });
}

export function logout(req: Request, res: Response): void {
  req.session = null;
  res.status(204).end();
}
