import dns from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Brief Section 11: "Validate external URLs before fetching them, and
 * reject private and loopback addresses in production."
 *
 * The batch command (Appendix B) is explicitly run against company sites
 * served from a local address, so `allowPrivateHosts` exists as an escape
 * hatch — it must be wired to ALLOW_PRIVATE_HOSTS in the environment, and
 * that env var must never be true in the deployed production API.
 */

// Fast literal-string rejections. This alone does not stop a hostname that
// merely RESOLVES to a private address (DNS rebinding, or a hostname like
// metadata.google.internal) — see resolvesToPrivateAddress below, which is
// the actual authority for "is it safe to connect to this host".
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

const IPV4_PRIVATE_RANGES: [base: string, bits: number][] = [
  ['127.0.0.0', 8], // loopback
  ['10.0.0.0', 8], // private
  ['172.16.0.0', 12], // private
  ['192.168.0.0', 16], // private
  ['169.254.0.0', 16], // link-local (includes cloud metadata, 169.254.169.254)
  ['100.64.0.0', 10], // shared/carrier-grade NAT (includes some cloud metadata services)
  ['0.0.0.0', 8], // "this network"
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return IPV4_PRIVATE_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Expands a (possibly `::`-compressed) IPv6 address into 8 16-bit groups. */
function expandIpv6(ip: string): number[] | null {
  const clean = ip.replace(/^\[|\]$/g, '').split('%')[0];
  const [head, tail] = clean.includes('::') ? clean.split('::') : [clean, undefined];
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const allParts = [...headParts, ...Array(clean.includes('::') ? missing : 0).fill('0'), ...tailParts];
  if (allParts.length !== 8) return null;
  const groups = allParts.map((p) => parseInt(p, 16));
  return groups.some((g) => Number.isNaN(g)) ? null : groups;
}

function isPrivateIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true; // unparsable — fail closed
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  if ([g0, g1, g2, g3, g4, g5, g6].every((g) => g === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) addresses embed
  // a real IPv4 address in the low 32 bits — that embedded address is what
  // actually gets connected to, so it must pass the same IPv4 checks.
  const isMapped = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
  const isNat64 = g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if (isMapped || isNat64) {
    const embedded = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;
    return isPrivateIpv4(embedded);
  }

  return false;
}

function isPrivateIpLiteral(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // not a recognizable IP literal — fail closed
}

/**
 * Resolves `hostname` and reports whether ANY of its addresses are
 * private/loopback/link-local — this is the check that actually matters,
 * since it covers the address `fetch()` will connect to, not just the
 * hostname string in the URL (closing the DNS-rebinding gap where a
 * validated public-looking hostname resolves to an internal address).
 */
async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const bareHostname = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bareHostname)) return isPrivateIpLiteral(bareHostname);

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(bareHostname, { all: true, verbatim: true });
  } catch {
    // Can't resolve it at all — nothing to connect to, and definitely not
    // safe to treat as a reachable public host.
    return true;
  }
  if (addresses.length === 0) return true;
  return addresses.some((a) => isPrivateIpLiteral(a.address));
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

export async function validateFetchUrl(rawUrl: string, allowPrivateHosts = false): Promise<URL> {
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
    if (await resolvesToPrivateAddress(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch "${hostname}": resolves to a private/loopback address`);
    }
  }

  return url;
}

export interface SafeFetchOptions {
  allowPrivateHosts?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Redirect hops to follow before giving up. Each hop is re-validated. */
  maxRedirects?: number;
}

const DEFAULT_MAX_REDIRECTS = 5;

/**
 * fetch(), but every redirect hop's target is re-validated with
 * validateFetchUrl before it's followed — a URL that is a safe public host
 * at validation time can still 302 to an internal/metadata address, and
 * `redirect: 'follow'` would connect to it with no further checks.
 */
export async function fetchValidated(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ response: Response; finalUrl: URL }> {
  const { allowPrivateHosts = false, timeoutMs = 8000, headers, maxRedirects = DEFAULT_MAX_REDIRECTS } = opts;

  let currentUrl = await validateFetchUrl(rawUrl, allowPrivateHosts);

  for (let redirects = 0; ; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), { signal: controller.signal, redirect: 'manual', headers });
    } finally {
      clearTimeout(timer);
    }

    const location = response.headers.get('location');
    const isRedirect = response.status >= 300 && response.status < 400 && !!location;
    if (!isRedirect) return { response, finalUrl: currentUrl };

    if (redirects >= maxRedirects) {
      throw new UnsafeUrlError(`Too many redirects fetching "${rawUrl}"`);
    }
    const nextUrl = new URL(location, currentUrl.toString());
    currentUrl = await validateFetchUrl(nextUrl.toString(), allowPrivateHosts);
  }
}
