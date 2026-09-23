'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kits } from '../../kits/kits.api';
import { useKit } from '../../kits/hooks/use-kit';
import { SECTIONS, type SectionId } from '../constants/builder.constants';
import { isHttpUrl } from '../helpers/builder.helpers';
import { SectionIcon } from './section-icon';
import { GeneratingState } from './generating-state';
import { BriefSection } from './brief-section';
import { RoleSection } from './role-section';
import { QuestionsSection } from './questions-section';
import { FlashcardsSection } from './flashcards-section';
import { ScheduleSection } from './schedule-section';
import { ResumeSection } from './resume-section';
import { Button, ErrorNote, LoadingRows } from '../../../common/components/ui';

export function KitBuilder({ kitId }: { kitId: string }) {
  const [section, setSection] = useState<SectionId>('brief');
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useKit(kitId);

  // A failed kit's own document never moves off "failed" — resubmitting
  // its stored input is what genuinely retries (kitsRoutes' dedup check
  // excludes failed kits, so this starts a fresh pipeline run rather than
  // re-fetching the same dead end).
  const retry = useMutation({
    mutationFn: () => {
      if (!data?.input) throw new Error('Nothing to retry.');
      return kits.create(data.input);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      router.push(`/kits/${result.id}`);
    },
  });

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

  if (data.status === 'generating') return <GeneratingState step={data.step} />;

  if (data.status === 'failed' || !data.kit || !data.meta) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
        <h1 className="font-read text-2xl">This kit could not be built</h1>
        <ErrorNote
          error={new Error(data.error ?? 'Generation did not finish.')}
          onRetry={() => retry.mutate()}
          retrying={retry.isPending}
        />
        {retry.error && <ErrorNote error={retry.error} />}
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
              {isHttpUrl(kit.source.company_url) ? (
                <a
                  href={kit.source.company_url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-accent"
                >
                  {kit.source.company_url}
                </a>
              ) : (
                kit.source.company_url
              )}
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
        {section === 'resume' && (
          <ResumeSection kitId={kitId} kit={kit} resumeMatch={data.resume_match} />
        )}
      </div>
    </div>
  );
}
