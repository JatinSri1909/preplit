'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kits, type BuilderResult, type KitRecord } from './api';
import type { Kit } from '@prep-kit/core';

/**
 * One cache entry per kit, shared by the builder and practice routes.
 *
 * Polling only runs while the kit is actually generating. The interval
 * backs off as the wait grows: generation is a crawl plus a dozen model
 * calls, so a run that is already ninety seconds in is not about to
 * finish in the next two, and hammering a free-tier-limited API while it
 * works is the wrong instinct.
 */
export function kitQueryKey(id: string) {
  return ['kit', id] as const;
}

export function useKit(id: string) {
  return useQuery({
    queryKey: kitQueryKey(id),
    queryFn: () => kits.get(id),
    refetchInterval: (query) => {
      if (query.state.data?.status !== 'generating') return false;
      const elapsed = Date.now() - (query.state.dataUpdatedAt || Date.now());
      return elapsed > 60_000 ? 8000 : 2500;
    },
  });
}

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
          ? { ...current, kit: result.kit, meta: result.meta, practice: result.practice }
          : current,
      );
    },
  });
}

/** Read the cached kit without subscribing — for imperative handlers. */
export function useCachedKit(id: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.getQueryData<KitRecord>(kitQueryKey(id))?.kit ?? null,
    [queryClient, id],
  );
}
