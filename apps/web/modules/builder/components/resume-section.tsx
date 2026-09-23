'use client';

import type { Kit, ResumeMatch } from '@prep-kit/core';
import { builder } from '../builder.api';
import { useBuilderMutation } from '../hooks/use-builder-mutation';
import { ResumeRequirementList } from './resume-requirement-list';
import { EmptyState, ErrorNote, Field, Spinner } from '../../../common/components/ui';

export function ResumeSection({
  kitId,
  kit,
  resumeMatch,
}: {
  kitId: string;
  kit: Kit;
  resumeMatch: ResumeMatch | null;
}) {
  const upload = useBuilderMutation(kitId, (file: File) => builder.uploadResume(kitId, file));

  return (
    <section aria-labelledby="resume-heading" className="space-y-4">
      <h2 id="resume-heading" className="font-read text-xl">
        Resume match
      </h2>

      <Field
        label={resumeMatch ? 'Re-upload a resume' : 'Upload a resume'}
        htmlFor="resume-upload"
        hint="PDF only. Only the match result is kept — the resume text itself is never stored."
      >
        <input
          id="resume-upload"
          type="file"
          accept="application/pdf,.pdf"
          aria-describedby="resume-upload-hint"
          disabled={upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
          className="block w-full text-sm text-muted file:mr-3 file:rounded file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
        />
      </Field>

      <ErrorNote error={upload.error} />
      {upload.isPending && <Spinner label="Reading the resume and comparing it against the role" />}

      {!resumeMatch ? (
        <EmptyState
          title="No resume uploaded yet"
          description="Upload a PDF resume to see how well it addresses this role's must-have requirements, and what's missing."
        />
      ) : resumeMatch.score === null ? (
        <EmptyState
          title="Nothing to score"
          description="This posting has no must-have requirements to check a resume against."
        />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-rule bg-surface p-4 shadow-soft">
            <p className="font-read text-2xl">{resumeMatch.score}% match</p>
            <p className="text-sm text-muted">
              {resumeMatch.must_matched} of {resumeMatch.must_total} must-have requirement
              {resumeMatch.must_total === 1 ? '' : 's'} found in this resume.
            </p>
          </div>

          <ResumeRequirementList kit={kit} resumeMatch={resumeMatch} />
        </div>
      )}
    </section>
  );
}
