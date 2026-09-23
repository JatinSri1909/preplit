import { RequireAuth } from '../modules/auth/components/require-auth';
import { Dashboard } from '../modules/kits/components/dashboard';

export default function HomePage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
