import { validateFetchUrl } from './urlSafety.js';

/**
 * Minimal robots.txt support (brief Section 2: "Respect robots.txt and
 * site terms"). Only implements what we need: a User-agent: * block's
 * Disallow rules, longest-match-wins, which covers the overwhelming
 * majority of real robots.txt files without pulling in a full parser
 * dependency.
 */
export interface RobotsRules {
  disallow: string[];
}

const EMPTY_RULES: RobotsRules = { disallow: [] };

export async function fetchRobotsRules(
  origin: string,
  opts: { allowPrivateHosts?: boolean; timeoutMs?: number } = {},
): Promise<RobotsRules> {
  let robotsUrl: URL;
  try {
    robotsUrl = validateFetchUrl(new URL('/robots.txt', origin).toString(), opts.allowPrivateHosts);
  } catch {
    return EMPTY_RULES;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await fetch(robotsUrl.toString(), { signal: controller.signal });
    if (!res.ok) return EMPTY_RULES;
    const body = await res.text();
    return parseRobotsTxt(body);
  } catch {
    // Unreachable/malformed robots.txt: fail open with no rules rather than
    // blocking the whole crawl over a missing file (most sites don't have
    // one, and that is not itself a disallow signal).
    return EMPTY_RULES;
  } finally {
    clearTimeout(timer);
  }
}

export function parseRobotsTxt(body: string): RobotsRules {
  const lines = body.split('\n').map((l) => l.trim());
  const disallow: string[] = [];
  let inWildcardBlock = false;
  let currentAgentIsWildcard = false;

  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      currentAgentIsWildcard = value === '*';
      inWildcardBlock = currentAgentIsWildcard;
      continue;
    }
    if (key === 'disallow' && inWildcardBlock && value) {
      disallow.push(value);
    }
  }

  return { disallow };
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  return !rules.disallow.some((rule) => path.startsWith(rule));
}
