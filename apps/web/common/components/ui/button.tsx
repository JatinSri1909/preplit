'use client';

import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './spinner';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';
  const variants = {
    primary:
      'bg-gradient-to-b from-accent to-accent-strong text-white shadow-soft hover:shadow-lift hover:brightness-110',
    secondary: 'border border-rule bg-surface text-ink hover:border-accent/40 hover:bg-canvas',
    ghost: 'text-muted hover:bg-canvas hover:text-ink',
    danger: 'border border-rule bg-surface text-gap hover:border-gap/40 hover:bg-gap-soft',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
