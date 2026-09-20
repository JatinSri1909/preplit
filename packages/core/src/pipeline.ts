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
import { validateKit } from './validation/validateKit.js';

export interface PipelineInput {
  jd: string;
  companyUrl: string;
  days: number;
}

export interface PipelineOptions {
  llm: LlmClient;
  /** Max coverage-loop passes after the first draft. Brief Section 4: decide and justify. */
  maxCoveragePasses?: number;
  allowPrivateHosts?: boolean;
  /** Injection seams for tests — default to the real implementations. */
  crawl?: typeof crawlSite;
  research?: typeof findInterviewDiscussion;
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
  } = opts;

  const researchedAt = new Date().toISOString();

  // 1. Extraction — the only step that needs no retrieval at all (brief:
  // "Pasted text needs no retrieval at all").
  const { title, seniority, responsibilities, requirements } = await extractRequirements(input.jd, llm);

  // 2. Crawl — deterministic link ranking, never a hard-coded path.
  let crawlResult: CrawlResult;
  try {
    crawlResult = await crawl(input.companyUrl, { allowPrivateHosts });
  } catch {
    crawlResult = { pagesUsed: [], hiringPage: null, skipped: [{ url: input.companyUrl, reason: 'crawl failed' }] };
  }

  const companyName = guessCompanyName(input.companyUrl, crawlResult);
  const companyBriefSummary = summarizeCompanyFromPages(crawlResult);

  // 3. Research — best-effort, degrades to null honestly.
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
  const questions: Question[] = [];
  let idSeq = 1;
  for (const requirement of requirements) {
    const generated = await generateQuestionsForRequirement(requirement, llm, genContext);
    for (const q of generated) {
      questions.push({ ...q, id: `q${idSeq++}` });
    }
  }

  // 5-6. Coverage loop — deterministic gap-finding, LLM only fills gaps.
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
    company_brief: {
      summary: companyBriefSummary || 'No public company information could be found.',
      what_they_do: companyBriefSummary || '',
      sources: crawlResult.pagesUsed.map((p) => p.url),
    },
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

function summarizeCompanyFromPages(crawl: CrawlResult): string {
  const homepage = crawl.pagesUsed[0];
  if (!homepage || !homepage.text) return '';
  return homepage.text.slice(0, 500);
}
