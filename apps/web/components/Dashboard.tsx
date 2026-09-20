'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kits, type KitSummary } from '../lib/api';
import { CreateKitForm } from './CreateKitForm';
import { Button, EmptyState, ErrorNote, LoadingRows, Spinner } from './ui';

/**
 * The dashboard polls while anything is still generating and stops as soon
 * as nothing is — a fixed interval would keep hitting the API forever on a
 * tab someone left open.
 */
export function Dashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['kits'],
    queryFn: kits.list,
    refetchInterval: (query) =>
      query.state.data?.some((kit) => kit.status === 'generating') ? 3000 : false,
  });

  const remove = useMutation({
    mutationFn: kits.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kits'] }),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <CreateKitForm />

      <section>
        <h2 className="font-read text-xl">Your kits</h2>

        <div className="mt-4">
          {isLoading ? (
            <LoadingRows />
          ) : error ? (
            <ErrorNote error={error} onRetry={() => refetch()} />
          ) : !data || data.length === 0 ? (
            <EmptyState
              title="No kits yet"
              description="Paste a job description and a company website above, and the research starts straight away."
            />
          ) : (
            <ul className="space-y-2">
              {data.map((kit) => (
                <KitRow
                  key={kit.id}
                  kit={kit}
                  onDelete={() => remove.mutate(kit.id)}
                  deleting={remove.isPending && remove.variables === kit.id}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function KitRow({
  kit,
  onDelete,
  deleting,
}: {
  kit: KitSummary;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-4 rounded border border-rule bg-surface p-4">
      <div className="min-w-0 flex-1">
        {kit.status === 'ready' ? (
          <Link href={`/kits/${kit.id}`} className="block">
            <p className="truncate font-read text-lg">{kit.role ?? 'Untitled role'}</p>
            <p className="truncate text-sm text-muted">
              {kit.company ?? kit.company_url} · {kit.days} day{kit.days === 1 ? '' : 's'} to prepare
            </p>
          </Link>
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
