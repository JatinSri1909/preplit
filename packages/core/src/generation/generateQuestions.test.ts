import { describe, it, expect } from 'vitest';
import { generateQuestionsForRequirement, generateQuestionsForGaps } from './generateQuestions.js';
import { MockLlmClient } from '../testFixtures/mockLlm.js';
import { Requirement } from '../types/kit.js';

const technicalMust: Requirement = { id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' };
const behavioural: Requirement = { id: 'r2', text: 'Mentors juniors', kind: 'behavioural', priority: 'nice' };

describe('generateQuestionsForRequirement', () => {
  it('routes a technical requirement to the technical category', async () => {
    const llm = new MockLlmClient([
      { questions: [{ prompt: 'Explain reconciliation.', answer_outline: '...', difficulty: 2 }] },
    ]);
    const result = await generateQuestionsForRequirement(technicalMust, llm, { roleTitle: 'Engineer' });
    expect(result).toEqual([
      { requirement_ids: ['r1'], category: 'technical', prompt: 'Explain reconciliation.', answer_outline: '...', difficulty: 2 },
    ]);
  });

  it('routes a behavioural requirement to the behavioural category, in a separate call', async () => {
    const llm = new MockLlmClient([
      { questions: [{ prompt: 'Tell me about a time you mentored someone.', answer_outline: '...', difficulty: 1 }] },
    ]);
    const result = await generateQuestionsForRequirement(behavioural, llm, { roleTitle: 'Engineer' });
    expect(result[0].category).toBe('behavioural');
  });

  it('does not mix a technical and a behavioural requirement into the same call', async () => {
    const llm = new MockLlmClient([
      { questions: [{ prompt: 'Q1', answer_outline: '...', difficulty: 1 }] },
      { questions: [{ prompt: 'Q2', answer_outline: '...', difficulty: 1 }] },
    ]);
    await generateQuestionsForRequirement(technicalMust, llm, { roleTitle: 'Engineer' });
    await generateQuestionsForRequirement(behavioural, llm, { roleTitle: 'Engineer' });
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[0].user).toContain('5+ years React');
    expect(llm.calls[0].user).not.toContain('Mentors juniors');
    expect(llm.calls[1].user).toContain('Mentors juniors');
    expect(llm.calls[1].user).not.toContain('5+ years React');
  });

  it('adds a system-design question for a must-have technical requirement when the hiring process includes a system-design round', async () => {
    const llm = new MockLlmClient([
      { questions: [{ prompt: 'technical Q', answer_outline: '...', difficulty: 2 }] },
      { questions: [{ prompt: 'system design Q', answer_outline: '...', difficulty: 3 }] },
    ]);
    const result = await generateQuestionsForRequirement(technicalMust, llm, {
      roleTitle: 'Engineer',
      hiringProcessSummary: 'Take-home project followed by a system design round.',
    });
    expect(result.map((q) => q.category)).toEqual(['technical', 'system-design']);
  });

  it('does NOT add a system-design question when the hiring process is unknown', async () => {
    const llm = new MockLlmClient([{ questions: [{ prompt: 'technical Q', answer_outline: '...', difficulty: 2 }] }]);
    const result = await generateQuestionsForRequirement(technicalMust, llm, { roleTitle: 'Engineer' });
    expect(result).toHaveLength(1);
  });

  it('throws a clear error on a schema-invalid response', async () => {
    const llm = new MockLlmClient([{ questions: [] }]); // violates min(1)
    await expect(generateQuestionsForRequirement(technicalMust, llm, { roleTitle: 'Engineer' })).rejects.toThrow(
      /did not match the required shape/,
    );
  });
});

describe('generateQuestionsForGaps', () => {
  it('only generates for the requirements listed as uncovered', async () => {
    const llm = new MockLlmClient([{ questions: [{ prompt: 'gap Q', answer_outline: '...', difficulty: 1 }] }]);
    const result = await generateQuestionsForGaps([technicalMust, behavioural], ['r1'], llm, { roleTitle: 'Engineer' });
    expect(llm.calls).toHaveLength(1);
    expect(result[0].requirement_ids).toEqual(['r1']);
  });
});
