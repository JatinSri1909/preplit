import { describe, it, expect } from 'vitest';
import { parseDuckDuckGoHtml } from './searchWeb.js';

const SAMPLE_HTML = `
<html><body>
  <div class="results">
    <div class="result results_links results_links_deep web-result">
      <div class="result__body">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww%2Eglassdoor%2Ecom%2Finterview%2Facme&amp;rut=abc">
          Acme Interview Questions | Glassdoor
        </a>
        <a class="result__snippet">Glassdoor users report a 3-round process: recruiter screen, take-home, onsite.</a>
      </div>
    </div>
    <div class="result results_links results_links_deep web-result">
      <div class="result__body">
        <a class="result__a" href="https://blog.example.com/acme-interview">Acme interview writeup</a>
        <a class="result__snippet">A candidate's blog post about interviewing at Acme.</a>
      </div>
    </div>
  </div>
</body></html>
`;

describe('parseDuckDuckGoHtml', () => {
  it('extracts title, unwrapped url, and snippet for each result', () => {
    const results = parseDuckDuckGoHtml(SAMPLE_HTML);
    expect(results).toHaveLength(2);
    expect(results[0].title).toContain('Acme Interview Questions');
    expect(results[0].url).toBe('https://www.glassdoor.com/interview/acme');
    expect(results[0].snippet).toContain('3-round process');
  });

  it('handles a direct (non-redirect) result URL', () => {
    const results = parseDuckDuckGoHtml(SAMPLE_HTML);
    expect(results[1].url).toBe('https://blog.example.com/acme-interview');
  });

  it('returns an empty array for HTML with no results', () => {
    expect(parseDuckDuckGoHtml('<html><body>No results.</body></html>')).toEqual([]);
  });
});
