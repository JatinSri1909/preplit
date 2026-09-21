import { describe, it, expect } from 'vitest';
import { findUncoveredRequirementIds, findUncoveredMustHaveIds } from './checkCoverage.js';
import { Question, Requirement } from '../types/kit.js';

const requirements: Requirement[] = [
  { id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentors juniors', kind: 'behavioural', priority: 'must' },
  { id: 'r3', text: 'GraphQL exposure', kind: 'technical', priority: 'nice' },
];

const questions: Question[] = [
  {
    id: 'q1',
    requirement_ids: ['r1'],
    category: 'technical',
    prompt: 'Explain reconciliation.',
    answer_outline: '...',
    difficulty: 2,
  },
];

describe('findUncoveredRequirementIds', () => {
  it('flags requirements with no linked question', () => {
    expect(findUncoveredRequirementIds(requirements, questions)).toEqual(['r2', 'r3']);
  });

  it('returns empty when every requirement is covered', () => {
    const covering: Question[] = [
      ...questions,
      { ...questions[0], id: 'q2', requirement_ids: ['r2'] },
      { ...questions[0], id: 'q3', requirement_ids: ['r3'] },
    ];
    expect(findUncoveredRequirementIds(requirements, covering)).toEqual([]);
  });
});

describe('findUncoveredMustHaveIds', () => {
  it('only reports must-have gaps, ignoring nice-to-have gaps', () => {
    expect(findUncoveredMustHaveIds(requirements, questions)).toEqual(['r2']);
  });
});
