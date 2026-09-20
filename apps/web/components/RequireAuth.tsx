'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../app/providers';
import { LoadingRows } from './ui';

/**
 * Client-side guard for the signed-in screens.
 *
 * This is convenience, not security: every protected route is also
 * enforced server-side by `requireAuth` on the API, and a kit is scoped to
 * its owner in the database query itself. Redirecting here just means a
 * signed-out visitor lands on the sign-in form instead of watching a
 * dashboard render a row of 401s.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <LoadingRows rows={2} />
      </div>
    );
  }
  if (!user) return null;

  return <>{children}</>;
}
