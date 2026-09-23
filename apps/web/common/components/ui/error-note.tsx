'use client';

import { ApiError } from '../../api/api-client';
import { Button } from './button';

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
