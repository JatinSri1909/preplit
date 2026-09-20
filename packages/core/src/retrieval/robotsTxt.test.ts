import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, isPathAllowed } from './robotsTxt.js';

describe('parseRobotsTxt', () => {
  it('extracts Disallow rules from the wildcard user-agent block', () => {
    const body = `User-agent: *\nDisallow: /admin\nDisallow: /private/\n\nUser-agent: Googlebot\nDisallow: /google-only`;
    const rules = parseRobotsTxt(body);
    expect(rules.disallow).toEqual(['/admin', '/private/']);
  });

  it('ignores comments and blank lines', () => {
    const body = `# comment\nUser-agent: *\n\n# another\nDisallow: /admin\n`;
    expect(parseRobotsTxt(body).disallow).toEqual(['/admin']);
  });

  it('returns no rules when there is no wildcard block', () => {
    const body = `User-agent: Googlebot\nDisallow: /x`;
    expect(parseRobotsTxt(body).disallow).toEqual([]);
  });
});

describe('isPathAllowed', () => {
  it('disallows a path under a blocked prefix', () => {
    const rules = { disallow: ['/admin'] };
    expect(isPathAllowed(rules, '/admin/settings')).toBe(false);
  });

  it('allows a path not under any blocked prefix', () => {
    const rules = { disallow: ['/admin'] };
    expect(isPathAllowed(rules, '/careers')).toBe(true);
  });

  it('allows everything when there are no rules', () => {
    expect(isPathAllowed({ disallow: [] }, '/anything')).toBe(true);
  });
});
