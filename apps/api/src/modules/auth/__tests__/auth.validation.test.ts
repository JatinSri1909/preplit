import { describe, it, expect } from 'vitest';
import { RegisterSchema, LoginSchema } from '../auth.validation.js';

describe('RegisterSchema', () => {
  it('accepts a valid email + strong-enough password', () => {
    const result = RegisterSchema.safeParse({ email: 'jay@example.com', password: 'longenough' });
    expect(result.success).toBe(true);
  });

  it('lowercases and trims the email', () => {
    const result = RegisterSchema.safeParse({ email: '  Jay@Example.com  ', password: 'longenough' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('jay@example.com');
  });

  it('rejects a malformed email', () => {
    const result = RegisterSchema.safeParse({ email: 'not-an-email', password: 'longenough' });
    expect(result.success).toBe(false);
  });

  it('rejects a too-short password', () => {
    const result = RegisterSchema.safeParse({ email: 'jay@example.com', password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('accepts any non-empty password (no strength check on login)', () => {
    const result = LoginSchema.safeParse({ email: 'jay@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = LoginSchema.safeParse({ email: 'jay@example.com', password: '' });
    expect(result.success).toBe(false);
  });
});
