import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  InvoiceListSchema,
  InvoiceSchema,
  MatchRecordSchema,
  PurchaseOrderListSchema,
  PurchaseOrderSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Pagination,
  StatusBadge,
} from '../../components/ui';
import { ApiError, apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, money } from '../../lib/format';

// Invoice entry + the invoice list (match / mark payable / apply credit note).
export function InvoicesTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [tax, setTax] = useState('0');
  const [isFinal, setIsFinal] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [creditInputs, setCreditInputs] = useState<Record<string, { amount: string; ref: string }>>(
    {},
  );
  const [invoicesPage, setInvoicesPage] = useState(1);
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
    queryKey: ['invoices', invoicesPage],
    queryFn: () =>
      apiFetchPaged(`/api/v1/invoices?page=${invoicesPage}&pageSize=20`, {
        token,
        schema: InvoiceListSchema,
      }),
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
      void queryClient.invalidateQueries({ queryKey: ['exceptions'] });
      void queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Match failed');
    },
  });

  const applyCreditNote = useMutation({
    mutationFn: ({
      id,
      creditMinor,
      reference,
    }: {
      id: string;
      creditMinor: number;
      reference: string;
    }) =>
      apiFetch(`/api/v1/invoices/${id}/apply-credit-note`, {
        method: 'POST',
        token,
        body: { creditMinor, reference },
        schema: MatchRecordSchema,
      }),
    onSuccess: () => {
      setError(null);
      setMessage('Credit note applied — invoice reconciled and payable');
      setCreditInputs({});
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Credit note failed');
    },
  });

  return (
    <>
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section>
        <h2>Enter an invoice</h2>
        <Card>
          <div className="form-grid">
            <Field label="Purchase order">
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
            </Field>

            {detail.data && (
              <>
                <div className="form-row">
                  <Field label="Invoice number">
                    <input
                      placeholder="Vendor invoice number"
                      aria-label="Vendor invoice number"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Invoice date">
                    <input
                      type="date"
                      aria-label="Invoice date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Tax">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Tax"
                      aria-label="Tax amount"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                    />
                  </Field>
                </div>
                {detail.data.lines.map((line) => (
                  <div key={line.id} className="form-row">
                    <span className="card-meta">
                      {line.description} (received {line.receivedQuantity ?? 0})
                    </span>
                    <Field label="Qty billed">
                      <input
                        type="number"
                        min={0}
                        placeholder="Qty billed"
                        aria-label={`Quantity billed for ${line.description}`}
                        value={quantities[line.id] ?? ''}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Unit price">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Unit price"
                        aria-label={`Unit price billed for ${line.description}`}
                        value={prices[line.id] ?? ''}
                        onChange={(e) =>
                          setPrices((prev) => ({ ...prev, [line.id]: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                ))}
                <div className="form-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={isFinal}
                      onChange={(e) => setIsFinal(e.target.checked)}
                    />{' '}
                    Final settlement for this PO
                  </label>
                  <Button
                    variant="primary"
                    onClick={() => submit.mutate()}
                    disabled={submit.isPending}
                  >
                    Enter invoice
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </section>

      <section>
        <h2>Invoices</h2>
        {invoices.isPending && <Loading />}
        {invoices.data?.items.length === 0 && <EmptyState title="No invoices yet" />}
        <ul className="card-list">
          {invoices.data?.items.map((inv) => (
            <li key={inv.id} className="card">
              <div className="card-row">
                <strong>
                  {inv.invoiceNumber} · {inv.vendorName}
                </strong>
                <span>
                  <StatusBadge status={inv.status} /> · {money(inv.totalMinor, inv.currency)}
                </span>
              </div>
              <div className="card-meta">
                PO {inv.poNumber ?? inv.poId.slice(0, 8)} · dated {formatDate(inv.invoiceDate)} ·
                tax {money(inv.taxMinor, inv.currency)}
                {inv.isFinal ? ' · final' : ''}
              </div>
              {inv.status === 'entered' && (
                <div className="card-actions">
                  <Button
                    variant="primary"
                    small
                    onClick={() => runMatch.mutate(inv.id)}
                    disabled={runMatch.isPending}
                  >
                    Run 3-way match
                  </Button>
                </div>
              )}
              {inv.status === 'variance_accepted' && (
                <div className="card-actions">
                  <Button
                    variant="primary"
                    small
                    onClick={() => markPayable.mutate(inv.id)}
                    disabled={markPayable.isPending}
                  >
                    Mark payable
                  </Button>
                </div>
              )}
              {inv.status === 'awaiting_credit_note' && (
                <div className="card-actions">
                  <input
                    aria-label={`Credit note amount for ${inv.invoiceNumber}`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Credit amount"
                    value={creditInputs[inv.id]?.amount ?? ''}
                    onChange={(e) =>
                      setCreditInputs((prev) => ({
                        ...prev,
                        [inv.id]: { amount: e.target.value, ref: prev[inv.id]?.ref ?? '' },
                      }))
                    }
                  />
                  <input
                    aria-label={`Credit note reference for ${inv.invoiceNumber}`}
                    placeholder="Reference"
                    value={creditInputs[inv.id]?.ref ?? ''}
                    onChange={(e) =>
                      setCreditInputs((prev) => ({
                        ...prev,
                        [inv.id]: { amount: prev[inv.id]?.amount ?? '', ref: e.target.value },
                      }))
                    }
                  />
                  <Button
                    variant="primary"
                    small
                    disabled={
                      applyCreditNote.isPending ||
                      !creditInputs[inv.id]?.amount ||
                      !creditInputs[inv.id]?.ref
                    }
                    onClick={() =>
                      applyCreditNote.mutate({
                        id: inv.id,
                        creditMinor: Math.round(Number(creditInputs[inv.id].amount) * 100),
                        reference: creditInputs[inv.id].ref,
                      })
                    }
                  >
                    Apply credit note
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Pagination meta={invoices.data?.meta} onPage={setInvoicesPage} />
      </section>
    </>
  );
}
