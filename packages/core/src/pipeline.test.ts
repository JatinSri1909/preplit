import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { runPipeline } from './pipeline.js';
import { validateKit } from './validation/validateKit.js';
import { MockLlmClient } from './testFixtures/mockLlm.js';
import { startFixtureServer } from './retrieval/testFixtures/fixtureServer.js';

const JD = `Senior Backend Engineer

We are looking for a Senior Backend Engineer to join our payments team.

Requirements:
- 5+ years of experience with Node.js in production
- Required: strong understanding of distributed systems
- Bonus points for experience with Kubernetes
- You will need to mentor junior engineers`;

function extractionResponse() {
  return {
    title: 'Senior Backend Engineer',
    seniority: 'Senior',
    responsibilities: ['Own parts of the payments platform'],
    requirements: [
      { text: '5+ years of experience with Node.js in production', kind: 'technical', priority: 'must' },
      { text: 'Strong understanding of distributed systems', kind: 'technical', priority: 'must' },
      { text: 'Experience with Kubernetes', kind: 'technical', priority: 'nice' },
      { text: 'Mentors junior engineers', kind: 'behavioural', priority: 'must' },
    ],
  };
}

function questionResponse(prompt: string, difficulty: 1 | 2 | 3 = 2) {
  return { questions: [{ prompt, answer_outline: `Outline for: ${prompt}`, difficulty }] };
}

describe('runPipeline (integration: real crawl against fixture server, mocked LLM)', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const started = await startFixtureServer();
    server = started.server;
    origin = started.origin;
  });

  afterAll(() => server.close());

  it('produces a fully valid, Appendix-A-conformant kit end to end', async () => {
    // Call order per requirement: primary category, then (for a must-have
    // technical requirement, since the crawled hiring page's own text
    // mentions "a system design round") a bonus system-design call:
    //   req1 Node.js (must/technical)       -> primary + system-design
    //   req2 distributed systems (must/tech)-> primary + system-design
    //   req3 Kubernetes (nice/technical)    -> primary only
    //   req4 mentoring (must/behavioural)   -> primary only
    // This is the fallback path: with no research-LLM result, generation
    // context falls back to the hiring page text the crawler actually
    // found, which itself mentions a system-design round.
    const llm = new MockLlmClient([
      extractionResponse(),
      questionResponse('Explain a Node.js event-loop issue you debugged.'),
      questionResponse('Design a rate limiter for the Node.js service.', 3),
      questionResponse('Design a distributed-consistency mechanism for payments.'),
      questionResponse('Design the system architecture for a distributed payments platform.', 3),
      questionResponse('How would you evaluate adopting Kubernetes for this team?'),
      questionResponse('Tell me about a time you mentored a junior engineer.'),
    ]);

    const kit = await runPipeline(
      { jd: JD, companyUrl: origin, days: 3 },
      { llm, allowPrivateHosts: true, research: async () => null },
    );

    const { valid, errors } = validateKit(kit);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);

    expect(kit.role.requirements).toHaveLength(4);
    expect(kit.questions).toHaveLength(6);
    expect(kit.schedule.days).toHaveLength(3);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.source.pages_used.length).toBeGreaterThan(0);
    // The crawler actually found the hiring page on the fixture site.
    expect(kit.source.pages_used.some((u) => u.includes('/opportunities'))).toBe(true);
  });

  it('biases toward system-design questions when research finds a system-design round', async () => {
    const llm = new MockLlmClient([
      extractionResponse(),
      questionResponse('Node.js technical question', 2),
      questionResponse('Node.js system design question', 3),
      questionResponse('Distributed systems technical question', 2),
      questionResponse('Distributed systems system design question', 3),
      questionResponse('Kubernetes technical question', 1),
      questionResponse('Mentoring behavioural question', 1),
    ]);

    const kit = await runPipeline(
      { jd: JD, companyUrl: origin, days: 2 },
      {
        llm,
        allowPrivateHosts: true,
        research: async () => ({
          summary: 'Candidates report a take-home followed by a system design round.',
          sources: [`${origin}/opportunities`],
        }),
      },
    );

    const categories = kit.questions.map((q) => q.category);
    expect(categories).toContain('system-design');
  });

  it('reports an honest, non-fabricated company brief when the company site is entirely unreachable', async () => {
    const llm = new MockLlmClient([
      extractionResponse(),
      questionResponse('Q1'),
      questionResponse('Q2'),
      questionResponse('Q3'),
      questionResponse('Q4'),
    ]);

    const kit = await runPipeline(
      { jd: JD, companyUrl: 'http://127.0.0.1:1/', days: 2 },
      { llm, allowPrivateHosts: true, research: async () => null },
    );

    expect(kit.source.pages_used).toEqual([]);
    expect(kit.company_brief.summary).toBe('No public company information could be found.');
    const { valid } = validateKit(kit);
    expect(valid).toBe(true); // still a valid, honest kit — not a hard failure
  });
});
