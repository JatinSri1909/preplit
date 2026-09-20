import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { crawlSite } from './crawlSite.js';
import { startFixtureServer } from './testFixtures/fixtureServer.js';

describe('crawlSite (against a local fixture site)', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const started = await startFixtureServer();
    server = started.server;
    origin = started.origin;
  });

  afterAll(() => {
    server.close();
  });

  it('finds the hiring page without a hard-coded path, via link ranking', async () => {
    const result = await crawlSite(origin, { allowPrivateHosts: true, delayMs: 0 });

    expect(result.hiringPage).not.toBeNull();
    expect(result.hiringPage?.url).toBe(`${origin}/opportunities`);
    expect(result.hiringPage?.text).toContain('take-home project');
  });

  it('fetches the homepage plus discovered on-site pages', async () => {
    const result = await crawlSite(origin, { allowPrivateHosts: true, delayMs: 0 });
    const urls = result.pagesUsed.map((p) => p.url);
    expect(urls).toContain(`${origin}/`);
    expect(urls).toContain(`${origin}/opportunities`);
  });

  it('respects robots.txt and skips disallowed paths', async () => {
    const result = await crawlSite(origin, { allowPrivateHosts: true, delayMs: 0 });
    const urls = result.pagesUsed.map((p) => p.url);
    expect(urls).not.toContain(`${origin}/contact`);
    expect(result.skipped.some((s) => s.url === `${origin}/contact`)).toBe(true);
  });

  it('reports a fully unreachable company URL as skipped rather than throwing', async () => {
    const result = await crawlSite('http://127.0.0.1:1/', { allowPrivateHosts: true, delayMs: 0, timeoutMs: 500 });
    expect(result.pagesUsed).toHaveLength(0);
    expect(result.hiringPage).toBeNull();
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('refuses private hosts when allowPrivateHosts is not set (production posture)', async () => {
    const result = await crawlSite(origin, { delayMs: 0 });
    expect(result.pagesUsed).toHaveLength(0);
    expect(result.skipped[0].reason).toMatch(/private|loopback/i);
  });
});
