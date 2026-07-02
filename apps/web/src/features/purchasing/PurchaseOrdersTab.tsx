import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
  RequisitionListSchema,
  VendorListSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function PurchaseOrdersTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [vendorByReq, setVendorByReq] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const approved = useQuery({
    queryKey: ['requisitions', 'approved'],
    queryFn: () =>
      apiFetch('/api/v1/requisitions/approved', { token, schema: RequisitionListSchema }),
  });
  const vendors = useQuery({
    queryKey: ['vendors', 'active'],
    queryFn: () => apiFetch('/api/v1/vendors?active=true', { token, schema: VendorListSchema }),
  });
  const orders = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => apiFetch('/api/v1/purchase-orders', { token, schema: PurchaseOrderListSchema }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/purchase-orders/${id}/cancel`, {
        method: 'POST',
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Cancel failed'),
  });

  const issue = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/purchase-orders/${id}/issue`, {
        method: 'POST',
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Issue failed'),
  });

  const convert = useMutation({
    mutationFn: (payload: { requisitionId: string; vendorId: string }) =>
      apiFetch('/api/v1/purchase-orders/from-requisition', {
        method: 'POST',
        body: payload,
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['requisitions', 'approved'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Convert failed'),
  });

  return (
    <>
      <section>
        <h2>Approved requisitions</h2>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        {approved.isPending && <p>Loading…</p>}
        {approved.data?.length === 0 && <p>Nothing awaiting conversion.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {approved.data?.map((req) => (
            <li key={req.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{req.justification}</strong>
                <span>{money(req.totalMinor, req.currency)}</span>
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                from {req.requesterName ?? req.requesterId} · needed by {req.neededBy} ·{' '}
                {req.lines.length} line(s)
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                <select
                  aria-label="Vendor for this purchase order"
                  value={vendorByReq[req.id] ?? ''}
                  onChange={(e) =>
                    setVendorByReq((prev) => ({ ...prev, [req.id]: e.target.value }))
                  }
                >
                  <option value="">Pick a vendor…</option>
                  {vendors.data?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.currency}, {v.paymentTerms})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    convert.mutate({ requisitionId: req.id, vendorId: vendorByReq[req.id] })
                  }
                  disabled={!vendorByReq[req.id] || convert.isPending}
                >
                  Convert to PO
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Purchase orders</h2>
        {orders.isPending && <p>Loading…</p>}
        {orders.data?.length === 0 && <p>No purchase orders yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {orders.data?.map((po) => (
            <li key={po.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  {po.poNumber ?? '(draft — no number yet)'} · {po.vendorName}
                </strong>
                <span>
                  {po.status} · {money(po.totalMinor, po.currency)}
                </span>
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                {po.lines.length} line(s) · from requisition {po.requisitionId.slice(0, 8)}…
              </div>
              {(po.status === 'draft' || po.status === 'issued') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  {po.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => issue.mutate(po.id)}
                      disabled={issue.isPending}
                    >
                      Issue (claims number)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => cancel.mutate(po.id)}
                    disabled={cancel.isPending}
                  >
                    Cancel PO
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
