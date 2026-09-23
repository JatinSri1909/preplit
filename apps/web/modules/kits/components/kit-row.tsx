'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { KitSummary } from '../kits.api';
import { Button, Spinner } from '../../../common/components/ui';

export function KitRow({
  kit,
  onDelete,
  deleting,
  style,
}: {
  kit: KitSummary;
  onDelete: () => void;
  deleting: boolean;
  style?: CSSProperties;
}) {
  // The left edge flags a problem worth noticing before you read a word
  // of the card — the same "gap" colour the builder uses for an
  // uncovered requirement. Nothing to flag means no accent at all,
  // rather than a colour that means "this is fine".
  const statusBar =
    kit.status === 'failed' || kit.uncovered_count > 0 ? 'border-l-4 border-l-gap' : '';

  return (
    <li
      style={style}
      className={`grid-frame flex animate-fade-in-up items-center gap-4 bg-surface p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ${statusBar}`}
    >
      <div className="min-w-0 flex-1">
        {/* Every status links through — a kit still generating opens its
            own live progress view, and a failed one opens the retry
            screen. Only 'ready' gets the full title treatment; the other
            two show what's actually happening instead of a role name that
            doesn't exist yet. */}
        <Link href={`/kits/${kit.id}`} className="block">
          {kit.status === 'ready' ? (
            <>
              <p className="truncate font-read text-lg">{kit.role ?? 'Untitled role'}</p>
              <p className="truncate text-sm text-muted">
                {kit.company ?? kit.company_url} · {kit.days} day{kit.days === 1 ? '' : 's'} to prepare
              </p>
            </>
          ) : (
            <>
              <p className="truncate font-read text-lg text-muted">
                {kit.company ?? kit.company_url ?? 'New kit'}
              </p>
              <p className="truncate text-sm text-muted">
                {kit.status === 'generating' ? (
                  <Spinner label="Researching and generating" />
                ) : (
                  <span className="text-gap">{kit.error ?? 'Generation failed.'}</span>
                )}
              </p>
            </>
          )}
        </Link>
      </div>

      {/* An uncovered must-have is the one thing worth flagging from a
          list view: it is the kit's own admission that it missed something. */}
      {kit.status === 'ready' && kit.uncovered_count > 0 && (
        <span className="hidden shrink-0 rounded bg-gap-soft px-2 py-1 text-xs font-medium text-gap sm:inline">
          {kit.uncovered_count} uncovered
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {kit.status === 'ready' && (
          <Link href={`/kits/${kit.id}/practice`}>
            <Button variant="ghost">Practise</Button>
          </Link>
        )}
        <Button
          variant="ghost"
          loading={deleting}
          onClick={onDelete}
          aria-label={`Delete the kit for ${kit.role ?? kit.company ?? 'this role'}`}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
