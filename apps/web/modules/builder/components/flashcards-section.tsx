'use client';

import { useState } from 'react';
import type { Kit, KitMeta } from '@prep-kit/core';
import { builder } from '../builder.api';
import { useBuilderMutation } from '../hooks/use-builder-mutation';
import { EditableText } from '../../../common/components/editable-text';
import { ProvenanceMark } from './provenance-mark';
import { Button, EmptyState, ErrorNote, inputClass } from '../../../common/components/ui';

export function FlashcardsSection({ kitId, kit, meta }: { kitId: string; kit: Kit; meta: KitMeta }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const edit = useBuilderMutation(
    kitId,
    ({ fid, patch }: { fid: string; patch: { front?: string; back?: string } }) =>
      builder.editFlashcard(kitId, fid, patch),
    (current, { fid, patch }) => ({
      ...current,
      flashcards: current.flashcards.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
    }),
  );

  const remove = useBuilderMutation(
    kitId,
    ({ fid }: { fid: string }) => builder.deleteFlashcard(kitId, fid),
    (current, { fid }) => ({
      ...current,
      flashcards: current.flashcards.filter((f) => f.id !== fid),
    }),
  );

  const add = useBuilderMutation(kitId, (card: { front: string; back: string }) =>
    builder.addFlashcard(kitId, card),
  );

  return (
    <section aria-labelledby="flashcards-heading" className="space-y-4">
      <h2 id="flashcards-heading" className="font-read text-xl">
        Flashcards
        <span className="ml-2 font-sans text-sm text-muted">{kit.flashcards.length}</span>
      </h2>

      <ErrorNote error={edit.error || remove.error || add.error} />

      <form
        className="flex flex-wrap items-end gap-2 rounded border border-rule bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(
            { front, back },
            {
              onSuccess: () => {
                setFront('');
                setBack('');
              },
            },
          );
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="card-front" className="block text-sm font-medium">
            Front
          </label>
          <input
            id="card-front"
            required
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className={`${inputClass} font-read`}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="card-back" className="block text-sm font-medium">
            Back
          </label>
          <input
            id="card-back"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className={`${inputClass} font-read`}
          />
        </div>
        <Button type="submit" variant="primary" loading={add.isPending}>
          Add card
        </Button>
      </form>

      {kit.flashcards.length === 0 ? (
        <EmptyState
          title="No flashcards yet"
          description="Add one above, and it will appear in practice mode straight away."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kit.flashcards.map((card) => (
            <li
              key={card.id}
              className="space-y-2 rounded-lg border border-rule bg-surface p-3 shadow-soft transition-shadow hover:shadow-lift"
            >
              <EditableText
                label="card front"
                value={card.front}
                multiline={false}
                onSave={(value) => edit.mutate({ fid: card.id, patch: { front: value } })}
                className="font-read"
              />
              <EditableText
                label="card back"
                value={card.back}
                onSave={(value) => edit.mutate({ fid: card.id, patch: { back: value } })}
                className="font-read text-sm text-muted"
                placeholder="Add the answer"
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <ProvenanceMark source={meta.flashcards[card.id]?.source ?? 'generated'} />
                <Button
                  variant="ghost"
                  onClick={() => remove.mutate({ fid: card.id })}
                  aria-label={`Delete the card "${card.front.slice(0, 40)}"`}
                  className="ml-auto"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
