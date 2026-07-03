import { ReactNode, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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

export interface NavItem {
  to: string;
  label: string;
}

export interface Breadcrumb {
  label: string;
  to?: string;
}

export function AppShell({
  title,
  subtitle,
  nav,
  breadcrumbs,
  children,
}: {
  title: string;
  subtitle?: string;
  nav?: NavItem[];
  breadcrumbs?: Breadcrumb[];
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  // a11y: on route change, move focus to the page region so keyboard and
  // screen-reader users land at the top of the new page, not mid-list.
  useEffect(() => {
    mainRef.current?.focus();
  }, [pathname]);
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
      <main className="page" ref={mainRef} tabIndex={-1}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.label}>
                {index > 0 && <span className="breadcrumb-sep">/</span>}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <div className="page-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {nav && nav.length > 0 && (
          <nav className="page-nav" aria-label="Section navigation">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) =>
                  isActive ? 'page-nav-link is-active' : 'page-nav-link'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
        {children}
      </main>
    </>
  );
}
