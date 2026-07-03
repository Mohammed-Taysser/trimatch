import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  AdminLayout,
  AuditTab,
  RequisitionsTab,
  UsersTab,
} from './features/admin/AdminDashboardPage';
import { ApprovalsInboxPage } from './features/approvals/ApprovalsInboxPage';
import { LoginPage } from './features/auth/LoginPage';
import { InvoicesPage } from './features/invoicing/InvoicesPage';
import { NotFoundPage } from './features/misc/NotFoundPage';
import { PurchaseOrdersTab } from './features/purchasing/PurchaseOrdersTab';
import { PurchasingPage } from './features/purchasing/PurchasingPage';
import { WarehousePage } from './features/receiving/WarehousePage';
import { RequisitionsPage } from './features/requisitions/RequisitionsPage';
import { VendorsPage } from './features/vendors/VendorsPage';
import { useAuth } from './lib/auth';

// Each role lands on its home route; unknown roles fall back to requisitions.
const HOME_BY_ROLE: Record<string, string> = {
  requester: '/requisitions',
  approver: '/approvals',
  purchasing: '/purchasing',
  warehouse: '/warehouse',
  ap: '/invoices',
  admin: '/admin',
};

function homeFor(role: string | undefined): string {
  return HOME_BY_ROLE[role ?? ''] ?? '/requisitions';
}

// A route only its allowed roles may reach; everyone else is redirected home.
function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { user } = useAuth();
  if (user && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { token, user } = useAuth();
  if (!token) return <LoginPage />;
  return (
    <Routes>
      <Route path="/" element={<Navigate to={homeFor(user?.role)} replace />} />
      <Route
        path="/requisitions"
        element={
          <RequireRole roles={['requester']}>
            <RequisitionsPage />
          </RequireRole>
        }
      />
      <Route
        path="/approvals"
        element={
          <RequireRole roles={['approver']}>
            <ApprovalsInboxPage />
          </RequireRole>
        }
      />
      <Route
        path="/purchasing"
        element={
          <RequireRole roles={['purchasing']}>
            <PurchasingPage />
          </RequireRole>
        }
      />
      <Route
        path="/warehouse"
        element={
          <RequireRole roles={['warehouse']}>
            <WarehousePage />
          </RequireRole>
        }
      />
      <Route
        path="/invoices"
        element={
          <RequireRole roles={['ap']}>
            <InvoicesPage />
          </RequireRole>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRole roles={['admin']}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="requisitions" replace />} />
        <Route path="requisitions" element={<RequisitionsTab />} />
        <Route path="purchase-orders" element={<PurchaseOrdersTab />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="users" element={<UsersTab />} />
        <Route path="audit" element={<AuditTab />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
