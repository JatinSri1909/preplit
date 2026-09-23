'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Kit } from '@prep-kit/core';
import type { BuilderResult } from '../builder.api';
import { kitQueryKey } from '../../kits/hooks/use-kit';
import type { KitRecord } from '../../kits/kits.api';

/**
 * Wrap a builder API call so its response — which is always the whole kit
 * — lands in the cache.
 *
 * `optimistic` lets a caller describe the change locally first, for the
 * interactions where a round trip would be felt: reordering a question,
 * committing an inline edit. On failure the previous kit is restored and
 * the error surfaces, so a rejected edit never leaves the screen showing
 * something the server did not accept.
 */
export function useBuilderMutation<TArgs>(
  id: string,
  mutationFn: (args: TArgs) => Promise<BuilderResult>,
  optimistic?: (kit: Kit, args: TArgs) => Kit,
) {
  const queryClient = useQueryClient();
  const key = kitQueryKey(id);

  return useMutation({
    mutationFn,
    onMutate: async (args: TArgs) => {
      if (!optimistic) return;
      // Stop an in-flight refetch from landing on top of the optimistic
      // state and undoing it a moment before the mutation resolves.
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<KitRecord>(key);
      if (previous?.kit) {
        queryClient.setQueryData<KitRecord>(key, {
          ...previous,
          kit: optimistic(previous.kit, args),
        });
      }
      return { previous };
    },
    onError: (_error, _args, context) => {
      const previous = (context as { previous?: KitRecord } | undefined)?.previous;
      if (previous) queryClient.setQueryData(key, previous);
    },
    onSuccess: (result) => {
      // The server's copy wins outright. It is authoritative about things
      // the client cannot predict — new ids after a regeneration, a
      // schedule rewritten by a delete.
      queryClient.setQueryData<KitRecord>(key, (current) =>
        current
          ? {
              ...current,
              kit: result.kit,
              meta: result.meta,
              practice: result.practice,
              resume_match: result.resume_match,
            }
          : current,
      );
    },
  });
}
