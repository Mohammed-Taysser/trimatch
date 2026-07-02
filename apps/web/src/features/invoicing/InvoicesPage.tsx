import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  InvoiceListSchema,
  InvoiceSchema,
  MatchRecordSchema,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function InvoicesPage() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [tax, setTax] = useState('0');
  const [isFinal, setIsFinal] = useState(true);
  const [reasonFilter, setReasonFilter] = useState('');
  const [resolutionReasons, setResolutionReasons] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
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
  const invoiceable = orders.data?.filter((po) =>
    ['issued', 'partially_received', 'received', 'closed'].includes(po.status),
  );

  const detail = useQuery({
    queryKey: ['purchase-orders', selectedPoId],
    enabled: selectedPoId !== null,
    queryFn: () =>
      apiFetch(`/api/v1/purchase-orders/${selectedPoId}`, { token, schema: PurchaseOrderSchema }),
  });

  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiFetch('/api/v1/invoices?pageSize=100', { token, schema: InvoiceListSchema }),
  });

  const submit = useMutation({
    mutationFn: () => {
      if (!detail.data) throw new Error('no PO selected');
      const lines = detail.data.lines
        .map((line) => ({
          poLineId: line.id,
          quantity: Number(quantities[line.id] ?? 0),
          unitPriceMinor: Math.round(Number(prices[line.id] ?? 0) * 100),
        }))
        .filter((line) => line.quantity > 0);
      const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPriceMinor, 0);
      const taxMinor = Math.round(Number(tax) * 100);
      return apiFetch('/api/v1/invoices', {
        method: 'POST',
        token,
        schema: InvoiceSchema,
        body: {
          poId: detail.data.id,
          invoiceNumber,
          invoiceDate,
          taxMinor,
          totalMinor: subtotal + taxMinor,
          isFinal,
          lines,
        },
      });
    },
    onSuccess: (invoice) => {
      setError(null);
      setMessage(`Entered ${invoice.invoiceNumber} — ${invoice.status}`);
      setInvoiceNumber('');
      setQuantities({});
      setPrices({});
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Invoice entry failed');
    },
  });

  const exceptions = useQuery({
    queryKey: ['exceptions', reasonFilter],
    queryFn: () =>
      apiFetch(`/api/v1/exceptions?pageSize=100${reasonFilter ? `&reason=${reasonFilter}` : ''}`, {
        token,
      }) as Promise<
        {
          invoice: {
            id: string;
            invoiceNumber: string;
            vendorName: string;
            totalMinor: number;
            currency: string;
            ageDays: number;
          };
          match: {
            reasons: { code: string; detail: string }[];
            totalDeltaMinor: number;
            comparisons: {
              lineNo: number;
              orderedQty: number;
              receivedQty: number;
              cumulativeInvoicedQty: number;
              poUnitPriceMinor: number;
              invoiceUnitPriceMinor: number;
              verdict: string;
            }[];
          };
        }[]
      >,
  });

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      apiFetch(`/api/v1/invoices/${id}/${action}`, {
        method: 'POST',
        token,
        body: { reason: resolutionReasons[id] },
        schema: InvoiceSchema,
      }),
    onSuccess: (invoice) => {
      setError(null);
      setMessage(`${invoice.invoiceNumber} → ${invoice.status}`);
      void queryClient.invalidateQueries({ queryKey: ['exceptions'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Resolution failed');
    },
  });

  const markPayable = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/invoices/${id}/payable`, { method: 'POST', token, schema: InvoiceSchema }),
    onSuccess: (invoice) => {
      setError(null);
      setMessage(`${invoice.invoiceNumber} is payable`);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Payable failed'),
  });

  const runMatch = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/invoices/${id}/match`, {
        method: 'POST',
        token,
        schema: MatchRecordSchema,
      }),
    onSuccess: (record) => {
      setError(null);
      setMessage(
        record.outcome === 'matched'
          ? '✅ Matched — invoice is payable'
          : `❌ Exception: ${record.reasons.map((r) => r.code).join(', ')}`,
      );
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Match failed');
    },
  });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Vendor invoices</h1>
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
        <h2>Enter an invoice</h2>
        <select
          aria-label="Purchase order to invoice"
          value={selectedPoId ?? ''}
          onChange={(e) => setSelectedPoId(e.target.value || null)}
        >
          <option value="">Pick a purchase order…</option>
          {invoiceable?.map((po) => (
            <option key={po.id} value={po.id}>
              {po.poNumber} · {po.vendorName} · {money(po.totalMinor, po.currency)}
            </option>
          ))}
        </select>

        {detail.data && (
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Vendor invoice number"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                style={{ flex: 1 }}
                required
              />
              <input
                type="date"
                aria-label="Invoice date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Tax"
                aria-label="Tax amount"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                style={{ width: 90 }}
              />
            </div>
            {detail.data.lines.map((line) => (
              <div key={line.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ flex: 2 }}>
                  {line.description} (received {line.receivedQuantity ?? 0})
                </span>
                <input
                  type="number"
                  min={0}
                  placeholder="Qty billed"
                  aria-label={`Quantity billed for ${line.description}`}
                  value={quantities[line.id] ?? ''}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  style={{ width: 100 }}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit price"
                  aria-label={`Unit price billed for ${line.description}`}
                  value={prices[line.id] ?? ''}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  style={{ width: 110 }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label>
                <input
                  type="checkbox"
                  checked={isFinal}
                  onChange={(e) => setIsFinal(e.target.checked)}
                />{' '}
                Final settlement for this PO
              </label>
              <button type="button" onClick={() => submit.mutate()} disabled={submit.isPending}>
                Enter invoice
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>Exceptions queue</h2>
        <label>
          Reason{' '}
          <select
            aria-label="Filter exceptions by reason"
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
          >
            <option value="">all</option>
            <option value="PRICE_VARIANCE">PRICE_VARIANCE</option>
            <option value="QTY_OVER_INVOICED">QTY_OVER_INVOICED</option>
            <option value="QTY_UNDER_DELIVERY">QTY_UNDER_DELIVERY</option>
            <option value="TOTAL_VARIANCE">TOTAL_VARIANCE</option>
          </select>
        </label>
        {exceptions.data?.length === 0 && <p>No exceptions. 🎉</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {exceptions.data?.map((ex) => (
            <li
              key={ex.invoice.id}
              style={{ border: '1px solid #d99', borderRadius: 6, padding: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  {ex.invoice.invoiceNumber} · {ex.invoice.vendorName}
                </strong>
                <span>
                  {money(ex.invoice.totalMinor, ex.invoice.currency)} · {ex.invoice.ageDays}d old
                </span>
              </div>
              <div style={{ color: 'crimson', fontSize: 14 }}>
                {ex.match.reasons.map((r) => r.code).join(', ')}
              </div>
              <table style={{ marginTop: 6, fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {[
                      'line',
                      'ordered',
                      'received',
                      'invoiced',
                      'PO price',
                      'inv price',
                      'verdict',
                    ].map((h) => (
                      <th key={h} style={{ padding: '2px 10px', textAlign: 'right' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ex.match.comparisons.map((c) => (
                    <tr key={c.lineNo}>
                      <td style={{ padding: '2px 10px', textAlign: 'right' }}>{c.lineNo}</td>
                      <td style={{ padding: '2px 10px', textAlign: 'right' }}>{c.orderedQty}</td>
                      <td
                        style={{
                          padding: '2px 10px',
                          textAlign: 'right',
                          fontWeight: c.receivedQty !== c.orderedQty ? 700 : 400,
                        }}
                      >
                        {c.receivedQty}
                      </td>
                      <td
                        style={{
                          padding: '2px 10px',
                          textAlign: 'right',
                          fontWeight: c.cumulativeInvoicedQty !== c.receivedQty ? 700 : 400,
                        }}
                      >
                        {c.cumulativeInvoicedQty}
                      </td>
                      <td style={{ padding: '2px 10px', textAlign: 'right' }}>
                        {(c.poUnitPriceMinor / 100).toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '2px 10px',
                          textAlign: 'right',
                          fontWeight: c.invoiceUnitPriceMinor !== c.poUnitPriceMinor ? 700 : 400,
                        }}
                      >
                        {(c.invoiceUnitPriceMinor / 100).toFixed(2)}
                      </td>
                      <td style={{ padding: '2px 10px', textAlign: 'right' }}>
                        {c.verdict === 'ok' ? '✓' : c.verdict}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ex.match.totalDeltaMinor !== 0 && (
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  total delta: <strong>{(ex.match.totalDeltaMinor / 100).toFixed(2)}</strong>
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <input
                  placeholder="Resolution reason"
                  aria-label={`Resolution reason for ${ex.invoice.invoiceNumber}`}
                  value={resolutionReasons[ex.invoice.id] ?? ''}
                  onChange={(e) =>
                    setResolutionReasons((prev) => ({ ...prev, [ex.invoice.id]: e.target.value }))
                  }
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => resolve.mutate({ id: ex.invoice.id, action: 'accept-variance' })}
                  disabled={resolve.isPending}
                >
                  Accept variance
                </button>
                <button
                  type="button"
                  onClick={() =>
                    resolve.mutate({ id: ex.invoice.id, action: 'request-credit-note' })
                  }
                  disabled={resolve.isPending}
                >
                  Credit note
                </button>
                <button
                  type="button"
                  onClick={() => resolve.mutate({ id: ex.invoice.id, action: 'reject' })}
                  disabled={resolve.isPending}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Invoices</h2>
        {invoices.isPending && <p>Loading…</p>}
        {invoices.data?.length === 0 && <p>No invoices yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {invoices.data?.map((inv) => (
            <li key={inv.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  {inv.invoiceNumber} · {inv.vendorName}
                </strong>
                <span>
                  {inv.status} · {money(inv.totalMinor, inv.currency)}
                </span>
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                PO {inv.poNumber ?? inv.poId.slice(0, 8)} · dated {inv.invoiceDate} · tax{' '}
                {money(inv.taxMinor, inv.currency)}
                {inv.isFinal ? ' · final' : ''}
              </div>
              {inv.status === 'entered' && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => runMatch.mutate(inv.id)}
                    disabled={runMatch.isPending}
                  >
                    Run 3-way match
                  </button>
                </div>
              )}
              {inv.status === 'variance_accepted' && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => markPayable.mutate(inv.id)}
                    disabled={markPayable.isPending}
                  >
                    Mark payable
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
