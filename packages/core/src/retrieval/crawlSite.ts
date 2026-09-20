import { fetchPage, FetchedPage } from './fetchPage.js';
import { fetchRobotsRules, isPathAllowed } from './robotsTxt.js';
import { UnsafeUrlError } from './urlSafety.js';

export interface CrawlResult {
  pagesUsed: FetchedPage[];
  hiringPage: FetchedPage | null;
  skipped: { url: string; reason: string }[];
}

export interface CrawlOptions {
  maxPages?: number;
  allowPrivateHosts?: boolean;
  timeoutMs?: number;
  /** Delay between sequential fetches, ms. Simple politeness rate limit. */
  delayMs?: number;
}

const DEFAULT_MAX_PAGES = 15;
const DEFAULT_DELAY_MS = 250;

/**
 * Keywords that suggest a link leads to hiring/careers content. Deliberately
 * broad — the brief is explicit that a fixed path list ("/careers") is not
 * sufficient, because companies bury this page in wildly different places
 * (an engineering blog, a handbook, "/join-us", etc). Scored on BOTH the
 * URL path and the anchor text, since either alone can miss it.
 */
const HIRING_KEYWORDS = [
  'career', 'careers', 'jobs', 'job', 'hiring', 'hire', 'join-us', 'join_us',
  'joinus', 'work-with-us', 'life-at', 'team', 'openings', 'positions',
  'handbook', 'engineering-blog', 'eng-blog', 'we-are-hiring',
];

function scoreLink(url: string, anchorText: string): number {
  const haystack = `${url.toLowerCase()} ${anchorText.toLowerCase()}`;
  let score = 0;
  for (const kw of HIRING_KEYWORDS) {
    if (haystack.includes(kw)) score += 10;
  }
  // Slight boost for shallow paths (a top-level /careers beats a buried
  // /blog/2019/03/some-post-that-happens-to-mention-hiring).
  try {
    const depth = new URL(url).pathname.split('/').filter(Boolean).length;
    score += Math.max(0, 3 - depth);
  } catch {
    // ignore
  }
  return score;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crawl a company site starting from its homepage: fetch the homepage,
 * rank every link found on it by hiring-relevance, then fetch the
 * top-ranked candidates (breadth-first, one level deep) to find an actual
 * hiring/careers page. A fixed path list is explicitly disallowed by the
 * brief — ranking is based on link text + URL heuristics discovered by
 * crawling, not a guess.
 *
 * Must (brief Section 2): rate-limit requests, back off on failure,
 * skip-and-report a source that can't be retrieved rather than failing the
 * whole run, respect robots.txt, cap total pages fetched.
 */
export async function crawlSite(companyUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const {
    maxPages = DEFAULT_MAX_PAGES,
    allowPrivateHosts = false,
    timeoutMs,
    delayMs = DEFAULT_DELAY_MS,
  } = opts;

  const pagesUsed: FetchedPage[] = [];
  const skipped: { url: string; reason: string }[] = [];
  const visited = new Set<string>();

  let homepage: FetchedPage;
  let origin: string;
  try {
    homepage = await fetchPage(companyUrl, { allowPrivateHosts, timeoutMs });
    origin = new URL(homepage.url).origin;
  } catch (err) {
    // Can't even reach the homepage — report and return an empty-but-honest
    // result. The caller (pipeline) decides whether this is a hard failure
    // or an "ok, but with gaps" case per brief Section 10.
    skipped.push({ url: companyUrl, reason: describeError(err) });
    return { pagesUsed: [], hiringPage: null, skipped };
  }
  pagesUsed.push(homepage);
  visited.add(homepage.url);

  const robots = await fetchRobotsRules(origin, { allowPrivateHosts, timeoutMs });

  // Rank homepage links by URL heuristics AND anchor text — a page like
  // "/opportunities" carries no hiring keyword in its path, only in the
  // link label ("We're hiring"), so both signals matter.
  const ranked = homepage.linkDetails
    .filter(({ url }) => {
      try {
        return new URL(url).origin === origin; // stay on-site
      } catch {
        return false;
      }
    })
    .map(({ url, text }) => ({ link: url, score: scoreLink(url, text) }))
    .sort((a, b) => b.score - a.score);

  let hiringPage: FetchedPage | null = null;

  for (const { link, score } of ranked) {
    if (pagesUsed.length >= maxPages) break;
    if (visited.has(link)) continue;
    visited.add(link);

    const path = (() => {
      try {
        return new URL(link).pathname;
      } catch {
        return '/';
      }
    })();
    if (!isPathAllowed(robots, path)) {
      skipped.push({ url: link, reason: 'disallowed by robots.txt' });
      continue;
    }

    await sleep(delayMs);
    try {
      const page = await fetchPage(link, { allowPrivateHosts, timeoutMs });
      pagesUsed.push(page);
      if (score > 0 && !hiringPage) hiringPage = page;
    } catch (err) {
      skipped.push({ url: link, reason: describeError(err) });
    }
  }

  return { pagesUsed, hiringPage, skipped };
}

function describeError(err: unknown): string {
  if (err instanceof UnsafeUrlError) return err.message;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'request timed out';
    return err.message;
  }
  return 'unknown error';
}
