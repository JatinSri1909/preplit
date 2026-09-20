'use client';

/**
 * Shows where an item came from.
 *
 * This is the visible half of the state model: the reason "regenerate"
 * is safe to press is that the user can see, per item, what it will
 * touch. A regeneration button next to unlabelled content asks people to
 * trust an invisible rule, and they correctly won't.
 *
 * Generated items carry no mark at all. They are the default and the
 * majority, and badging every one of them would turn the real signal —
 * this one is yours, it survives — into noise.
 */
export function ProvenanceMark({ source }: { source: 'generated' | 'edited' | 'user_added' }) {
  if (source === 'generated') return null;

  const label = source === 'edited' ? 'Edited by you' : 'Written by you';

  return (
    <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
      {label} · kept on regenerate
    </span>
  );
}
