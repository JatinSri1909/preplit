import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Workspace packages declare `main: ./dist/index.js`, which only exists
 * after `npm run build`. Tests must run on a clean clone without a build
 * step, so resolve the two internal packages to their TypeScript source
 * instead — Vite compiles them on the fly.
 *
 * This is test-time only: the API, the CLI and the Next.js app all still
 * consume the built `dist` output, so we are not silently testing a
 * different module graph than we ship.
 */
const srcOf = (pkg: string) =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@prep-kit\/core$/, replacement: srcOf('core') },
      { find: /^@prep-kit\/llm$/, replacement: srcOf('llm') },
    ],
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts', 'cli/**/*.test.ts'],
    environment: 'node',
  },
});
