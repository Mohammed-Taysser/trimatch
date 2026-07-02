import { ApprovalsInboxPage } from './features/approvals/ApprovalsInboxPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequisitionsPage } from './features/requisitions/RequisitionsPage';
import { useAuth } from './lib/auth';

export default function App() {
  const { token, user } = useAuth();
  if (!token) return <LoginPage />;
  return user?.role === 'approver' ? <ApprovalsInboxPage /> : <RequisitionsPage />;
}
