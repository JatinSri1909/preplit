'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, type User } from '../auth.api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
