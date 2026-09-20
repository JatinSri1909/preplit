#!/usr/bin/env tsx
/**
 * Appendix B mandatory batch entry point.
 *
 *   npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Reads an array of BatchCase, runs the SAME runPipeline() the API uses on
 * each one, and writes a single BatchOutput JSON file. Continues past a
 * per-case failure (recording it) rather than aborting the whole run.
 *
 * The company sites used against this command may be served from a local
 * address (e.g. http://localhost:8099/...), so ALLOW_PRIVATE_HOSTS=true
 * should be set in the environment when running this command against local
 * fixtures — never in the deployed production API.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
if (existsSync(path.resolve(process.cwd(), '../.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}
import {
  BatchCase,
  BatchInputSchema,
  BatchOutput,
  BatchKitResult,
  ErrorCodes,
  runPipeline,
} from '@prep-kit/core';
import { GeminiClient } from '@prep-kit/llm';

interface Args {
  input: string;
  output: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const input = get('--input');
  const output = get('--output');
  if (!input || !output) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }
  return { input, output };
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(await readFile(input, 'utf-8'));
  const cases: BatchCase[] = BatchInputSchema.parse(raw);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set. See .env.example.');
    process.exit(1);
  }
  const llm = new GeminiClient({ apiKey, model: process.env.GEMINI_MODEL });
  const allowPrivateHosts = process.env.ALLOW_PRIVATE_HOSTS === 'true';

  const results: BatchKitResult[] = [];

  for (const c of cases) {
    try {
      const kit = await runPipeline(
        { jd: c.jd, companyUrl: c.company_url, days: c.days },
        { llm, allowPrivateHosts },
      );
      results.push({ id: c.id, status: 'ok', kit, error: null });
    } catch (err) {
      results.push({
        id: c.id,
        status: 'failed',
        kit: null,
        error: {
          code: (err as { code?: string })?.code ?? ErrorCodes.UNKNOWN,
          message: err instanceof Error ? err.message : String(err),
        },
      });
      // Continue to the next case — a single failure must not abort the run.
      console.error(`case ${c.id} failed:`, err);
    }
  }

  const out: BatchOutput = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await writeFile(output, JSON.stringify(out, null, 2), 'utf-8');
  const okCount = results.filter((r) => r.status === 'ok').length;
  console.log(`Wrote ${results.length} results to ${output} (${okCount} ok, ${results.length - okCount} failed)`);
}

main().catch((err) => {
  console.error('Fatal error running batch evaluation:', err);
  process.exit(1);
});
