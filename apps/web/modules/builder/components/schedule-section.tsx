'use client';

import { useState } from 'react';
import type { Kit } from '@prep-kit/core';
import { builder } from '../builder.api';
import { useBuilderMutation } from '../hooks/use-builder-mutation';
import { CATEGORY_COLORS } from '../constants/questions.constants';
import { Button, ErrorNote, inputClass } from '../../../common/components/ui';

export function ScheduleSection({ kitId, kit }: { kitId: string; kit: Kit }) {
  const [days, setDays] = useState(kit.schedule.days_available);

  const regenerate = useBuilderMutation(kitId, (nextDays: number) =>
    builder.regenerateSchedule(kitId, nextDays),
  );

  const questionsById = new Map(kit.questions.map((q) => [q.id, q]));
  const totalMinutes = kit.schedule.days.reduce((sum, day) => sum + day.minutes, 0);

  return (
    <section aria-labelledby="schedule-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="schedule-heading" className="font-read text-xl">
          Study schedule
          <span className="ml-2 font-sans text-sm text-muted">
            {kit.schedule.days_available} days · {Math.round(totalMinutes / 60)}h total
          </span>
        </h2>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            regenerate.mutate(days);
          }}
        >
          <div>
            <label htmlFor="schedule-days" className="block text-xs text-muted">
              Days until the interview
            </label>
            <input
              id="schedule-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </div>
          <Button type="submit" variant="secondary" loading={regenerate.isPending}>
            Rebuild
          </Button>
        </form>
      </div>

      <p className="max-w-read text-sm text-muted">
        Harder and must-have material is placed first, so the heavy work lands early rather than
        the night before. Rebuilding is arithmetic, not a model call — it costs nothing to redo.
      </p>

      <ErrorNote error={regenerate.error} />

      <ol className="space-y-3">
        {kit.schedule.days.map((day) => (
          <li
            key={day.day}
            className="rounded-lg border border-rule bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-read text-lg">
                Day {day.day}
                <span className="ml-2 font-sans text-sm text-muted">{day.focus}</span>
              </h3>
              <span className="shrink-0 text-sm text-muted">{day.minutes} min</span>
            </div>

            {day.question_ids.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Nothing new scheduled — use it to revisit the cards you were least sure about.
              </p>
            ) : (
              <ul className="mt-2 max-w-read space-y-1.5 font-read leading-relaxed">
                {day.question_ids.map((id) => {
                  const question = questionsById.get(id);
                  const colors = question ? CATEGORY_COLORS[question.category] : null;
                  return (
                    <li key={id} className="flex items-start gap-2 text-sm">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors?.solid ?? 'bg-rule'}`}
                      />
                      {question?.prompt ?? id}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
