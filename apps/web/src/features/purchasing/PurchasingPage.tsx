import { Outlet } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';

const PURCHASING_NAV = [
  { to: '/purchasing/orders', label: 'Purchase orders' },
  { to: '/purchasing/vendors', label: 'Vendors' },
];

// The purchasing area is a nested-route layout: a sub-nav over an <Outlet/>;
// the sections (PurchaseOrdersTab, VendorsPage) are routed in App.tsx.
export function PurchasingLayout() {
  return (
    <AppShell title="Purchasing" nav={PURCHASING_NAV}>
      <Outlet />
    </AppShell>
  );
}
