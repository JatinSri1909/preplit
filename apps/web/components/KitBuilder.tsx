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
      <header className="space-y-1">
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
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                section === id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
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

      <ol className="mt-6 space-y-2 text-sm text-muted">
        {[
          'Reading the job description for its requirements',
          'Crawling the company site for what they do and how they hire',
          'Looking for public accounts of their interview process',
          'Writing questions for each requirement',
          'Checking every must-have has a question, and filling the gaps',
          'Laying the material out across your days',
        ].map((step) => (
          <li key={step} className="flex gap-2">
            <span aria-hidden className="text-rule">
              ·
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
