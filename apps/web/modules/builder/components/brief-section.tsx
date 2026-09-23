'use client';

import type { Kit, KitMeta } from '@prep-kit/core';
import { builder } from '../builder.api';
import { useBuilderMutation } from '../hooks/use-builder-mutation';
import { EditableText } from '../../../common/components/editable-text';
import { ProvenanceMark } from './provenance-mark';
import { Button, ErrorNote } from '../../../common/components/ui';

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
