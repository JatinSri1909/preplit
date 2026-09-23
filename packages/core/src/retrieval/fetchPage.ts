import * as cheerio from 'cheerio';
import { fetchValidated } from './urlSafety.js';

/**
 * Retrieval layer, half of the split the brief asks for (Section 3):
 *   - fetchPage (here): retrieve + clean ONE page
 *   - crawlSite (./crawlSite.ts): decide which links are worth fetching
 *
 * Security (brief Section 11): validates the URL before fetching, restricts
 * to text/html content-type and a max byte size, and never executes
 * anything found on the page — the extracted text is returned as inert
 * data for the caller (and eventually the LLM) to treat as content, never
 * as instructions.
 */

export interface PageLink {
  url: string;
  /** Visible anchor text, trimmed. Used by crawlSite's link ranking. */
  text: string;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string | null;
  text: string; // cleaned, readable text extracted from HTML
  links: string[]; // absolute URLs discovered on the page, deduplicated
  linkDetails: PageLink[]; // same links, paired with their anchor text
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowPrivateHosts?: boolean;
  userAgent?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2_000_000; // 2MB
const DEFAULT_USER_AGENT = 'AIInterviewPrepKitBot/1.0 (+https://github.com/JatinSri1909)';

// Tags whose content is not useful as page text (scripts, styles, nav
// chrome). Stripped before extracting text so prompts aren't padded with
// noise, and so a page can't smuggle instructions into an LLM prompt via a
// <script> or hidden element.
const STRIP_SELECTORS = 'script, style, noscript, svg, nav, footer, [aria-hidden="true"]';

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchedPage> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    allowPrivateHosts = false,
    userAgent = DEFAULT_USER_AGENT,
  } = opts;

  const { response, finalUrl: validated } = await fetchValidated(url, {
    allowPrivateHosts,
    timeoutMs,
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
  });

  const contentType = response.headers.get('content-type');
  const isHtml = !contentType || /text\/html|application\/xhtml\+xml/i.test(contentType);
  if (!isHtml) {
    return { url: validated.toString(), status: response.status, contentType, text: '', links: [], linkDetails: [] };
  }

  const reader = response.body?.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }
  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');

  const $ = cheerio.load(html);

  // Harvest links BEFORE stripping nav/footer — real hiring links live in
  // nav bars and footers more often than in body copy, and we still want
  // them even though nav/footer text itself is noise for the LLM prompt.
  const links = new Set<string>();
  const linkDetails: PageLink[] = [];
  const seenForDetails = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const abs = new URL(href, validated.toString());
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return;
      const absStr = abs.toString();
      links.add(absStr);
      if (!seenForDetails.has(absStr)) {
        seenForDetails.add(absStr);
        linkDetails.push({ url: absStr, text: $(el).text().replace(/\s+/g, ' ').trim() });
      }
    } catch {
      // ignore malformed hrefs
    }
  });

  $(STRIP_SELECTORS).remove();
  const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    url: validated.toString(),
    status: response.status,
    contentType,
    text,
    links: [...links],
    linkDetails,
  };
}
