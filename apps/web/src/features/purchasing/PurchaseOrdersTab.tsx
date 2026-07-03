import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PoVersionListSchema,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
  RequisitionListSchema,
  VendorListSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Button,
  ConfirmButton,
  EmptyState,
  Field,
  Loading,
  Pagination,
  Skeleton,
  StatusBadge,
} from '../../components/ui';
import { ApiError, apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, money } from '../../lib/format';

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
  const [page, setPage] = useState(1);

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
    queryKey: ['purchase-orders', page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/purchase-orders?page=${page}&pageSize=20`, {
        token,
        schema: PurchaseOrderListSchema,
      }),
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

  const close = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/purchase-orders/${id}/close`, {
        method: 'POST',
        token,
        schema: PurchaseOrderSchema,
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Close failed'),
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
        {error && <Alert kind="error">{error}</Alert>}
        {approved.isPending && <Loading what="Loading approved requisitions" />}
        {approved.data?.length === 0 && <EmptyState title="Nothing awaiting conversion." />}
        <ul className="card-list">
          {approved.data?.map((req) => (
            <li key={req.id} className="card">
              <div className="card-row">
                <strong>{req.justification}</strong>
                <span className="num">{money(req.totalMinor, req.currency)}</span>
              </div>
              <div className="card-meta">
                from {req.requesterName ?? req.requesterId} · needed by {formatDate(req.neededBy)} ·{' '}
                {req.lines.length} line(s)
              </div>
              <div className="card-actions">
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
                <Button
                  variant="primary"
                  onClick={() =>
                    convert.mutate({ requisitionId: req.id, vendorId: vendorByReq[req.id] })
                  }
                  disabled={!vendorByReq[req.id] || convert.isPending}
                >
                  Convert to PO
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Purchase orders</h2>
        {orders.isPending && <Skeleton rows={4} />}
        {orders.data?.items.length === 0 && <EmptyState title="No purchase orders yet." />}
        <ul className="card-list">
          {orders.data?.items.map((po) => (
            <li key={po.id} className="card">
              <div className="card-row">
                <strong>
                  {po.poNumber ?? '(draft — no number yet)'} · {po.vendorName}
                </strong>
                <span>
                  v{po.version} <StatusBadge status={po.status} />{' '}
                  {money(po.totalMinor, po.currency)}
                </span>
              </div>
              <div className="card-meta">
                {po.lines.length} line(s) · from requisition {po.requisitionId.slice(0, 8)}…
              </div>
              {(po.status === 'draft' || po.status === 'issued') && (
                <div className="card-actions">
                  {po.status === 'draft' && (
                    <Button onClick={() => issue.mutate(po.id)} disabled={issue.isPending}>
                      Issue (claims number)
                    </Button>
                  )}
                  <ConfirmButton
                    variant="danger"
                    disabled={cancel.isPending}
                    confirmLabel="Cancel PO"
                    onConfirm={() => cancel.mutate(po.id)}
                  >
                    Cancel PO
                  </ConfirmButton>
                </div>
              )}
              <div className="card-actions">
                <Link className="btn btn-sm" to={`/purchase-orders/${po.id}`}>
                  View
                </Link>
                {(po.status === 'issued' || po.status === 'partially_received') && (
                  <Button onClick={() => setAmendingId(amendingId === po.id ? null : po.id)}>
                    Amend…
                  </Button>
                )}
                {po.status === 'pending_reapproval' && user?.role === 'admin' && (
                  <Button
                    variant="primary"
                    onClick={() => approveAmendment.mutate(po.id)}
                    disabled={approveAmendment.isPending}
                  >
                    Approve amendment
                  </Button>
                )}
                {po.status === 'pending_reapproval' && user?.role !== 'admin' && (
                  <span className="badge badge-warn">awaiting approver sign-off</span>
                )}
                {po.version > 1 && (
                  <Button onClick={() => setVersionsId(versionsId === po.id ? null : po.id)}>
                    {versionsId === po.id ? 'Hide versions' : 'Versions'}
                  </Button>
                )}
                {po.status === 'received' && (
                  <Button
                    variant="primary"
                    onClick={() => close.mutate(po.id)}
                    disabled={close.isPending}
                  >
                    Close PO
                  </Button>
                )}
              </div>
              {amendingId === po.id && (
                <>
                  <hr className="divider" />
                  <div className="form-grid">
                    {po.lines.map((line) => (
                      <div key={line.id} className="form-row">
                        <span className="card-meta">
                          {line.description} (qty {line.quantity} @{' '}
                          {money(line.unitPriceMinor, po.currency)})
                        </span>
                        <Field label="New qty">
                          <input
                            type="number"
                            min={1}
                            placeholder="New qty"
                            aria-label={`New quantity for ${line.description}`}
                            value={amendQty[line.id] ?? ''}
                            onChange={(e) =>
                              setAmendQty((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                          />
                        </Field>
                        <Field label="New price">
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
                          />
                        </Field>
                      </div>
                    ))}
                    <div className="form-row">
                      <Field label="Reason">
                        <input
                          placeholder="Reason for the amendment"
                          aria-label="Reason for the amendment"
                          value={amendReason}
                          onChange={(e) => setAmendReason(e.target.value)}
                        />
                      </Field>
                      <Button
                        variant="primary"
                        onClick={() => submitAmendment(po)}
                        disabled={!amendReason || amend.isPending}
                      >
                        Submit amendment
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {versionsId === po.id && (
                <>
                  <hr className="divider" />
                  {versions.isPending && <Loading what="Loading versions" />}
                  {versions.data && (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Version</th>
                            <th className="num">Total</th>
                            <th>Lines</th>
                            <th>Superseded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.data.map((v) => (
                            <tr key={v.version}>
                              <td>
                                v{v.version}
                                {v.current ? ' (current)' : ''}
                              </td>
                              <td className="num">{money(v.totalMinor, po.currency)}</td>
                              <td>
                                {v.lines
                                  .map(
                                    (l) =>
                                      `${l.quantity} × ${money(l.unitPriceMinor, po.currency)}`,
                                  )
                                  .join(', ')}
                              </td>
                              <td>
                                {v.supersededReason
                                  ? `${v.supersededAt ? formatDate(v.supersededAt) : ''}: ${v.supersededReason}`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <Pagination meta={orders.data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
