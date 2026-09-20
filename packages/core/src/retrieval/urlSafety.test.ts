import { describe, it, expect } from 'vitest';
import { validateFetchUrl, UnsafeUrlError } from './urlSafety.js';

describe('validateFetchUrl', () => {
  it('accepts a normal public https URL', () => {
    expect(() => validateFetchUrl('https://example.com/careers')).not.toThrow();
  });

  it('rejects localhost by default', () => {
    expect(() => validateFetchUrl('http://localhost:8099/acme/')).toThrow(UnsafeUrlError);
  });

  it('rejects private 192.168.x.x addresses by default', () => {
    expect(() => validateFetchUrl('http://192.168.1.5/')).toThrow(UnsafeUrlError);
  });

  it('rejects 127.0.0.1 by default', () => {
    expect(() => validateFetchUrl('http://127.0.0.1:3000/')).toThrow(UnsafeUrlError);
  });

  it('allows localhost when allowPrivateHosts is true (batch/local fixture mode)', () => {
    expect(() => validateFetchUrl('http://localhost:8099/acme/', true)).not.toThrow();
  });

  it('rejects malformed URLs', () => {
    expect(() => validateFetchUrl('not a url')).toThrow(UnsafeUrlError);
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => validateFetchUrl('file:///etc/passwd')).toThrow(UnsafeUrlError);
  });
});
