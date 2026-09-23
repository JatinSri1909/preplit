'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kits } from '../kits.api';
import { CreateKitForm } from './create-kit-form';
import { KitRow } from './kit-row';
import { EmptyState, ErrorNote, LoadingRows } from '../../../common/components/ui';

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
        <h2 className="flex items-center gap-2 font-read text-xl">
          <span aria-hidden className="inline-block h-4 w-1 bg-accent" />
          Your kits
          {data && data.length > 0 && (
            <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-sans font-medium text-accent">
              {data.length}
            </span>
          )}
        </h2>

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
              {data.map((kit, i) => (
                <KitRow
                  key={kit.id}
                  kit={kit}
                  onDelete={() => remove.mutate(kit.id)}
                  deleting={remove.isPending && remove.variables === kit.id}
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
