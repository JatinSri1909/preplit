'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, ApiError, type User } from '../lib/api';

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

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
} | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: auth.me,
    staleTime: 5 * 60_000,
  });

  const value = useMemo(
    () => ({
      user: data?.user ?? null,
      loading: isLoading,
      signOut: async () => {
        await auth.logout().catch(() => undefined);
        // Clear everything, not just the session: kits belong to the user
        // who just left, and leaving them cached would show one person's
        // kits to the next person who signs in on this machine.
        queryClient.clear();
        queryClient.setQueryData(['me'], { user: null });
      },
    }),
    [data, isLoading, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <Providers>.');
  return context;
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
