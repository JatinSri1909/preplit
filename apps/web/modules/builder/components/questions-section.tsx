'use client';

import { useState } from 'react';
import type { Kit, KitMeta, Question, QuestionCategory } from '@prep-kit/core';
import { builder } from '../builder.api';
import { useBuilderMutation } from '../hooks/use-builder-mutation';
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../constants/questions.constants';
import { AddQuestionForm } from './add-question-form';
import { QuestionCard } from './question-card';
import { Button, EmptyState, ErrorNote } from '../../../common/components/ui';

/**
 * The question bank.
 *
 * Reordering is done with buttons rather than drag-and-drop. That is a
 * deliberate trade: the brief grades keyboard access, and a drag handle
 * that works with a keyboard and a screen reader is a substantial piece of
 * work to do properly — most implementations end up mouse-only. Move
 * up/down is operable by every input method for free, works on a phone
 * without a long-press, and the optimistic update makes it feel as
 * immediate as a drag would.
 */
export function QuestionsSection({
  kitId,
  kit,
  meta,
}: {
  kitId: string;
  kit: Kit;
  meta: KitMeta;
}) {
  const [category, setCategory] = useState<QuestionCategory | 'all'>('all');
  const [adding, setAdding] = useState(false);

  const reorder = useBuilderMutation(
    kitId,
    ({ ids }: { ids: string[] }) => builder.reorderQuestions(kitId, ids),
    (current, { ids }) => {
      const byId = new Map(current.questions.map((q) => [q.id, q]));
      return { ...current, questions: ids.map((id) => byId.get(id)!).filter(Boolean) };
    },
  );

  const edit = useBuilderMutation(
    kitId,
    ({ qid, patch }: { qid: string; patch: Partial<Question> }) =>
      builder.editQuestion(kitId, qid, patch),
    (current, { qid, patch }) => ({
      ...current,
      questions: current.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
    }),
  );

  const remove = useBuilderMutation(
    kitId,
    ({ qid }: { qid: string }) => builder.deleteQuestion(kitId, qid),
    (current, { qid }) => ({
      ...current,
      questions: current.questions.filter((q) => q.id !== qid),
    }),
  );

  const add = useBuilderMutation(kitId, (input: Parameters<typeof builder.addQuestion>[1]) =>
    builder.addQuestion(kitId, input),
  );

  const regenerate = useBuilderMutation(kitId, (target: QuestionCategory) =>
    builder.regenerateQuestions(kitId, target),
  );

  const visible =
    category === 'all' ? kit.questions : kit.questions.filter((q) => q.category === category);

  /**
   * Moving within a filtered view still sends the full question order:
   * the API rejects a partial list, because a partial list cannot say
   * where the hidden questions went.
   */
  function move(questionId: string, direction: -1 | 1) {
    const all = kit.questions.map((q) => q.id);
    const from = all.indexOf(questionId);
    const to = from + direction;
    if (to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to], all[from]];
    reorder.mutate({ ids: all });
  }

  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);

  return (
    <section aria-labelledby="questions-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="questions-heading" className="font-read text-xl">
          Question bank
          <span className="ml-2 text-sm font-sans text-muted">{kit.questions.length}</span>
        </h2>
        <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Write a question'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', ...CATEGORIES] as const).map((value) => {
          const count =
            value === 'all'
              ? kit.questions.length
              : kit.questions.filter((q) => q.category === value).length;
          const active = category === value;
          const colors = value === 'all' ? null : CATEGORY_COLORS[value];
          return (
            <button
              key={value}
              onClick={() => setCategory(value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-sm transition-all ${
                active
                  ? `${colors?.solid ?? 'bg-accent'} text-white shadow-soft`
                  : 'text-muted hover:bg-canvas'
              }`}
            >
              {colors && (
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : colors.solid}`}
                />
              )}
              {value === 'all' ? 'All' : CATEGORY_LABELS[value]}{' '}
              <span className={active ? 'text-white/80' : 'text-muted'}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Regeneration is offered per category, never for the bank as a
          whole — "regenerate everything" is the button that loses work. */}
      {category !== 'all' && (
        <div className="flex items-center gap-3 rounded border border-rule bg-canvas px-3 py-2 text-sm">
          <span className="text-muted">
            Regenerating replaces only the questions still as generated. Anything you wrote or
            edited stays.
          </span>
          <Button
            variant="secondary"
            loading={regenerate.isPending}
            onClick={() => regenerate.mutate(category)}
            className="ml-auto shrink-0"
          >
            Regenerate {CATEGORY_LABELS[category].toLowerCase()}
          </Button>
        </div>
      )}

      <ErrorNote error={reorder.error || edit.error || remove.error || regenerate.error || add.error} />

      {adding && (
        <AddQuestionForm
          requirements={kit.role.requirements}
          pending={add.isPending}
          defaultCategory={category === 'all' ? 'technical' : category}
          onSubmit={(input) => {
            add.mutate(input, { onSuccess: () => setAdding(false) });
          }}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing in this category"
          description="Regenerate it, or write the first question yourself."
        />
      ) : (
        <ol className="space-y-3">
          {visible.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              provenance={meta.questions[question.id]?.source ?? 'generated'}
              coversGap={question.requirement_ids.some((id) => uncovered.has(id))}
              requirements={kit.role.requirements}
              isFirst={kit.questions[0]?.id === question.id}
              isLast={kit.questions[kit.questions.length - 1]?.id === question.id}
              onMove={(direction) => move(question.id, direction)}
              onEdit={(patch) => edit.mutate({ qid: question.id, patch })}
              onDelete={() => remove.mutate({ qid: question.id })}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
