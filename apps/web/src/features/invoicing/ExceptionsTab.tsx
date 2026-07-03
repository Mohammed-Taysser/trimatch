import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExceptionsSummarySchema, InvoiceSchema } from '@trimatch/shared';
import { useState } from 'react';
import { Alert, Button, EmptyState, Field } from '../../components/ui';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { money } from '../../lib/format';

// The exceptions worklist: per-reason counts, sort/filter, side-by-side deltas
// and the AP resolutions (accept variance / request credit note / reject).
export function ExceptionsTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [reasonFilter, setReasonFilter] = useState('');
  const [sortBy, setSortBy] = useState('oldest');
  const [resolutionReasons, setResolutionReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ['exceptions-summary'],
    queryFn: () =>
      apiFetch('/api/v1/exceptions/summary', { token, schema: ExceptionsSummarySchema }),
  });

  const exceptions = useQuery({
    queryKey: ['exceptions', reasonFilter, sortBy],
    queryFn: () =>
      apiFetch(
        `/api/v1/exceptions?pageSize=100&sort=${sortBy}${reasonFilter ? `&reason=${reasonFilter}` : ''}`,
        {
          token,
        },
      ) as Promise<
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
      void queryClient.invalidateQueries({ queryKey: ['exceptions-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Resolution failed');
    },
  });

  return (
    <>
      {message && <Alert kind="success">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <section>
        <h2>Exceptions queue{summary.data ? ` (${summary.data.total})` : ''}</h2>
        <div className="card-actions">
          <Button
            small
            className="chip"
            aria-pressed={reasonFilter === ''}
            onClick={() => setReasonFilter('')}
          >
            all ({summary.data?.total ?? 0})
          </Button>
          {summary.data?.counts.map((entry) => (
            <Button
              key={entry.reason}
              small
              className="chip"
              aria-pressed={reasonFilter === entry.reason}
              onClick={() => setReasonFilter(entry.reason)}
            >
              {entry.reason} ({entry.count})
            </Button>
          ))}
        </div>
        <div className="form-row">
          <Field label="Sort">
            <select
              aria-label="Sort exceptions"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="oldest">oldest first</option>
              <option value="newest">newest first</option>
              <option value="vendor">by vendor</option>
              <option value="reason">by reason</option>
            </select>
          </Field>
          <Field label="Reason">
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
          </Field>
        </div>
        {exceptions.data?.length === 0 && (
          <EmptyState title="No exceptions" hint="Every invoice matched. 🎉" />
        )}
        <ul className="card-list">
          {exceptions.data?.map((ex) => (
            <li key={ex.invoice.id} className="card">
              <div className="card-row">
                <strong>
                  {ex.invoice.invoiceNumber} · {ex.invoice.vendorName}
                </strong>
                <span className="card-meta">
                  {money(ex.invoice.totalMinor, ex.invoice.currency)} · {ex.invoice.ageDays}d old
                </span>
              </div>
              <div className="card-actions">
                {ex.match.reasons.map((r) => (
                  <span key={r.code} className="badge badge-danger">
                    {r.code}
                  </span>
                ))}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="num">line</th>
                      <th className="num">ordered</th>
                      <th className="num">received</th>
                      <th className="num">invoiced</th>
                      <th className="num">PO price</th>
                      <th className="num">inv price</th>
                      <th className="num">verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ex.match.comparisons.map((c) => (
                      <tr key={c.lineNo}>
                        <td className="num">{c.lineNo}</td>
                        <td className="num">{c.orderedQty}</td>
                        <td className="num">
                          {c.receivedQty !== c.orderedQty ? (
                            <strong>{c.receivedQty}</strong>
                          ) : (
                            c.receivedQty
                          )}
                        </td>
                        <td className="num">
                          {c.cumulativeInvoicedQty !== c.receivedQty ? (
                            <strong>{c.cumulativeInvoicedQty}</strong>
                          ) : (
                            c.cumulativeInvoicedQty
                          )}
                        </td>
                        <td className="num">{(c.poUnitPriceMinor / 100).toFixed(2)}</td>
                        <td className="num">
                          {c.invoiceUnitPriceMinor !== c.poUnitPriceMinor ? (
                            <strong>{(c.invoiceUnitPriceMinor / 100).toFixed(2)}</strong>
                          ) : (
                            (c.invoiceUnitPriceMinor / 100).toFixed(2)
                          )}
                        </td>
                        <td className="num">
                          {c.verdict === 'ok' ? (
                            <span className="badge badge-ok">✓</span>
                          ) : (
                            <span className="badge badge-danger">{c.verdict}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ex.match.totalDeltaMinor !== 0 && (
                <div className="card-meta">
                  total delta: <strong>{(ex.match.totalDeltaMinor / 100).toFixed(2)}</strong>
                </div>
              )}
              <div className="card-actions">
                <input
                  placeholder="Resolution reason"
                  aria-label={`Resolution reason for ${ex.invoice.invoiceNumber}`}
                  value={resolutionReasons[ex.invoice.id] ?? ''}
                  onChange={(e) =>
                    setResolutionReasons((prev) => ({ ...prev, [ex.invoice.id]: e.target.value }))
                  }
                />
                <Button
                  small
                  onClick={() => resolve.mutate({ id: ex.invoice.id, action: 'accept-variance' })}
                  disabled={resolve.isPending}
                >
                  Accept variance
                </Button>
                <Button
                  small
                  onClick={() =>
                    resolve.mutate({ id: ex.invoice.id, action: 'request-credit-note' })
                  }
                  disabled={resolve.isPending}
                >
                  Credit note
                </Button>
                <Button
                  small
                  variant="danger"
                  onClick={() => resolve.mutate({ id: ex.invoice.id, action: 'reject' })}
                  disabled={resolve.isPending}
                >
                  Reject
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
