'use client';

import { useState } from 'react';
import type { Kit, KitMeta, ResumeMatch } from '@prep-kit/core';
import { builder } from '../lib/api';
import { useBuilderMutation } from '../lib/useKit';
import { EditableText } from './EditableText';
import { ProvenanceMark } from './ProvenanceMark';
import { CATEGORY_COLORS } from './QuestionsSection';
import { Button, EmptyState, ErrorNote, Field, Spinner, inputClass } from './ui';

// --- company brief ---

export function BriefSection({ kitId, kit, meta }: { kitId: string; kit: Kit; meta: KitMeta }) {
  const edit = useBuilderMutation(
    kitId,
    (patch: { summary?: string; what_they_do?: string }) => builder.editBrief(kitId, patch),
    (current, patch) => ({ ...current, company_brief: { ...current.company_brief, ...patch } }),
  );

  const regenerate = useBuilderMutation(kitId, () => builder.regenerateBrief(kitId));

  const bothEdited =
    meta.company_brief.summary.source === 'edited' &&
    meta.company_brief.what_they_do.source === 'edited';

  return (
    <section aria-labelledby="brief-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="brief-heading" className="font-read text-xl">
          Company brief
        </h2>
        <Button
          variant="secondary"
          loading={regenerate.isPending}
          disabled={bothEdited}
          title={
            bothEdited
              ? 'You have edited both parts of the brief, so there is nothing left to regenerate.'
              : undefined
          }
          onClick={() => regenerate.mutate(undefined as never)}
        >
          Research again
        </Button>
      </div>

      <ErrorNote error={edit.error || regenerate.error} />

      <div className="space-y-4 rounded-lg border border-rule bg-surface p-4 shadow-soft">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-ink">Summary</span>
            <ProvenanceMark source={meta.company_brief.summary.source} />
          </div>
          <EditableText
            label="company summary"
            value={kit.company_brief.summary}
            onSave={(summary) => edit.mutate({ summary })}
            className="max-w-read font-read leading-relaxed"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-ink">What they do</span>
            <ProvenanceMark source={meta.company_brief.what_they_do.source} />
          </div>
          <EditableText
            label="what they do"
            value={kit.company_brief.what_they_do}
            onSave={(what_they_do) => edit.mutate({ what_they_do })}
            className="max-w-read font-read leading-relaxed"
            placeholder="Nothing was found about what they build."
          />
        </div>

        {/* Where the brief came from, so the user can judge it rather
            than take it on faith. */}
        {kit.company_brief.sources.length > 0 ? (
          <div className="border-t border-rule pt-3 text-xs text-muted">
            <p className="font-medium text-ink">Read from</p>
            <ul className="mt-1 space-y-0.5">
              {kit.company_brief.sources.map((source) => (
                <li key={source} className="truncate">
                  <a href={source} target="_blank" rel="noreferrer" className="hover:text-accent">
                    {source}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="border-t border-rule pt-3 text-xs text-muted">
            No pages could be retrieved from this company&apos;s site.
          </p>
        )}
      </div>
    </section>
  );
}

// --- role breakdown ---

export function RoleSection({ kit }: { kit: Kit }) {
  const uncovered = new Set(kit.coverage.uncovered_requirement_ids);
  const musts = kit.role.requirements.filter((r) => r.priority === 'must');
  const nices = kit.role.requirements.filter((r) => r.priority === 'nice');

  return (
    <section aria-labelledby="role-heading" className="space-y-4">
      <h2 id="role-heading" className="font-read text-xl">
        The role
      </h2>

      <div className="rounded-lg border border-rule bg-surface p-4 shadow-soft">
        <p className="font-read text-lg">{kit.role.title}</p>
        {kit.role.seniority && <p className="text-sm text-muted">{kit.role.seniority}</p>}

        {kit.role.responsibilities.length > 0 && (
          <ul className="mt-3 max-w-read list-disc space-y-1 pl-5 font-read leading-relaxed">
            {kit.role.responsibilities.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        )}
      </div>

      {kit.role.requirements.length === 0 ? (
        <EmptyState
          title="This posting listed almost nothing"
          description="No requirements could be taken from the description without inventing them, so the kit stays thin rather than padding itself out."
        />
      ) : (
        <div className="space-y-4">
          <RequirementList title="Must have" requirements={musts} uncovered={uncovered} />
          {nices.length > 0 && (
            <RequirementList title="Nice to have" requirements={nices} uncovered={uncovered} />
          )}
        </div>
      )}
    </section>
  );
}

function RequirementList({
  title,
  requirements,
  uncovered,
}: {
  title: string;
  requirements: Kit['role']['requirements'];
  uncovered: Set<string>;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {requirements.map((r) => (
          <li
            key={r.id}
            className={`flex items-start gap-3 border bg-surface px-3 py-2 transition-colors ${
              uncovered.has(r.id) ? 'border-rule border-l-4 border-l-gap' : 'border-rule'
            }`}
          >
            <span className="max-w-read flex-1 font-read leading-relaxed">{r.text}</span>
            {uncovered.has(r.id) ? (
              <span className="ml-auto shrink-0 rounded bg-gap-soft px-2 py-0.5 text-xs font-medium text-gap">
                no question covers this
              </span>
            ) : (
              <span className="ml-auto shrink-0 text-xs text-covered">covered</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- flashcards ---

export function FlashcardsSection({ kitId, kit, meta }: { kitId: string; kit: Kit; meta: KitMeta }) {
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  const edit = useBuilderMutation(
    kitId,
    ({ fid, patch }: { fid: string; patch: { front?: string; back?: string } }) =>
      builder.editFlashcard(kitId, fid, patch),
    (current, { fid, patch }) => ({
      ...current,
      flashcards: current.flashcards.map((f) => (f.id === fid ? { ...f, ...patch } : f)),
    }),
  );

  const remove = useBuilderMutation(
    kitId,
    ({ fid }: { fid: string }) => builder.deleteFlashcard(kitId, fid),
    (current, { fid }) => ({
      ...current,
      flashcards: current.flashcards.filter((f) => f.id !== fid),
    }),
  );

  const add = useBuilderMutation(kitId, (card: { front: string; back: string }) =>
    builder.addFlashcard(kitId, card),
  );

  return (
    <section aria-labelledby="flashcards-heading" className="space-y-4">
      <h2 id="flashcards-heading" className="font-read text-xl">
        Flashcards
        <span className="ml-2 font-sans text-sm text-muted">{kit.flashcards.length}</span>
      </h2>

      <ErrorNote error={edit.error || remove.error || add.error} />

      <form
        className="flex flex-wrap items-end gap-2 rounded border border-rule bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate(
            { front, back },
            {
              onSuccess: () => {
                setFront('');
                setBack('');
              },
            },
          );
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="card-front" className="block text-sm font-medium">
            Front
          </label>
          <input
            id="card-front"
            required
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className={`${inputClass} font-read`}
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="card-back" className="block text-sm font-medium">
            Back
          </label>
          <input
            id="card-back"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className={`${inputClass} font-read`}
          />
        </div>
        <Button type="submit" variant="primary" loading={add.isPending}>
          Add card
        </Button>
      </form>

      {kit.flashcards.length === 0 ? (
        <EmptyState
          title="No flashcards yet"
          description="Add one above, and it will appear in practice mode straight away."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {kit.flashcards.map((card) => (
            <li
              key={card.id}
              className="space-y-2 rounded-lg border border-rule bg-surface p-3 shadow-soft transition-shadow hover:shadow-lift"
            >
              <EditableText
                label="card front"
                value={card.front}
                multiline={false}
                onSave={(value) => edit.mutate({ fid: card.id, patch: { front: value } })}
                className="font-read"
              />
              <EditableText
                label="card back"
                value={card.back}
                onSave={(value) => edit.mutate({ fid: card.id, patch: { back: value } })}
                className="font-read text-sm text-muted"
                placeholder="Add the answer"
              />
              <div className="flex items-center justify-between gap-2 text-xs">
                <ProvenanceMark source={meta.flashcards[card.id]?.source ?? 'generated'} />
                <Button
                  variant="ghost"
                  onClick={() => remove.mutate({ fid: card.id })}
                  aria-label={`Delete the card "${card.front.slice(0, 40)}"`}
                  className="ml-auto"
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- schedule ---

export function ScheduleSection({ kitId, kit }: { kitId: string; kit: Kit }) {
  const [days, setDays] = useState(kit.schedule.days_available);

  const regenerate = useBuilderMutation(kitId, (nextDays: number) =>
    builder.regenerateSchedule(kitId, nextDays),
  );

  const questionsById = new Map(kit.questions.map((q) => [q.id, q]));
  const totalMinutes = kit.schedule.days.reduce((sum, day) => sum + day.minutes, 0);

  return (
    <section aria-labelledby="schedule-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="schedule-heading" className="font-read text-xl">
          Study schedule
          <span className="ml-2 font-sans text-sm text-muted">
            {kit.schedule.days_available} days · {Math.round(totalMinutes / 60)}h total
          </span>
        </h2>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            regenerate.mutate(days);
          }}
        >
          <div>
            <label htmlFor="schedule-days" className="block text-xs text-muted">
              Days until the interview
            </label>
            <input
              id="schedule-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </div>
          <Button type="submit" variant="secondary" loading={regenerate.isPending}>
            Rebuild
          </Button>
        </form>
      </div>

      <p className="max-w-read text-sm text-muted">
        Harder and must-have material is placed first, so the heavy work lands early rather than
        the night before. Rebuilding is arithmetic, not a model call — it costs nothing to redo.
      </p>

      <ErrorNote error={regenerate.error} />

      <ol className="space-y-3">
        {kit.schedule.days.map((day) => (
          <li
            key={day.day}
            className="rounded-lg border border-rule bg-surface p-4 shadow-soft transition-shadow hover:shadow-lift"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-read text-lg">
                Day {day.day}
                <span className="ml-2 font-sans text-sm text-muted">{day.focus}</span>
              </h3>
              <span className="shrink-0 text-sm text-muted">{day.minutes} min</span>
            </div>

            {day.question_ids.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Nothing new scheduled — use it to revisit the cards you were least sure about.
              </p>
            ) : (
              <ul className="mt-2 max-w-read space-y-1.5 font-read leading-relaxed">
                {day.question_ids.map((id) => {
                  const question = questionsById.get(id);
                  const colors = question ? CATEGORY_COLORS[question.category] : null;
                  return (
                    <li key={id} className="flex items-start gap-2 text-sm">
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors?.solid ?? 'bg-rule'}`}
                      />
                      {question?.prompt ?? id}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

// --- resume match (optional creativity feature) ---

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

function ResumeRequirementList({ kit, resumeMatch }: { kit: Kit; resumeMatch: ResumeMatch }) {
  const byId = new Map(resumeMatch.results.map((r) => [r.requirement_id, r]));

  return (
    <ul className="space-y-1.5">
      {kit.role.requirements.map((r) => {
        const verdict = byId.get(r.id);
        const matched = verdict?.matched ?? false;
        return (
          <li
            key={r.id}
            className={`border bg-surface px-3 py-2 transition-colors ${
              matched ? 'border-rule' : 'border-rule border-l-4 border-l-gap'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="max-w-read flex-1 font-read leading-relaxed">{r.text}</span>
              {matched ? (
                <span className="ml-auto shrink-0 text-xs text-covered">found in resume</span>
              ) : (
                <span className="ml-auto shrink-0 rounded bg-gap-soft px-2 py-0.5 text-xs font-medium text-gap">
                  not found
                </span>
              )}
            </div>
            {!matched && verdict?.note && (
              <p className="mt-1.5 max-w-read text-sm text-muted">{verdict.note}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
