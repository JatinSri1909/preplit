'use client';

import type { Kit } from '@prep-kit/core';
import { RequirementList } from './requirement-list';
import { EmptyState } from '../../../common/components/ui';

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
