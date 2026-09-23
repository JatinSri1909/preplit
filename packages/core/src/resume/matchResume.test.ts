import { describe, it, expect } from 'vitest';
import { matchResumeToRequirements } from './matchResume.js';
import { MockLlmClient } from '../testFixtures/mockLlm.js';
import { Requirement } from '../types/kit.js';

const requirements: Requirement[] = [
  { id: 'r1', text: '5+ years Node.js', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentors juniors', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'Kubernetes exposure', kind: 'technical', priority: 'nice' },
];

describe('matchResumeToRequirements', () => {
  it('computes a must-have-only score from the model\'s per-requirement verdicts', async () => {
    const llm = new MockLlmClient([
      {
        results: [
          { requirement_id: 'r1', matched: true, note: '' },
          { requirement_id: 'r2', matched: false, note: 'No mentoring experience described.' },
          { requirement_id: 'r3', matched: true, note: '' },
        ],
      },
    ]);

    const result = await matchResumeToRequirements(requirements, 'Some resume text.', llm);

    expect(result.must_total).toBe(2);
    expect(result.must_matched).toBe(1);
    expect(result.score).toBe(50);
    expect(result.results).toHaveLength(3);
    expect(result.results.find((r) => r.requirement_id === 'r2')?.note).toBe(
      'No mentoring experience described.',
    );
  });

  it('treats a requirement the model omitted as unmatched, never dropped', async () => {
    const llm = new MockLlmClient([
      { results: [{ requirement_id: 'r1', matched: true, note: '' }] },
    ]);

    const result = await matchResumeToRequirements(requirements, 'Some resume text.', llm);

    expect(result.results).toHaveLength(3);
    const r2 = result.results.find((r) => r.requirement_id === 'r2');
    expect(r2?.matched).toBe(false);
    expect(r2?.note).toBe('Could not be assessed from this resume.');
    // Only r1 (a must-have) actually matched — r2 (also must) counts as unmatched.
    expect(result.score).toBe(50);
  });

  it('drops a hallucinated requirement id the model invented', async () => {
    const llm = new MockLlmClient([
      {
        results: [
          { requirement_id: 'r1', matched: true, note: '' },
          { requirement_id: 'r2', matched: true, note: '' },
          { requirement_id: 'r3', matched: true, note: '' },
          { requirement_id: 'r99', matched: true, note: '' },
        ],
      },
    ]);

    const result = await matchResumeToRequirements(requirements, 'Some resume text.', llm);

    expect(result.results.map((r) => r.requirement_id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('scores null when there are no must-have requirements', async () => {
    const niceOnly: Requirement[] = [
      { id: 'r1', text: 'Kubernetes exposure', kind: 'technical', priority: 'nice' },
    ];
    const llm = new MockLlmClient([{ results: [{ requirement_id: 'r1', matched: true, note: '' }] }]);

    const result = await matchResumeToRequirements(niceOnly, 'Some resume text.', llm);

    expect(result.score).toBeNull();
    expect(result.must_total).toBe(0);
  });

  it('throws a schema-validation error the caller can sanitize, on malformed output', async () => {
    const llm = new MockLlmClient([{ results: 'not-an-array' }]);

    await expect(matchResumeToRequirements(requirements, 'Some resume text.', llm)).rejects.toThrow(
      /matchResumeToRequirements: LLM response failed schema validation/,
    );
  });
});
