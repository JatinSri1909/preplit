import { RequireAuth } from '../../../../modules/auth/components/require-auth';
import { PracticeMode } from '../../../../modules/practice/components/practice-mode';

export default function PracticePage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <RequireAuth>
      <PracticeMode kitId={id} />
    </RequireAuth>
  );
}
