import { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Button } from '../../components/ui';
import { VendorsPage } from '../vendors/VendorsPage';
import { PurchaseOrdersTab } from './PurchaseOrdersTab';

export function PurchasingPage() {
  const [tab, setTab] = useState<'orders' | 'vendors'>('orders');

  return (
    <AppShell title="Purchasing">
      <nav className="form-row" aria-label="Purchasing sections">
        <Button className="chip" aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>
          Purchase orders
        </Button>
        <Button className="chip" aria-pressed={tab === 'vendors'} onClick={() => setTab('vendors')}>
          Vendors
        </Button>
      </nav>
      {tab === 'orders' ? <PurchaseOrdersTab /> : <VendorsPage />}
    </AppShell>
  );
}
