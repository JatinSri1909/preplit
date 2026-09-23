import type { Kit } from '@prep-kit/core';

export function RequirementList({
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
