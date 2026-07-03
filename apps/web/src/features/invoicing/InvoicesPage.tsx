import { Outlet } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';

const INVOICES_NAV = [
  { to: '/invoices', label: 'Invoices' },
  { to: '/invoices/exceptions', label: 'Exceptions' },
];

// The AP area is a nested-route layout: a sub-nav over an <Outlet/>; the
// sections (InvoicesTab, ExceptionsTab) are routed in App.tsx.
export function InvoicesLayout() {
  return (
    <AppShell title="Invoices & 3-way match" nav={INVOICES_NAV}>
      <Outlet />
    </AppShell>
  );
}
