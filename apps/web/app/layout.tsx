import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { AppHeader } from '../components/AppHeader';

export const metadata: Metadata = {
  title: 'Interview Prep Kit',
  description: 'Turn a job description into a personalised interview prep kit.',
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
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
