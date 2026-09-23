'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../common/api/api-client';
import { AuthProvider, useAuth } from '../modules/auth/context/auth-context';

export { useAuth };

/**
 * TanStack Query is doing real work here, not decorating a fetch call:
 * generation is a long poll (`refetchInterval` while a kit is generating),
 * every builder edit is an optimistic cache write that has to roll back
 * cleanly on failure, and the kit is read by several sibling routes that
 * must not each fetch their own copy. Hand-rolling that is where the bugs
 * in "an edit in flight" and "a regeneration that must not clobber
 * someone's work" would come from.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a 401 or a 404 just delays the real answer.
          if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client is shared
  // across requests on the server and would leak one user's cache into
  // another's render.
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
