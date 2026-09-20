import { describe, it, expect } from 'vitest';
import { assertOwnsKit, ForbiddenError } from './ownership.js';

describe('assertOwnsKit', () => {
  it('does not throw when the requesting user owns the kit', () => {
    expect(() => assertOwnsKit('user-1', 'user-1')).not.toThrow();
  });

  it('throws ForbiddenError when the requesting user does not own the kit', () => {
    expect(() => assertOwnsKit('user-1', 'user-2')).toThrow(ForbiddenError);
  });
});
