'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '../lib/api';
import { Button, ErrorNote, Field, inputClass } from './ui';

/**
 * Sign in and register differ by one API call and some copy, so they share
 * a form. Splitting them into two near-identical files is how the two
 * drift — one grows a password rule the other does not.
 */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isRegister = mode === 'register';

  const submit = useMutation({
    mutationFn: () =>
      isRegister ? auth.register(email, password) : auth.login(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], { user });
      router.push('/');
    },
  });

  return (
    <div className="mx-auto max-w-sm px-4 py-12 sm:px-6">
      <div className="animate-fade-in-up rounded-lg border border-rule bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-read text-2xl">{isRegister ? 'Create an account' : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-muted">
          {isRegister
            ? 'Your kits are private to your account.'
            : 'Pick up where you left off.'}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            hint={isRegister ? 'At least 8 characters.' : undefined}
          >
            <input
              id="password"
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              aria-describedby={isRegister ? 'password-hint' : undefined}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <ErrorNote error={submit.error} />

          <Button type="submit" variant="primary" loading={submit.isPending} className="w-full">
            {isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted">
          {isRegister ? 'Already have an account? ' : 'No account yet? '}
          <Link href={isRegister ? '/login' : '/register'} className="text-accent underline">
            {isRegister ? 'Sign in' : 'Create one'}
          </Link>
        </p>
      </div>
    </div>
  );
}
