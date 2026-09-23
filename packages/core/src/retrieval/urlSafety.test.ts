import { describe, it, expect } from 'vitest';
import { validateFetchUrl, UnsafeUrlError } from './urlSafety.js';

describe('validateFetchUrl', () => {
  it('accepts a normal public https URL', async () => {
    await expect(validateFetchUrl('https://example.com/careers')).resolves.toBeInstanceOf(URL);
  });

  it('rejects localhost by default', async () => {
    await expect(validateFetchUrl('http://localhost:8099/acme/')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects private 192.168.x.x addresses by default', async () => {
    await expect(validateFetchUrl('http://192.168.1.5/')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects 127.0.0.1 by default', async () => {
    await expect(validateFetchUrl('http://127.0.0.1:3000/')).rejects.toThrow(UnsafeUrlError);
  });

  it('allows localhost when allowPrivateHosts is true (batch/local fixture mode)', async () => {
    await expect(validateFetchUrl('http://localhost:8099/acme/', true)).resolves.toBeInstanceOf(URL);
  });

  it('rejects malformed URLs', async () => {
    await expect(validateFetchUrl('not a url')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects non-http(s) protocols', async () => {
    await expect(validateFetchUrl('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects an IPv4-mapped IPv6 literal for a link-local/metadata address', async () => {
    await expect(validateFetchUrl('http://[::ffff:169.254.169.254]/')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a shared/carrier-grade-NAT literal (100.64.0.0/10, e.g. Alibaba metadata)', async () => {
    await expect(validateFetchUrl('http://100.100.100.200/')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects a hostname whose DNS resolution cannot be confirmed as public', async () => {
    // Either "unresolvable" or "resolves to a private address" is fine here
    // — both must be refused, since the whole point is that the hostname
    // string alone is not enough to know it's safe to connect to.
    await expect(validateFetchUrl('http://private-only.localhost/')).rejects.toThrow(UnsafeUrlError);
  });
});
