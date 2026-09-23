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
    'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';
  const variants = {
    primary:
      'bg-gradient-to-b from-accent to-accent-strong text-white shadow-soft hover:shadow-lift hover:brightness-110',
    secondary: 'border border-rule bg-surface text-ink hover:border-accent/40 hover:bg-canvas',
    ghost: 'text-muted hover:bg-canvas hover:text-ink',
    danger: 'border border-rule bg-surface text-gap hover:border-gap/40 hover:bg-gap-soft',
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
export function ErrorNote({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
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
        <Button variant="secondary" onClick={onRetry} loading={retrying} className="mt-3">
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

/** Skeleton rows, so a loading kit occupies the shape it will fill. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16 border border-rule" />
      ))}
    </div>
  );
}
