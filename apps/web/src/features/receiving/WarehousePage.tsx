import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GrnSchema, PurchaseOrderListSchema, PurchaseOrderSchema } from '@trimatch/shared';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function WarehousePage() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () =>
      apiFetch('/api/v1/purchase-orders?pageSize=100', {
        token,
        schema: PurchaseOrderListSchema,
      }),
  });
  const receivable = orders.data?.filter(
    (po) => po.status === 'issued' || po.status === 'partially_received',
  );

  const detail = useQuery({
    queryKey: ['purchase-orders', selectedId],
    enabled: selectedId !== null,
    queryFn: () =>
      apiFetch(`/api/v1/purchase-orders/${selectedId}`, { token, schema: PurchaseOrderSchema }),
  });

  const receive = useMutation({
    mutationFn: (payload: { poId: string; lines: { poLineId: string; quantity: number }[] }) =>
      apiFetch('/api/v1/receipts', { method: 'POST', body: payload, token, schema: GrnSchema }),
    onSuccess: (grn) => {
      setError(null);
      setMessage(`Recorded ${grn.grnNumber}`);
      setQuantities({});
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Receipt failed');
    },
  });

  function submitReceipt() {
    if (!detail.data) return;
    const lines = detail.data.lines
      .map((line) => ({ poLineId: line.id, quantity: Number(quantities[line.id] ?? 0) }))
      .filter((line) => line.quantity > 0);
    receive.mutate({ poId: detail.data.id, lines });
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Goods receiving</h1>
        <span>
          {user?.fullName} ({user?.role}){' '}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>

      {message && <p style={{ color: '#1a6b2f' }}>{message}</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <section>
        <h2>Open purchase orders</h2>
        {orders.isPending && <p>Loading…</p>}
        {receivable?.length === 0 && <p>Nothing awaiting receipt.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {receivable?.map((po) => (
            <li key={po.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  {po.poNumber} · {po.vendorName}
                </strong>
                <span>
                  {po.status} · {money(po.totalMinor, po.currency)}
                </span>
              </div>
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={() => setSelectedId(po.id)}>
                  Receive goods
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {selectedId && detail.data && (
        <section>
          <h2>Receive against {detail.data.poNumber}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {detail.data.lines.map((line) => (
              <li key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 2 }}>{line.description}</span>
                <span style={{ color: '#555' }}>
                  ordered {line.quantity} · received {line.receivedQuantity ?? 0} · open{' '}
                  {line.openQuantity ?? line.quantity}
                </span>
                <input
                  type="number"
                  min={0}
                  max={line.openQuantity ?? line.quantity}
                  placeholder="Qty"
                  aria-label={`Quantity received for ${line.description}`}
                  value={quantities[line.id] ?? ''}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  style={{ width: 90 }}
                />
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={submitReceipt} disabled={receive.isPending}>
              Record receipt
            </button>
            <button type="button" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
