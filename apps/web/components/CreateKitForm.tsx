'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kits, type CreateKitInput } from '../lib/api';
import { Button, ErrorNote, Field, inputClass } from './ui';

/**
 * Creating a kit, one role or several.
 *
 * The two modes share a submit path on purpose: a single paste is just a
 * batch of one as far as the API is concerned, so there is no second code
 * path to keep in step.
 */

const DEFAULT_DAYS = 5;

/**
 * Parse an uploaded file of description-and-company pairs.
 *
 * Accepts the Appendix B case shape, because a candidate who already has a
 * cases.json for the batch command should not have to rewrite it to use
 * the interface. Errors name the row, since "invalid file" is useless when
 * nineteen of twenty rows are fine.
 */
function parseCasesFile(text: string): CreateKitInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON. Export it as a JSON array of roles.');
  }

  const rows = Array.isArray(raw) ? raw : (raw as { cases?: unknown })?.cases;
  if (!Array.isArray(rows)) {
    throw new Error('Expected a JSON array of roles, each with a jd and a company_url.');
  }
  if (rows.length === 0) throw new Error('That file has no roles in it.');

  return rows.map((row, index) => {
    const entry = row as Record<string, unknown>;
    const jd = entry.jd ?? entry.job_description;
    const url = entry.company_url ?? entry.companyUrl;
    if (typeof jd !== 'string' || jd.trim().length === 0) {
      throw new Error(`Row ${index + 1} has no job description.`);
    }
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error(`Row ${index + 1} has no company_url.`);
    }
    const days = Number(entry.days);
    return {
      jd,
      company_url: url,
      days: Number.isInteger(days) && days > 0 ? days : DEFAULT_DAYS,
    };
  });
}

export function CreateKitForm() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'single' | 'file'>('single');
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [parsed, setParsed] = useState<CreateKitInput[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const createOne = useMutation({
    mutationFn: () => kits.create({ jd, company_url: companyUrl, days }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      // A duplicate is not an error — the user gets taken to the kit they
      // already have, which is what they were asking for.
      router.push(`/kits/${result.id}${result.duplicate_of_existing_kit ? '?existing=1' : ''}`);
    },
  });

  const createMany = useMutation({
    mutationFn: () => kits.createBatch(parsed ?? []),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kits'] });
      setParsed(null);
      setMode('single');
    },
  });

  async function onFileChosen(file: File | undefined) {
    setFileError(null);
    setParsed(null);
    if (!file) return;
    try {
      setParsed(parseCasesFile(await file.text()));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  return (
    <section className="relative overflow-hidden rounded-lg border border-rule bg-surface p-4 shadow-soft sm:p-6">
      <span aria-hidden className="blob -right-10 -top-14 h-48 w-48 bg-accent/30" />
      <span aria-hidden className="blob -bottom-16 -left-6 h-40 w-40 bg-accent/15" />

      <h2 className="relative flex items-center gap-2 font-read text-xl">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-white shadow-soft"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M4 19.5V6a2 2 0 0 1 2-2h9l5 5v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M8 9h5M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        Prepare for a role
      </h2>

      <div
        className="mt-4 inline-flex gap-1 rounded-full bg-canvas p-1"
        role="tablist"
        aria-label="How to add roles"
      >
        {(
          [
            ['single', 'Paste one role'],
            ['file', 'Upload several'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
              mode === value ? 'bg-surface text-accent shadow-soft' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'single' ? (
        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            createOne.mutate();
          }}
        >
          <Field
            label="Job description"
            htmlFor="jd"
            hint="Paste the posting text. Job boards block automated access, so this is not fetched for you."
          >
            <textarea
              id="jd"
              required
              rows={8}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              aria-describedby="jd-hint"
              className={`${inputClass} font-read leading-relaxed`}
              placeholder="Senior Backend Engineer&#10;&#10;We are looking for…"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Company website" htmlFor="company-url" >
              <input
                id="company-url"
                type="url"
                required
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                className={inputClass}
                placeholder="https://example.com"
              />
            </Field>

            <Field label="Days until the interview" htmlFor="days">
              <input
                id="days"
                type="number"
                min={1}
                max={90}
                required
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className={`${inputClass} sm:w-32`}
              />
            </Field>
          </div>

          <ErrorNote error={createOne.error} />

          <Button type="submit" variant="primary" loading={createOne.isPending}>
            {createOne.isPending ? 'Starting research' : 'Build the kit'}
            {!createOne.isPending && (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </Button>
        </form>
      ) : (
        <div className="mt-5 space-y-4">
          <Field
            label="Roles file"
            htmlFor="cases"
            hint="A JSON array, each entry with jd, company_url and optionally days. The same file the batch command takes works here."
          >
            <input
              id="cases"
              type="file"
              accept="application/json,.json"
              aria-describedby="cases-hint"
              onChange={(e) => onFileChosen(e.target.files?.[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
            />
          </Field>

          {fileError && <ErrorNote error={new Error(fileError)} />}

          {parsed && (
            <div className="rounded border border-rule bg-canvas p-3 text-sm">
              <p className="font-medium">
                {parsed.length} {parsed.length === 1 ? 'role' : 'roles'} ready
              </p>
              <ul className="mt-2 space-y-1 text-muted">
                {parsed.slice(0, 5).map((entry, i) => (
                  <li key={i} className="truncate">
                    {entry.company_url} · {entry.days} days
                  </li>
                ))}
                {parsed.length > 5 && <li>and {parsed.length - 5} more</li>}
              </ul>
            </div>
          )}

          <ErrorNote error={createMany.error} />

          {createMany.data && (
            <div className="rounded border border-rule bg-canvas p-3 text-sm">
              Started {createMany.data.results.filter((r) => r.id).length} of{' '}
              {createMany.data.results.length}. They appear below as they finish.
              {createMany.data.results.some((r) => r.error) && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-gap">
                  {createMany.data.results
                    .filter((r) => r.error)
                    .map((r) => (
                      <li key={r.index}>
                        Row {r.index + 1}: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <Button
            variant="primary"
            disabled={!parsed}
            loading={createMany.isPending}
            onClick={() => createMany.mutate()}
          >
            Build {parsed?.length ?? ''} {parsed?.length === 1 ? 'kit' : 'kits'}
          </Button>
        </div>
      )}
    </section>
  );
}
