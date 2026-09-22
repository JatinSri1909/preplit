'use client';

import { useState } from 'react';
import type { Kit, KitMeta, Question, QuestionCategory } from '@prep-kit/core';
import { builder } from '../lib/api';
import { useBuilderMutation } from '../lib/useKit';
import { EditableText } from './EditableText';
import { Button, ErrorNote, EmptyState, inputClass } from './ui';
import { ProvenanceMark } from './ProvenanceMark';

const CATEGORIES: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System design',
  'company-fit': 'Company fit',
};

/**
 * Category is state, same as coverage — so it gets the same treatment: a
 * colour that means one specific thing everywhere it appears, not a
 * decorative accent. Technical stays the app's primary blue; the other
 * three get their own hue so a mixed bank is scannable at a glance
 * without reading every label.
 */
export const CATEGORY_COLORS: Record<QuestionCategory, { text: string; solid: string; soft: string }> = {
  technical: { text: 'text-accent', solid: 'bg-accent', soft: 'bg-accent-soft' },
  behavioural: { text: 'text-violet', solid: 'bg-violet', soft: 'bg-violet-soft' },
  'system-design': { text: 'text-teal', solid: 'bg-teal', soft: 'bg-teal-soft' },
  'company-fit': { text: 'text-rose', solid: 'bg-rose', soft: 'bg-rose-soft' },
};

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

function QuestionCard({
  question,
  provenance,
  coversGap,
  requirements,
  isFirst,
  isLast,
  onMove,
  onEdit,
  onDelete,
}: {
  question: Question;
  provenance: 'generated' | 'edited' | 'user_added';
  coversGap: boolean;
  requirements: Kit['role']['requirements'];
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: (patch: Partial<Question>) => void;
  onDelete: () => void;
}) {
  const linked = requirements.filter((r) => question.requirement_ids.includes(r.id));
  const colors = CATEGORY_COLORS[question.category];

  return (
    <li className="rounded-lg border border-rule bg-surface shadow-soft transition-shadow hover:shadow-lift">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-3">
          <EditableText
            label="question"
            value={question.prompt}
            onSave={(prompt) => onEdit({ prompt })}
            className="font-read text-lg leading-snug"
          />

          <EditableText
            label="answer outline"
            value={question.answer_outline}
            onSave={(answer_outline) => onEdit({ answer_outline })}
            className="max-w-read font-read text-sm leading-relaxed text-muted"
            placeholder="Add an answer outline"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <ProvenanceMark source={provenance} />

            <label className="sr-only" htmlFor={`cat-${question.id}`}>
              Category for this question
            </label>
            <select
              id={`cat-${question.id}`}
              value={question.category}
              onChange={(e) => onEdit({ category: e.target.value as QuestionCategory })}
              className={`rounded border-0 px-1.5 py-0.5 font-medium ${colors.soft} ${colors.text}`}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor={`diff-${question.id}`}>
              Difficulty for this question
            </label>
            <select
              id={`diff-${question.id}`}
              value={question.difficulty}
              onChange={(e) => onEdit({ difficulty: Number(e.target.value) as 1 | 2 | 3 })}
              className="rounded border border-rule bg-surface px-1.5 py-0.5"
            >
              <option value={1}>Fundamentals</option>
              <option value={2}>Working knowledge</option>
              <option value={3}>Deep</option>
            </select>

            {linked.map((r) => (
              <span
                key={r.id}
                title={r.text}
                className={`max-w-[18ch] truncate rounded px-1.5 py-0.5 ${
                  r.priority === 'must' ? 'bg-canvas text-ink' : 'bg-canvas text-muted'
                }`}
              >
                {r.text}
              </span>
            ))}

            {coversGap && (
              <span className="rounded bg-gap-soft px-1.5 py-0.5 text-gap">
                requirement still uncovered
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <Button
            variant="ghost"
            disabled={isFirst}
            onClick={() => onMove(-1)}
            aria-label={`Move "${question.prompt.slice(0, 40)}" earlier`}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            disabled={isLast}
            onClick={() => onMove(1)}
            aria-label={`Move "${question.prompt.slice(0, 40)}" later`}
          >
            ↓
          </Button>
          <Button
            variant="danger"
            onClick={onDelete}
            aria-label={`Delete "${question.prompt.slice(0, 40)}"`}
          >
            ✕
          </Button>
        </div>
      </div>
    </li>
  );
}

function AddQuestionForm({
  requirements,
  defaultCategory,
  pending,
  onSubmit,
}: {
  requirements: Kit['role']['requirements'];
  defaultCategory: QuestionCategory;
  pending: boolean;
  onSubmit: (input: {
    prompt: string;
    answer_outline: string;
    category: QuestionCategory;
    difficulty: 1 | 2 | 3;
    requirement_ids: string[];
  }) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [outline, setOutline] = useState('');
  const [category, setCategory] = useState<QuestionCategory>(defaultCategory);
  const [requirementId, setRequirementId] = useState('');

  return (
    <form
      className="space-y-3 rounded border border-accent/40 bg-accent-soft/40 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          prompt,
          answer_outline: outline,
          category,
          difficulty: 2,
          requirement_ids: requirementId ? [requirementId] : [],
        });
        setPrompt('');
        setOutline('');
      }}
    >
      <label className="block text-sm font-medium" htmlFor="new-question">
        Your question
      </label>
      <textarea
        id="new-question"
        required
        rows={2}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className={`${inputClass} font-read`}
      />

      <label className="block text-sm font-medium" htmlFor="new-outline">
        Answer outline
      </label>
      <textarea
        id="new-outline"
        rows={2}
        value={outline}
        onChange={(e) => setOutline(e.target.value)}
        className={`${inputClass} font-read`}
      />

      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-sm font-medium" htmlFor="new-category">
            Category
          </label>
          <select
            id="new-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as QuestionCategory)}
            className={inputClass}
          >
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0 flex-1">
          <label className="block text-sm font-medium" htmlFor="new-requirement">
            Requirement it covers
          </label>
          <select
            id="new-requirement"
            value={requirementId}
            onChange={(e) => setRequirementId(e.target.value)}
            className={inputClass}
          >
            <option value="">Not linked to one</option>
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {r.priority === 'must' ? 'Must: ' : 'Nice: '}
                {r.text}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" variant="primary" loading={pending}>
        Add question
      </Button>
    </form>
  );
}
