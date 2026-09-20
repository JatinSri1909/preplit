import * as cheerio from 'cheerio';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * DuckDuckGo's HTML endpoint (html.duckduckgo.com/html/) requires no API
 * key and has no documented rate limit for light, infrequent use — a
 * reasonable choice for "Scraping: your choice" given the brief also says
 * "we will not supply you with an API key" for anything, including search.
 * If this proves too fragile in practice, swap in Bing/Serper/Brave here —
 * this function is the single seam to change.
 */
export async function searchWeb(
  query: string,
  opts: { timeoutMs?: number; maxResults?: number } = {},
): Promise<SearchResult[]> {
  const { timeoutMs = 8000, maxResults = 5 } = opts;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'AIInterviewPrepKitBot/1.0' },
    });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return []; // search failing is not fatal — caller treats "no results" honestly
  } finally {
    clearTimeout(timer);
  }

  return parseDuckDuckGoHtml(html).slice(0, maxResults);
}

export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $('.result').each((_, el) => {
    const titleEl = $(el).find('.result__a').first();
    const title = titleEl.text().trim();
    const href = titleEl.attr('href');
    const snippet = $(el).find('.result__snippet').first().text().trim();
    if (title && href) {
      results.push({ title, url: normalizeDdgUrl(href), snippet });
    }
  });
  return results;
}

function normalizeDdgUrl(href: string): string {
  // DDG's HTML endpoint wraps result links in a redirect
  // (//duckduckgo.com/l/?uddg=<encoded>&...); unwrap it when present.
  try {
    const asUrl = new URL(href, 'https://duckduckgo.com');
    const uddg = asUrl.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : asUrl.toString();
  } catch {
    return href;
  }
}
