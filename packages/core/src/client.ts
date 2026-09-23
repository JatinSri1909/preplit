/**
 * Browser-safe subset of this package's public API.
 *
 * The main entry ('.') re-exports the retrieval layer (fetchPage, crawlSite,
 * urlSafety, robotsTxt), which imports Node's `node:dns`/`node:net` and
 * fetches arbitrary URLs — it must never end up in a client bundle. The web
 * app imports types (erased at compile time, so they never reach webpack)
 * everywhere except PIPELINE_STEPS/PIPELINE_STEP_LABELS, which are real
 * runtime values — import those two from here (`@prep-kit/core/client`)
 * rather than the main entry.
 */
export * from './pipelineSteps.js';
export * from './types/kit.js';
export * from './types/batch.js';
