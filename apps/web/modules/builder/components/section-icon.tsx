import { SECTION_ICONS, type SectionId } from '../constants/builder.constants';

export function SectionIcon({ id, className }: { id: SectionId; className?: string }) {
  const paths = SECTION_ICONS[id].split('|');
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {paths.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
