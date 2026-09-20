import { describe, it, expect } from 'vitest';
import { removeQuestionFromSchedule, buildSchedule } from './buildSchedule.js';
import { validateKit } from '../validation/validateKit.js';
import { Question, Requirement, Schedule } from '../types/kit.js';

const requirements: Requirement[] = [
  { id: 'r1', text: 'Node.js in production', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Mentoring', kind: 'behavioural', priority: 'nice' },
];

const questions: Question[] = [
  { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'A', answer_outline: '', difficulty: 3 },
  { id: 'q2', requirement_ids: ['r2'], category: 'behavioural', prompt: 'B', answer_outline: '', difficulty: 1 },
];

describe('removeQuestionFromSchedule', () => {
  it('drops the question id from every day it appears on', () => {
    const schedule = buildSchedule(requirements, questions, 2);
    const after = removeQuestionFromSchedule(schedule, 'q1', 3);
    const allIds = after.days.flatMap((d) => d.question_ids);
    expect(allIds).not.toContain('q1');
    expect(allIds).toContain('q2');
  });

  it('reclaims the deleted question minutes rather than leaving the day overbudget', () => {
    const schedule = buildSchedule(requirements, questions, 1);
    const before = schedule.days[0].minutes;
    const after = removeQuestionFromSchedule(schedule, 'q1', 3);
    expect(after.days[0].minutes).toBe(before - 40); // difficulty 3 -> 40 min
  });

  it('never drives a day\'s minutes below zero on a bad difficulty argument', () => {
    const schedule: Schedule = {
      days_available: 1,
      days: [{ day: 1, focus: 'Focused prep', question_ids: ['q1'], minutes: 15 }],
    };
    expect(removeQuestionFromSchedule(schedule, 'q1', 3).days[0].minutes).toBe(0);
  });

  it('marks a day that has been emptied as review rather than leaving a stale focus', () => {
    const schedule: Schedule = {
      days_available: 1,
      days: [{ day: 1, focus: 'Focused prep', question_ids: ['q1'], minutes: 40 }],
    };
    expect(removeQuestionFromSchedule(schedule, 'q1', 3).days[0].focus).toBe('Review / practice');
  });

  it('preserves the day count, so the kit still validates after a delete', () => {
    const schedule = buildSchedule(requirements, questions, 4);
    const after = removeQuestionFromSchedule(schedule, 'q1', 3);

    // The whole reason this helper exists: validateKit rejects a schedule
    // referencing a question that no longer exists.
    const kit = {
      source: { company: 'C', company_url: 'https://c.example', role: 'R', location: '', jd_chars: 10, researched_at: '2026-09-01T00:00:00Z', pages_used: [] },
      company_brief: { summary: 's', what_they_do: 'w', sources: [] },
      role: { title: 'R', seniority: 'senior', responsibilities: [], requirements },
      questions: questions.filter((q) => q.id !== 'q1'),
      flashcards: [],
      schedule: after,
      coverage: { uncovered_requirement_ids: ['r1'], passes: 1 },
    };
    expect(validateKit(kit)).toEqual({ valid: true, errors: [] });
    expect(after.days).toHaveLength(4);
  });
});
