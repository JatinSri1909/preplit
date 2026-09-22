'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useKit } from '../lib/useKit';
import { BriefSection, RoleSection, FlashcardsSection, ScheduleSection } from './KitSections';
import { QuestionsSection } from './QuestionsSection';
import { Button, ErrorNote, LoadingRows, Spinner } from './ui';

const SECTIONS = [
  ['brief', 'Company'],
  ['role', 'Role'],
  ['questions', 'Questions'],
  ['flashcards', 'Flashcards'],
  ['schedule', 'Schedule'],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

// One glance-able glyph per section, so the nav reads as a row of places
// rather than a row of labels — purely wayfinding, so it takes the same
// muted/accent colouring as the label next to it, never its own colour.
const SECTION_ICONS: Record<SectionId, string> = {
  brief: 'M4 19.5V6a2 2 0 0 1 2-2h9l5 5v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z|M8 9h5M8 13h8M8 17h8',
  role: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1|M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  questions: 'M12 17.5v.01M12 14c0-1.5 1.6-1.7 2.3-2.9.6-1 .2-2.6-1-3.3-1.1-.6-2.6-.4-3.4.6|M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2Z',
  flashcards: 'M4 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z|M8.5 4h9a2 2 0 0 1 2 2v9',
  schedule: 'M4 9h16M7 3v4M17 3v4|M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
};

function SectionIcon({ id, className }: { id: SectionId; className?: string }) {
  const paths = SECTION_ICONS[id].split('|');
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}

export function KitBuilder({ kitId }: { kitId: string }) {
  const [section, setSection] = useState<SectionId>('brief');
  const searchParams = useSearchParams();
  const { data, isLoading, error, refetch } = useKit(kitId);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <ErrorNote error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!data) return null;

  if (data.status === 'generating') return <GeneratingState />;

  if (data.status === 'failed' || !data.kit || !data.meta) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
        <h1 className="font-read text-2xl">This kit could not be built</h1>
        <ErrorNote
          error={new Error(data.error ?? 'Generation did not finish.')}
          onRetry={() => refetch()}
        />
        <Link href="/">
          <Button variant="secondary">Back to your kits</Button>
        </Link>
      </div>
    );
  }

  const { kit, meta } = data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to your kits
      </Link>
      <header className="mt-4 space-y-1">
        <h1 className="font-read text-2xl">{kit.role.title}</h1>
        <p className="text-sm text-muted">
          {kit.source.company}
          {kit.source.company_url && (
            <>
              {' · '}
              <a
                href={kit.source.company_url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent"
              >
                {kit.source.company_url}
              </a>
            </>
          )}
        </p>

        {/* Resubmitting the same posting is answered honestly rather than
            silently generating a second identical kit. */}
        {searchParams.get('existing') === '1' && (
          <p className="rounded border border-rule bg-canvas px-3 py-2 text-sm text-muted">
            You already had a kit for this posting, so this is that one rather than a new copy.
          </p>
        )}

        {kit.coverage.uncovered_requirement_ids.length > 0 && (
          <p className="rounded border border-gap/30 bg-gap-soft px-3 py-2 text-sm text-ink">
            {kit.coverage.uncovered_requirement_ids.length} must-have requirement
            {kit.coverage.uncovered_requirement_ids.length === 1 ? '' : 's'} still have no question
            after {kit.coverage.passes} pass{kit.coverage.passes === 1 ? '' : 'es'}. They are marked
            under Role — write a question yourself, or regenerate that category.
          </p>
        )}
      </header>

      <div className="mt-6 flex items-center justify-between gap-4 border-b border-rule">
        <nav aria-label="Kit sections" className="flex flex-wrap gap-1">
          {SECTIONS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              aria-current={section === id ? 'page' : undefined}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                section === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <SectionIcon id={id} className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <Link href={`/kits/${kitId}/practice`} className="shrink-0 pb-2">
          <Button variant="primary">Practise</Button>
        </Link>
      </div>

      <div className="mt-6">
        {section === 'brief' && <BriefSection kitId={kitId} kit={kit} meta={meta} />}
        {section === 'role' && <RoleSection kit={kit} />}
        {section === 'questions' && <QuestionsSection kitId={kitId} kit={kit} meta={meta} />}
        {section === 'flashcards' && <FlashcardsSection kitId={kitId} kit={kit} meta={meta} />}
        {section === 'schedule' && <ScheduleSection kitId={kitId} kit={kit} />}
      </div>
    </div>
  );
}

/**
 * Generation runs for a minute or more, so this names the steps rather
 * than showing an unexplained spinner.
 *
 * It deliberately does not fake a progress bar. The pipeline's duration
 * depends on how many requirements the posting has and how hard the
 * company site is to crawl, so any percentage would be invented — and a
 * progress bar that stalls at 80% is worse than an honest list of what
 * the system is doing.
 */
function GeneratingState() {
  return (
    <div className="mx-auto max-w-read px-4 py-16 sm:px-6">
      <h1 className="font-read text-2xl">Building your kit</h1>
      <p className="mt-2 text-muted">
        This takes a minute or two. You can leave this page — it carries on without you, and the
        kit appears on your dashboard when it is done.
      </p>

      <ol className="mt-6 space-y-2.5 text-sm text-muted">
        {[
          'Reading the job description for its requirements',
          'Crawling the company site for what they do and how they hire',
          'Looking for public accounts of their interview process',
          'Writing questions for each requirement',
          'Checking every must-have has a question, and filling the gaps',
          'Laying the material out across your days',
        ].map((step, i) => (
          <li
            key={step}
            className="flex animate-fade-in-up gap-2.5"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span aria-hidden className="relative mt-1.5 flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Spinner label="Working" />
      </p>
    </div>
  );
}
