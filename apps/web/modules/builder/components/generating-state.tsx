'use client';

import { PIPELINE_STEPS, PIPELINE_STEP_LABELS, type PipelineStep } from '@prep-kit/core/client';
import { Spinner } from '../../../common/components/ui';

/**
 * Generation runs for a minute or more, so this names the steps rather
 * than showing an unexplained spinner.
 *
 * `step` is the pipeline's own real progress (polled from the server via
 * onStep in kitGeneration.ts) — not a canned animation. A step is done
 * once the server has moved past it, in progress while it's the current
 * one, and not-yet-started otherwise. It deliberately does not fake a
 * percentage: the pipeline's duration depends on how many requirements the
 * posting has and how hard the company site is to crawl, so any progress
 * bar would be invented — an honest, live list of what the system is
 * actually doing is more useful than a bar that stalls at 80%.
 */
export function GeneratingState({ step }: { step: PipelineStep | null }) {
  const currentIndex = step ? PIPELINE_STEPS.indexOf(step) : 0;

  return (
    <div className="mx-auto max-w-read px-4 py-16 sm:px-6">
      <h1 className="font-read text-2xl">Building your kit</h1>
      <p className="mt-2 text-muted">
        This takes a minute or two. You can leave this page — it carries on without you, and the
        kit appears on your dashboard when it is done.
      </p>

      <ol className="mt-6 space-y-2.5 text-sm">
        {PIPELINE_STEPS.map((s, i) => {
          const status = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
          return (
            <li
              key={s}
              className={`flex gap-2.5 transition-opacity ${status === 'pending' ? 'text-muted/50' : 'text-muted'}`}
            >
              <span aria-hidden className="relative mt-1.5 flex h-2 w-2 shrink-0">
                {status === 'current' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    status === 'pending' ? 'bg-muted/40' : 'bg-accent'
                  }`}
                />
              </span>
              {status === 'done' ? <span className="line-through decoration-muted/50">{PIPELINE_STEP_LABELS[s]}</span> : PIPELINE_STEP_LABELS[s]}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 flex items-center gap-2 text-sm text-muted">
        <Spinner label="Working" />
      </p>
    </div>
  );
}
