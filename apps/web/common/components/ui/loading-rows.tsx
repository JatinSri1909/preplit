'use client';

/** Skeleton rows, so a loading kit occupies the shape it will fill. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16 border border-rule" />
      ))}
    </div>
  );
}
