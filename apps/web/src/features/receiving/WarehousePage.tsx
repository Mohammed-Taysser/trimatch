import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GrnListSchema,
  GrnSchema,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, Card, EmptyState, Loading, StatusBadge } from '../../components/ui';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDateTime, money } from '../../lib/format';

export function WarehousePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [damaged, setDamaged] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // pageSize=100 + client-side status filter: there is no server-side status
  // filter yet (tracked in the backlog) — a page of 20 would hide receivable POs.
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

  const history = useQuery({
    queryKey: ['receipts', selectedId],
    enabled: selectedId !== null,
    queryFn: () =>
      apiFetch(`/api/v1/receipts?poId=${selectedId}&pageSize=100`, {
        token,
        schema: GrnListSchema,
      }),
  });

  const receive = useMutation({
    mutationFn: (payload: {
      poId: string;
      lines: { poLineId: string; quantity: number; damagedQuantity?: number }[];
    }) => apiFetch('/api/v1/receipts', { method: 'POST', body: payload, token, schema: GrnSchema }),
    onSuccess: (grn) => {
      setError(null);
      setMessage(`Recorded ${grn.grnNumber}`);
      setQuantities({});
      setDamaged({});
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Receipt failed');
    },
  });

  function submitReceipt() {
    if (!detail.data) return;
    const lines = detail.data.lines
      .map((line) => ({
        poLineId: line.id,
        quantity: Number(quantities[line.id] ?? 0),
        damagedQuantity: Number(damaged[line.id] ?? 0) || undefined,
      }))
      .filter((line) => line.quantity > 0);
    receive.mutate({ poId: detail.data.id, lines });
  }

  return (
    <AppShell title="Goods receiving">
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section>
        <h2>Open purchase orders</h2>
        {orders.isPending && <Loading />}
        {receivable?.length === 0 && <EmptyState title="Nothing awaiting receipt." />}
        <ul className="card-list">
          {receivable?.map((po) => (
            <li key={po.id} className="card">
              <div className="card-row">
                <strong>
                  {po.poNumber} · {po.vendorName}
                </strong>
                <span className="card-meta">
                  <StatusBadge status={po.status} /> {money(po.totalMinor, po.currency)}
                </span>
              </div>
              <div className="card-actions">
                <Button small onClick={() => setSelectedId(po.id)}>
                  Receive goods
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {selectedId && detail.data && (
        <section>
          <h2>Receive against {detail.data.poNumber}</h2>
          <Card>
            <ul className="card-list">
              {detail.data.lines.map((line) => (
                <li key={line.id} className="form-row">
                  <span>{line.description}</span>
                  <span className="card-meta">
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
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Damaged"
                    aria-label={`Damaged units for ${line.description}`}
                    value={damaged[line.id] ?? ''}
                    onChange={(e) => setDamaged((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <div className="card-actions">
              <Button variant="primary" onClick={submitReceipt} disabled={receive.isPending}>
                Record receipt
              </Button>
              <Button variant="ghost" onClick={() => setSelectedId(null)}>
                Close
              </Button>
            </div>

            <hr className="divider" />

            <h3>Receipt history</h3>
            {history.data?.length === 0 && <p className="card-meta">No receipts yet.</p>}
            {history.data && history.data.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>GRN</th>
                      <th>When</th>
                      <th>Received by</th>
                      <th>Quantities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.map((grn) => (
                      <tr key={grn.id}>
                        <td>{grn.grnNumber}</td>
                        <td>{formatDateTime(grn.createdAt)}</td>
                        <td>{grn.receivedByName}</td>
                        <td>
                          {grn.lines
                            .map((line) =>
                              line.damagedQuantity > 0
                                ? `${line.quantity} received (${line.damagedQuantity} damaged)`
                                : `${line.quantity} received`,
                            )
                            .join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      )}
    </AppShell>
  );
}
