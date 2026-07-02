import { LoginPage } from './features/auth/LoginPage';
import { RequisitionsPage } from './features/requisitions/RequisitionsPage';
import { useAuth } from './lib/auth';

export default function App() {
  const { token } = useAuth();
  return token ? <RequisitionsPage /> : <LoginPage />;
}
