'use client';

import { useState } from 'react';
import type { Kit, QuestionCategory } from '@prep-kit/core';
import { CATEGORIES, CATEGORY_LABELS } from '../constants/questions.constants';
import { Button, inputClass } from '../../../common/components/ui';

export function AddQuestionForm({
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
