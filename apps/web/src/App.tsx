import { ApprovalsInboxPage } from './features/approvals/ApprovalsInboxPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequisitionsPage } from './features/requisitions/RequisitionsPage';
import { VendorsPage } from './features/vendors/VendorsPage';
import { useAuth } from './lib/auth';

export default function App() {
  const { token, user } = useAuth();
  if (!token) return <LoginPage />;
  if (user?.role === 'approver') return <ApprovalsInboxPage />;
  if (user?.role === 'purchasing' || user?.role === 'admin') return <VendorsPage />;
  return <RequisitionsPage />;
}
