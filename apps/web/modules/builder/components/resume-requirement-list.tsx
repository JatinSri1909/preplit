import type { Kit, ResumeMatch } from '@prep-kit/core';

export function ResumeRequirementList({ kit, resumeMatch }: { kit: Kit; resumeMatch: ResumeMatch }) {
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
