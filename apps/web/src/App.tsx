import { ApprovalsInboxPage } from './features/approvals/ApprovalsInboxPage';
import { InvoicesPage } from './features/invoicing/InvoicesPage';
import { LoginPage } from './features/auth/LoginPage';
import { PurchasingPage } from './features/purchasing/PurchasingPage';
import { WarehousePage } from './features/receiving/WarehousePage';
import { RequisitionsPage } from './features/requisitions/RequisitionsPage';
import { useAuth } from './lib/auth';

export default function App() {
  const { token, user } = useAuth();
  if (!token) return <LoginPage />;
  if (user?.role === 'approver') return <ApprovalsInboxPage />;
  if (user?.role === 'purchasing' || user?.role === 'admin') return <PurchasingPage />;
  if (user?.role === 'warehouse') return <WarehousePage />;
  if (user?.role === 'ap') return <InvoicesPage />;
  return <RequisitionsPage />;
}
