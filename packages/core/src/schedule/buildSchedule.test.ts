import { describe, it, expect } from 'vitest';
import { buildSchedule } from './buildSchedule.js';
import { Question, Requirement } from '../types/kit.js';

const requirements: Requirement[] = [
  { id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'GraphQL exposure', kind: 'technical', priority: 'nice' },
];

function q(id: string, requirement_ids: string[], difficulty: 1 | 2 | 3): Question {
  return { id, requirement_ids, category: 'technical', prompt: `Q ${id}`, answer_outline: '', difficulty };
}

describe('buildSchedule', () => {
  it('produces exactly daysAvailable days, even with zero questions', () => {
    const schedule = buildSchedule([], [], 4);
    expect(schedule.days_available).toBe(4);
    expect(schedule.days).toHaveLength(4);
    expect(schedule.days.every((d) => d.question_ids.length === 0)).toBe(true);
  });

  it('places every must-have-linked question somewhere in the schedule', () => {
    const questions = [q('q1', ['r1'], 3), q('q2', ['r1'], 2), q('q3', ['r2'], 1)];
    const schedule = buildSchedule(requirements, questions, 2);
    const scheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(scheduledIds).toContain('q1');
    expect(scheduledIds).toContain('q2');
  });

  it('front-loads higher-difficulty / must-have questions onto earlier days', () => {
    const questions = [q('easy', ['r2'], 1), q('hard-must', ['r1'], 3)];
    const schedule = buildSchedule(requirements, questions, 2, 200);
    expect(schedule.days[0].question_ids).toContain('hard-must');
  });

  it('uses only integer minutes', () => {
    const questions = [q('q1', ['r1'], 2)];
    const schedule = buildSchedule(requirements, questions, 1);
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it('matches days_available even when there are far more questions than days', () => {
    const questions = Array.from({ length: 20 }, (_, i) => q(`q${i}`, ['r1'], 2));
    const schedule = buildSchedule(requirements, questions, 3, 1000);
    expect(schedule.days).toHaveLength(3);
  });
});
