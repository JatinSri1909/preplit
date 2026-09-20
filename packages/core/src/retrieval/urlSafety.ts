/**
 * Brief Section 11: "Validate external URLs before fetching them, and
 * reject private and loopback addresses in production."
 *
 * The batch command (Appendix B) is explicitly run against company sites
 * served from a local address, so `allowPrivateHosts` exists as an escape
 * hatch — it must be wired to ALLOW_PRIVATE_HOSTS in the environment, and
 * that env var must never be true in the deployed production API.
 */

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./, // link-local
  /^\[?::1\]?$/, // IPv6 loopback
  /^\[?fc00:/i, // IPv6 unique local
  /^\[?fe80:/i, // IPv6 link-local
];

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export function validateFetchUrl(rawUrl: string, allowPrivateHosts = false): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`"${rawUrl}" is not a valid URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported protocol "${url.protocol}" for "${rawUrl}"`);
  }

  if (!allowPrivateHosts) {
    const hostname = url.hostname;
    if (PRIVATE_HOSTNAME_PATTERNS.some((p) => p.test(hostname))) {
      throw new UnsafeUrlError(`Refusing to fetch private/loopback address "${hostname}"`);
    }
  }

  return url;
}
