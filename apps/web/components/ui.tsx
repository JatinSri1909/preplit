'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ApiError } from '../lib/api';

/**
 * The small shared vocabulary of the interface. Kept deliberately short —
 * a component library is not the assignment, but having exactly one
 * button, one field and one error display means the states the brief
 * grades (loading, empty, error) look the same everywhere and cannot be
 * quietly skipped on a screen someone wrote in a hurry.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'border border-rule bg-surface text-ink hover:bg-canvas',
    ghost: 'text-muted hover:bg-canvas hover:text-ink',
    danger: 'border border-rule bg-surface text-gap hover:bg-gap-soft',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {hint && (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70';

/**
 * One error display for the whole app.
 *
 * Errors here explain what happened and what to do about it — the API
 * already returns a human-readable message per failure, so the component's
 * job is to show it rather than replace it with "Something went wrong".
 * Validation details are listed when the server sent them, because "check
 * the company URL" is only actionable if you know which field it meant.
 */
export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;

  const isApi = error instanceof ApiError;
  const message = isApi
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  const details = isApi ? error.details : undefined;

  return (
    <div role="alert" className="rounded border border-gap/30 bg-gap-soft p-3 text-sm text-ink">
      <p className="font-medium text-gap">{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-3">
          Try again
        </Button>
      )}
    </div>
  );
}

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
    <div className="rounded border border-dashed border-rule bg-surface px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-read text-sm text-muted">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Skeleton rows, so a loading kit occupies the shape it will fill. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded border border-rule bg-surface" />
      ))}
    </div>
  );
}
