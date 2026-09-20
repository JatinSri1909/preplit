import { Question, Requirement, Schedule, ScheduleDay } from '../types/kit.js';

/**
 * Deterministic schedule allocation — NOT an LLM call (brief Section 8:
 * "This is arithmetic and allocation. It belongs in your code, not in a
 * prompt.").
 *
 * Strategy (documented here + README):
 *   1. Weight each question by (requirement priority, difficulty):
 *      must-have-linked questions outrank nice-to-have-linked questions;
 *      within the same priority, higher difficulty outranks lower.
 *      A question can link multiple requirements — it takes the highest
 *      priority/difficulty among them.
 *   2. Sort questions by that weight, descending. This gives a single
 *      ordered list where "harder / higher-priority material" comes first.
 *   3. Walk the sorted list once, appending each question to the earliest
 *      day with remaining capacity. This front-loads hard/must-have
 *      material (satisfies "not the night before") while still balancing
 *      load reasonably across days.
 *   4. Duration per question is derived from difficulty: 1->15, 2->25,
 *      3->40 minutes. Starting constants — tune and justify in the README
 *      if changed.
 *   5. Guarantee: every must-have requirement's linked question(s) are
 *      included in the schedule even if that means exceeding
 *      minutesPerDay on the day it lands — must-have coverage outranks a
 *      clean time budget (brief Section 8: "every must-have requirement
 *      appears somewhere in the schedule").
 *
 * Rules enforced:
 *   - days.length === daysAvailable, always (trailing days with nothing
 *     left to schedule get an empty question_ids list and a
 *     "Review / practice" focus, never omitted).
 *   - minutes are integers.
 */

const DIFFICULTY_MINUTES: Record<1 | 2 | 3, number> = { 1: 15, 2: 25, 3: 40 };
const DEFAULT_MINUTES_PER_DAY = 120;

function questionWeight(q: Question, requirementsById: Map<string, Requirement>): number {
  let best = 0;
  for (const rid of q.requirement_ids) {
    const req = requirementsById.get(rid);
    if (!req) continue;
    const priorityScore = req.priority === 'must' ? 100 : 0;
    const score = priorityScore + q.difficulty * 10;
    if (score > best) best = score;
  }
  return best; // questions with no matched requirement still get scheduled, just last
}

function isMustLinked(q: Question, requirementsById: Map<string, Requirement>): boolean {
  return q.requirement_ids.some((rid) => requirementsById.get(rid)?.priority === 'must');
}

export function buildSchedule(
  requirements: Requirement[],
  questions: Question[],
  daysAvailable: number,
  minutesPerDay: number = DEFAULT_MINUTES_PER_DAY,
): Schedule {
  const requirementsById = new Map(requirements.map((r) => [r.id, r]));

  const days: ScheduleDay[] = Array.from({ length: Math.max(daysAvailable, 0) }, (_, i) => ({
    day: i + 1,
    focus: '',
    question_ids: [],
    minutes: 0,
  }));

  if (days.length === 0 || questions.length === 0) {
    days.forEach((d) => (d.focus = 'Review / practice'));
    return { days_available: daysAvailable, days };
  }

  const sorted = [...questions].sort(
    (a, b) => questionWeight(b, requirementsById) - questionWeight(a, requirementsById),
  );

  for (const q of sorted) {
    const duration = DIFFICULTY_MINUTES[q.difficulty];
    const mustHave = isMustLinked(q, requirementsById);

    let target = days.find((d) => d.minutes + duration <= minutesPerDay);
    if (!target && mustHave) {
      // Never drop must-have coverage: place on the least-loaded day even
      // if that exceeds the nominal daily budget.
      target = days.reduce((min, d) => (d.minutes < min.minutes ? d : min), days[0]);
    }
    if (!target) continue; // nice-to-have with no room anywhere: drop it

    target.question_ids.push(q.id);
    target.minutes += duration;
  }

  for (const day of days) {
    day.focus = day.question_ids.length > 0 ? 'Focused prep' : 'Review / practice';
  }

  return { days_available: daysAvailable, days };
}
