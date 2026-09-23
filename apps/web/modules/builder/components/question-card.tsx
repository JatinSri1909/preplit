'use client';

import type { Kit, Question, QuestionCategory } from '@prep-kit/core';
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../constants/questions.constants';
import { EditableText } from '../../../common/components/editable-text';
import { ProvenanceMark } from './provenance-mark';
import { Button } from '../../../common/components/ui';

export function QuestionCard({
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
