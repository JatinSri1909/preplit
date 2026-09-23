'use client';

import type { ReactNode } from 'react';

/** An empty screen is an invitation to act, so it always carries the action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-in-up rounded-lg border border-dashed border-rule bg-surface px-6 py-10 text-center">
      <span
        aria-hidden
        className="mx-auto mb-3 grid h-10 w-10 animate-float place-items-center rounded-full bg-accent-soft text-accent"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
          <path
            d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M17.5 17.5 15 15M6 18l2.5-2.5M17.5 6.5 15 9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-read text-sm text-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
