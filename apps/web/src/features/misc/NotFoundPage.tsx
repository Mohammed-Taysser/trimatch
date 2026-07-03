import { Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState } from '../../components/ui';

export function NotFoundPage() {
  return (
    <AppShell title="Not found">
      <EmptyState title="404 — page not found" hint="That page doesn’t exist." />
      <Link to="/">Go to your home page</Link>
    </AppShell>
  );
}
