import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

/**
 * A tiny in-process HTTP server serving a fake company site, used to
 * integration-test crawlSite the same way the real batch grading harness
 * does (Appendix B: "company sites used with this command may be served
 * from a local address"). The hiring page is deliberately buried at an
 * unpredictable path, linked only from a nav item with no "careers" in the
 * URL itself but with hiring-flavoured surrounding link text — this is
 * what proves ranking is doing real work, not matching a lucky path.
 */

const PAGES: Record<string, string> = {
  '/': `<html><body>
    <h1>Acme Corp</h1>
    <p>We build widgets for the widget industry.</p>
    <nav>
      <a href="/about">About</a>
      <a href="/blog">Blog</a>
      <a href="/opportunities">We're hiring — join the team</a>
      <a href="/contact">Contact</a>
    </nav>
  </body></html>`,
  '/about': `<html><body><h1>About Acme</h1><p>Founded in 2015.</p></body></html>`,
  '/blog': `<html><body><h1>Blog</h1><p>Latest widget news.</p></body></html>`,
  '/opportunities': `<html><body>
    <h1>Careers at Acme</h1>
    <p>Our interview process: a take-home project followed by a system design round.</p>
  </body></html>`,
  '/contact': `<html><body><h1>Contact us</h1></body></html>`,
  '/robots.txt': `User-agent: *\nDisallow: /contact\n`,
};

export function startFixtureServer(): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const body = PAGES[url.pathname];
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': url.pathname === '/robots.txt' ? 'text/plain' : 'text/html',
      });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}
