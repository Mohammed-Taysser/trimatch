import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PoVersionListSchema,
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
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [vendorByReq, setVendorByReq] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [amendingId, setAmendingId] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [amendQty, setAmendQty] = useState<Record<string, string>>({});
  const [amendPrice, setAmendPrice] = useState<Record<string, string>>({});
  const [versionsId, setVersionsId] = useState<string | null>(null);

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

  const versions = useQuery({
    queryKey: ['po-versions', versionsId],
    enabled: versionsId !== null,
    queryFn: () =>
      apiFetch(`/api/v1/purchase-orders/${versionsId}/versions?pageSize=100`, {
        token,
        schema: PoVersionListSchema,
      }),
  });

  const amend = useMutation({
    mutationFn: (payload: {
      poId: string;
      reason: string;
      lines: { poLineId: string; quantity?: number; unitPriceMinor?: number }[];
    }) =>
      apiFetch(`/api/v1/purchase-orders/${payload.poId}/amend`, {
        method: 'POST',
        body: { reason: payload.reason, lines: payload.lines },
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      setAmendingId(null);
      setAmendReason('');
      setAmendQty({});
      setAmendPrice({});
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['po-versions'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Amendment failed'),
  });

  const approveAmendment = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/purchase-orders/${id}/approve-amendment`, {
        method: 'POST',
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Approval failed'),
  });

  function submitAmendment(po: { id: string; lines: { id: string }[] }) {
    const lines = po.lines
      .map((line) => {
        const qty = amendQty[line.id];
        const price = amendPrice[line.id];
        return {
          poLineId: line.id,
          ...(qty ? { quantity: Number(qty) } : {}),
          ...(price ? { unitPriceMinor: Math.round(Number(price) * 100) } : {}),
        };
      })
      .filter((line) => 'quantity' in line || 'unitPriceMinor' in line);
    amend.mutate({ poId: po.id, reason: amendReason, lines });
  }

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
                  v{po.version} · {po.status} · {money(po.totalMinor, po.currency)}
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
              <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                {(po.status === 'issued' || po.status === 'partially_received') && (
                  <button
                    type="button"
                    onClick={() => setAmendingId(amendingId === po.id ? null : po.id)}
                  >
                    Amend…
                  </button>
                )}
                {po.status === 'pending_reapproval' && user?.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => approveAmendment.mutate(po.id)}
                    disabled={approveAmendment.isPending}
                  >
                    Approve amendment
                  </button>
                )}
                {po.status === 'pending_reapproval' && user?.role !== 'admin' && (
                  <span style={{ color: '#8a6d00', fontSize: 14 }}>
                    Awaiting approver sign-off (total increased)
                  </span>
                )}
                {po.version > 1 && (
                  <button
                    type="button"
                    onClick={() => setVersionsId(versionsId === po.id ? null : po.id)}
                  >
                    {versionsId === po.id ? 'Hide versions' : 'Versions'}
                  </button>
                )}
              </div>
              {amendingId === po.id && (
                <div style={{ marginTop: 8, borderTop: '1px dashed #ccc', paddingTop: 8 }}>
                  {po.lines.map((line) => (
                    <div
                      key={line.id}
                      style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}
                    >
                      <span style={{ flex: 2 }}>
                        {line.description} (qty {line.quantity} @{' '}
                        {money(line.unitPriceMinor, po.currency)})
                      </span>
                      <input
                        type="number"
                        min={1}
                        placeholder="New qty"
                        aria-label={`New quantity for ${line.description}`}
                        value={amendQty[line.id] ?? ''}
                        onChange={(e) =>
                          setAmendQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                        style={{ width: 90 }}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="New price"
                        aria-label={`New unit price for ${line.description}`}
                        value={amendPrice[line.id] ?? ''}
                        onChange={(e) =>
                          setAmendPrice((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                        style={{ width: 110 }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      placeholder="Reason for the amendment"
                      aria-label="Reason for the amendment"
                      value={amendReason}
                      onChange={(e) => setAmendReason(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => submitAmendment(po)}
                      disabled={!amendReason || amend.isPending}
                    >
                      Submit amendment
                    </button>
                  </div>
                </div>
              )}
              {versionsId === po.id && (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 8, fontSize: 14 }}>
                  {versions.data?.map((v) => (
                    <li key={v.version} style={{ marginBottom: 4 }}>
                      <strong>v{v.version}</strong>
                      {v.current ? ' (current)' : ''} · {money(v.totalMinor, po.currency)} ·{' '}
                      {v.lines
                        .map((l) => `${l.quantity} × ${money(l.unitPriceMinor, po.currency)}`)
                        .join(', ')}
                      {v.supersededReason && (
                        <span style={{ color: '#555' }}>
                          {' '}
                          — superseded {new Date(v.supersededAt ?? '').toLocaleDateString()}:{' '}
                          {v.supersededReason}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
