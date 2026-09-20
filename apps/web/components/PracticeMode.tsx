'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { practice } from '../lib/api';
import { Button, EmptyState, ErrorNote, LoadingRows } from './ui';

const CONFIDENCE = [
  { value: 1, label: 'Guessed', hint: 'Comes back first' },
  { value: 2, label: 'Shaky', hint: 'Comes back soon' },
  { value: 3, label: 'Confident', hint: 'Comes back last' },
] as const;

/**
 * Practice mode.
 *
 * The session is fixed at the moment it is fetched: the server sends an
 * ordered queue, and the user works through that order to the end. It is
 * tempting to resort after every rating so the weakest card is always
 * next, but that means a card you just rated "guessed" reappears
 * immediately, which feels like a punishment loop rather than revision.
 * Reordering happens between sessions instead, which is where the user
 * expects it.
 */
export function PracticeMode({ kitId }: { kitId: string }) {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['practice', kitId],
    queryFn: () => practice.session(kitId),
    // Always fetch a fresh queue on entry — a stale one would replay the
    // previous session's order.
    staleTime: 0,
  });

  const review = useMutation({
    mutationFn: ({ fid, confidence }: { fid: string; confidence: 1 | 2 | 3 }) =>
      practice.review(kitId, fid, confidence),
    onSuccess: (result) => {
      queryClient.setQueryData(['practice', kitId], (current: typeof data) =>
        current ? { ...current, progress: result.progress, state: result.state } : current,
      );
      // The kit's own cache holds practice state too; drop it rather than
      // patch it, so the builder refetches when it is next opened.
      queryClient.invalidateQueries({ queryKey: ['kit', kitId] });
    },
  });

  const reset = useMutation({
    mutationFn: () => practice.reset(kitId),
    onSuccess: () => {
      setIndex(0);
      setRevealed(false);
      refetch();
    },
  });

  const card = data?.queue[index];

  // Space reveals, then 1/2/3 rate. Practising with one hand on the
  // keyboard is the whole point of a flashcard app.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!card) return;
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (revealed && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        rate(Number(event.key) as 1 | 2 | 3);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function rate(confidence: 1 | 2 | 3) {
    if (!card) return;
    review.mutate({ fid: card.id, confidence });
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <LoadingRows rows={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <ErrorNote error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const progress = data?.progress;
  const finished = data && index >= data.queue.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/kits/${kitId}`} className="text-sm text-muted hover:text-ink">
          ← Back to the kit
        </Link>
        {progress && (
          <p className="text-sm text-muted">
            {progress.confident} confident · {progress.shaky} shaky · {progress.unseen} not seen
          </p>
        )}
      </div>

      {progress && progress.total > 0 && (
        <div
          className="h-1.5 overflow-hidden rounded bg-rule"
          role="progressbar"
          aria-valuenow={progress.reviewed}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label="Cards covered"
        >
          <div
            className="h-full bg-covered transition-[width]"
            style={{ width: `${(progress.reviewed / progress.total) * 100}%` }}
          />
        </div>
      )}

      <ErrorNote error={review.error} />

      {!data || data.queue.length === 0 ? (
        <EmptyState
          title="No cards to practise"
          description="Add flashcards to this kit and they show up here."
          action={
            <Link href={`/kits/${kitId}`}>
              <Button variant="primary">Open the kit</Button>
            </Link>
          }
        />
      ) : finished ? (
        <EmptyState
          title="Session done"
          description={
            progress && progress.shaky > 0
              ? `${progress.shaky} card${progress.shaky === 1 ? '' : 's'} still shaky. Starting again puts those first.`
              : 'You were confident on everything in this round.'
          }
          action={
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setIndex(0);
                  setRevealed(false);
                  refetch();
                }}
              >
                Go again
              </Button>
              <Button variant="secondary" loading={reset.isPending} onClick={() => reset.mutate()}>
                Clear my ratings
              </Button>
            </div>
          }
        />
      ) : (
        card && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Card {index + 1} of {data.queue.length}
            </p>

            <div className="rounded border border-rule bg-surface p-6">
              <p className="max-w-read font-read text-xl leading-snug">{card.front}</p>

              {revealed ? (
                <p className="mt-5 max-w-read border-t border-rule pt-5 font-read leading-relaxed text-muted">
                  {card.back || 'This card has no answer on the back yet.'}
                </p>
              ) : (
                <Button variant="secondary" className="mt-5" onClick={() => setRevealed(true)}>
                  Show the answer
                  <span className="ml-1 text-muted">space</span>
                </Button>
              )}
            </div>

            {revealed && (
              <fieldset className="space-y-2">
                <legend className="text-sm text-muted">How did that feel?</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {CONFIDENCE.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => rate(option.value)}
                      className="rounded border border-rule bg-surface px-3 py-2 text-left hover:border-accent"
                    >
                      <span className="block text-sm font-medium">
                        {option.label}
                        <span className="ml-1 font-normal text-muted">{option.value}</span>
                      </span>
                      <span className="block text-xs text-muted">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )
      )}
    </div>
  );
}
