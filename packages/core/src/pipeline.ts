import { LlmClient } from '@prep-kit/llm';
import { Kit, Question } from './types/kit.js';
import { extractRequirements } from './extraction/extractRequirements.js';
import { crawlSite, CrawlResult } from './retrieval/crawlSite.js';
import { findInterviewDiscussion, InterviewDiscussionFinding } from './research/findInterviewDiscussion.js';
import {
  generateQuestionsForRequirement,
  generateQuestionsForGaps,
  QuestionGenerationContext,
} from './generation/generateQuestions.js';
import { findUncoveredMustHaveIds } from './coverage/checkCoverage.js';
import { buildSchedule } from './schedule/buildSchedule.js';
import { summarizeCompany } from './generation/summarizeCompany.js';
import { validateKit } from './validation/validateKit.js';

export interface PipelineInput {
  jd: string;
  companyUrl: string;
  days: number;
}

/**
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

export interface PipelineOptions {
  llm: LlmClient;
  /** Max coverage-loop passes after the first draft. Brief Section 4: decide and justify. */
  maxCoveragePasses?: number;
  allowPrivateHosts?: boolean;
  /** Injection seams for tests — default to the real implementations. */
  crawl?: typeof crawlSite;
  research?: typeof findInterviewDiscussion;
  /**
   * Fired synchronously right before each step below starts, so a caller
   * (the API's background job) can persist real progress instead of
   * guessing from elapsed time. Never awaited — a slow subscriber must not
   * slow down the pipeline itself.
   */
  onStep?: (step: PipelineStep) => void;
}

const DEFAULT_MAX_COVERAGE_PASSES = 2;

/**
 * The ONE pipeline. Both the Express API (per-request) and the CLI
 * (cli/evaluate.ts, looping over batch cases) call this function — never a
 * parallel reimplementation, per Appendix B's requirement.
 *
 * Sequencing (brief Section 3 — genuine, not a single mega-prompt):
 *   1. extractRequirements(jd)              — LLM call, requirement ids assigned in code
 *   2. crawlSite(companyUrl)                — deterministic crawl + link ranking
 *   3. findInterviewDiscussion(companyName) — best-effort, may return null
 *   4. generateQuestionsForRequirement(...) — one call per (requirement, category)
 *   5. findUncoveredMustHaveIds(...)        — deterministic, no LLM
 *   6. generateQuestionsForGaps(...)        — loop until covered or pass limit
 *   7. buildSchedule(...)                   — deterministic, no LLM
 *   8. validateKit(...)                     — structural + cross-referential check
 *
 * Never throws on a single unreachable source — crawlSite/findInterviewDiscussion
 * already skip-and-report internally, and those gaps are surfaced honestly
 * in source.pages_used / company_brief rather than failing the run (brief
 * Section 10). This function only throws when the kit genuinely cannot be
 * produced at all (e.g. requirement extraction itself fails after retries,
 * or the finished kit fails structural validation) — the caller (API route
 * or CLI) turns that into a recorded BatchError rather than crashing.
 */
