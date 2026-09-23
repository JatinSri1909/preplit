/**
 * Split out of pipeline.ts so it can be imported without pulling in the
 * pipeline's own dependencies (crawlSite → fetchPage → urlSafety, which
 * import Node's dns/net modules). pipeline.ts re-exports these for every
 * existing consumer of the main package entry; client.ts (the browser-safe
 * entry — see that file's comment) exports only this.
 *
 * The steps a caller can observe from the outside, in the order
 * runPipeline actually executes them. Kept to the granularity a human
 * watching a progress list cares about — several internal steps (crawl +
 * company-brief summarisation, schedule build + final validation) are
 * reported under one entry because they're inseparable in wall-clock time.
 */
export const PIPELINE_STEPS = [
  'extracting_requirements',
  'crawling_company_site',
  'researching_interview_process',
  'generating_questions',
  'checking_coverage',
  'building_schedule',
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  extracting_requirements: 'Reading the job description for its requirements',
  crawling_company_site: 'Crawling the company site for what they do and how they hire',
  researching_interview_process: 'Looking for public accounts of their interview process',
  generating_questions: 'Writing questions for each requirement',
  checking_coverage: 'Checking every must-have has a question, and filling the gaps',
  building_schedule: 'Laying the material out across your days',
};
