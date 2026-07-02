import { useState } from 'react';
import { VendorsPage } from '../vendors/VendorsPage';
import { PurchaseOrdersTab } from './PurchaseOrdersTab';
import { useAuth } from '../../lib/auth';

export function PurchasingPage() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<'orders' | 'vendors'>('orders');

  if (tab === 'vendors') {
    return (
      <div>
        <nav style={{ maxWidth: 860, margin: '1rem auto 0', fontFamily: 'system-ui' }}>
          <button type="button" onClick={() => setTab('orders')}>
            ← Purchase orders
          </button>
        </nav>
        <VendorsPage />
      </div>
    );
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Purchasing</h1>
        <span>
          {user?.fullName} ({user?.role}){' '}
          <button type="button" onClick={() => setTab('vendors')}>
            Vendors
          </button>{' '}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>
      <PurchaseOrdersTab />
    </main>
  );
}
