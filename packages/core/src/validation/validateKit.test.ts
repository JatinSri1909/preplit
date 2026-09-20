import { describe, it, expect } from 'vitest';
import { validateKit } from './validateKit.js';
import { Kit } from '../types/kit.js';

function makeValidKit(): Kit {
  return {
    source: {
      company: 'Acme',
      company_url: 'https://acme.example.com',
      role: 'Senior Backend Engineer',
      location: 'Remote',
      jd_chars: 500,
      researched_at: new Date().toISOString(),
      pages_used: ['https://acme.example.com/careers'],
    },
    company_brief: {
      summary: 'Acme builds widgets.',
      what_they_do: 'B2B SaaS for widget logistics.',
      sources: ['https://acme.example.com'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'Senior',
      responsibilities: ['Own the payments service'],
      requirements: [{ id: 'r1', text: '5+ years Node.js', kind: 'technical', priority: 'must' }],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Walk through a Node.js event loop starvation bug you fixed.',
        answer_outline: 'Symptom, diagnosis, fix, prevention.',
        difficulty: 2,
      },
    ],
    flashcards: [{ id: 'f1', front: 'Event loop phases?', back: 'timers, pending, poll, check, close', requirement_ids: ['r1'] }],
    schedule: {
      days_available: 1,
      days: [{ day: 1, focus: 'Core technical prep', question_ids: ['q1'], minutes: 60 }],
    },
    coverage: { uncovered_requirement_ids: [], passes: 1 },
  };
}

describe('validateKit', () => {
  it('accepts a well-formed kit', () => {
    const result = validateKit(makeValidKit());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a question referencing an unknown requirement id', () => {
    const kit = makeValidKit();
    kit.questions[0].requirement_ids = ['r99'];
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('r99'))).toBe(true);
  });

  it('rejects a schedule whose day count does not match days_available', () => {
    const kit = makeValidKit();
    kit.schedule.days_available = 3;
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('days_available'))).toBe(true);
  });

  it('rejects an invalid priority enum value', () => {
    const kit = makeValidKit() as unknown as { role: { requirements: { priority: string }[] } };
    kit.role.requirements[0].priority = 'urgent';
    const result = validateKit(kit);
    expect(result.valid).toBe(false);
  });
});
