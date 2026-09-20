'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../app/providers';
import { Button } from './ui';

export function AppHeader() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  return (
    <header className="border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
          Interview Prep Kit
        </Link>

        {/* No auth controls at all until we know the answer — flashing
            "Sign in" at a signed-in user on every page load is worse than
            a moment of nothing. */}
        {!loading && (
          <nav className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-muted sm:inline">{user.email}</span>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await signOut();
                    router.push('/login');
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost">Sign in</Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary">Create account</Button>
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
