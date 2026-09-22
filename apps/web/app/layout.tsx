import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppHeader } from '../components/AppHeader';
import { SmoothCursor } from '../components/SmoothCursor';

export const metadata: Metadata = {
  title: 'Preplit',
  description: 'Turn a job description into a personalised interview prep kit.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-backdrop min-h-screen font-sans text-ink antialiased">
        <div aria-hidden className="grid-backdrop" />
        <SmoothCursor />
        <Providers>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <AppHeader />
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
