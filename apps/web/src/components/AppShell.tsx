import { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { Button } from './ui';

// What each role is here to do — shown in the header next to the brand.
const ROLE_SCOPE: Record<string, string> = {
  requester: 'My requisitions',
  approver: 'Approvals inbox',
  purchasing: 'Purchasing',
  warehouse: 'Goods receiving',
  ap: 'Invoices & 3-way match',
  admin: 'Admin dashboard',
};

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  return (
    <>
      <header className="shell-header">
        <div className="shell-header-inner">
          <span className="shell-brand">TriMatch</span>
          <span className="shell-scope">{ROLE_SCOPE[user?.role ?? ''] ?? ''}</span>
          <span className="shell-user">
            <span>
              {user?.fullName} <span className={`badge badge-brand`}>{user?.role}</span>
            </span>
            <Button small onClick={logout}>
              Sign out
            </Button>
          </span>
        </div>
      </header>
      <main className="page">
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </main>
    </>
  );
}
