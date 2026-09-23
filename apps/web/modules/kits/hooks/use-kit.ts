'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { kits, type KitRecord } from '../kits.api';

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

/** Read the cached kit without subscribing — for imperative handlers. */
export function useCachedKit(id: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.getQueryData<KitRecord>(kitQueryKey(id))?.kit ?? null,
    [queryClient, id],
  );
}
