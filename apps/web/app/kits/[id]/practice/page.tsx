import { RequireAuth } from '../../../../components/RequireAuth';
import { PracticeMode } from '../../../../components/PracticeMode';

export default function PracticePage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <RequireAuth>
      <PracticeMode kitId={id} />
    </RequireAuth>
  );
}
