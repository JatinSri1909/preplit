import { RequireAuth } from '../components/RequireAuth';
import { Dashboard } from '../components/Dashboard';

export default function HomePage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