export async function runPipeline(input: PipelineInput, opts: PipelineOptions): Promise<Kit> {
  const {
    llm,
    maxCoveragePasses = DEFAULT_MAX_COVERAGE_PASSES,
    allowPrivateHosts = false,
    crawl = crawlSite,
    research = findInterviewDiscussion,
    onStep,
  } = opts;

  const researchedAt = new Date().toISOString();

  // 1. Extraction — the only step that needs no retrieval at all (brief:
  // "Pasted text needs no retrieval at all").
  onStep?.('extracting_requirements');
  const { title, seniority, responsibilities, requirements } = await extractRequirements(input.jd, llm);

  // 2. Crawl — deterministic link ranking, never a hard-coded path.
  onStep?.('crawling_company_site');
  let crawlResult: CrawlResult;
  try {
    crawlResult = await crawl(input.companyUrl, { allowPrivateHosts });
  } catch {
    crawlResult = { pagesUsed: [], hiringPage: null, skipped: [{ url: input.companyUrl, reason: 'crawl failed' }] };
  }

  const companyName = guessCompanyName(input.companyUrl, crawlResult);

  // 2b. Company brief — an LLM summarisation of what was actually
  // crawled, or an explicit "nothing found" brief when the crawl came back
  // empty. summarizeCompany never throws, so an unreachable company site
  // still yields a kit (brief Section 10).
  const companyBrief = await summarizeCompany(
    { companyName, pages: crawlResult.pagesUsed },
    llm,
  );
  const companyBriefSummary = companyBrief.summary;

  // 3. Research — best-effort, degrades to null honestly.
  onStep?.('researching_interview_process');
  let discussion: InterviewDiscussionFinding | null = null;
  try {
    discussion = await research(companyName, llm, { allowPrivateHosts });
  } catch {
    discussion = null; // research failing entirely is not fatal
  }

  const genContext: QuestionGenerationContext = {
    roleTitle: title,
    hiringProcessSummary: discussion?.summary ?? crawlResult.hiringPage?.text.slice(0, 2000),
    companyBriefSummary,
  };

  // 4. First-pass generation — one call per (requirement, category).
  onStep?.('generating_questions');
  const questions: Question[] = [];
  let idSeq = 1;
  for (const requirement of requirements) {
    const generated = await generateQuestionsForRequirement(requirement, llm, genContext);
    for (const q of generated) {
      questions.push({ ...q, id: `q${idSeq++}` });
    }
  }

  // 5-6. Coverage loop — deterministic gap-finding, LLM only fills gaps.
  onStep?.('checking_coverage');
  let passes = 1;
  for (let pass = 0; pass < maxCoveragePasses; pass++) {
    const uncovered = findUncoveredMustHaveIds(requirements, questions);
    if (uncovered.length === 0) break;
    const gapQuestions = await generateQuestionsForGaps(requirements, uncovered, llm, genContext);
    for (const q of gapQuestions) {
      questions.push({ ...q, id: `q${idSeq++}` });
    }
    passes++;
  }
  const uncoveredAfterLoop = findUncoveredMustHaveIds(requirements, questions);

  // Flashcards: one per must-have requirement, derived from its best
  // question so front/back content stays consistent with what was asked.
  const flashcards = requirements
    .filter((r) => r.priority === 'must')
    .map((r, i) => {
      const relatedQuestion = questions.find((q) => q.requirement_ids.includes(r.id));
      return {
        id: `f${i + 1}`,
        front: relatedQuestion?.prompt ?? r.text,
        back: relatedQuestion?.answer_outline ?? '',
        requirement_ids: [r.id],
      };
    });

  // 7. Schedule — deterministic allocation, not a prompt.
  onStep?.('building_schedule');
  const schedule = buildSchedule(requirements, questions, input.days);

  const kit: Kit = {
    source: {
      company: companyName,
      company_url: input.companyUrl,
      role: title,
      location: '',
      jd_chars: input.jd.length,
      researched_at: researchedAt,
      pages_used: crawlResult.pagesUsed.map((p) => p.url),
    },
    company_brief: companyBrief,
    role: { title, seniority, responsibilities, requirements },
    questions,
    flashcards,
    schedule,
    coverage: { uncovered_requirement_ids: uncoveredAfterLoop, passes },
  };

  // 8. Validate before returning — a kit that doesn't match Appendix A is
  // worse than one that admits a gap.
  const { valid, errors } = validateKit(kit);
  if (!valid) {
    throw new Error(`runPipeline produced an invalid kit: ${errors.join('; ')}`);
  }

  return kit;
}

function guessCompanyName(companyUrl: string, crawl: CrawlResult): string {
  const title = extractTitleFromPages(crawl);
  if (title) return title;
  try {
    return new URL(companyUrl).hostname.replace(/^www\./, '');
  } catch {
    return companyUrl;
  }
}

function extractTitleFromPages(crawl: CrawlResult): string | null {
  const homepage = crawl.pagesUsed[0];
  if (!homepage) return null;
  const firstLine = homepage.text.split('\n').find((l) => l.trim().length > 0);
  return firstLine ? firstLine.trim().slice(0, 80) : null;
}
