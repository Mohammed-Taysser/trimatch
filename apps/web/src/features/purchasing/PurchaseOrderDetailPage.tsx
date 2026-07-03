import { useQuery } from '@tanstack/react-query';
import { PurchaseOrderSchema } from '@trimatch/shared';
import { useParams } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState, Loading, StatusBadge } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, money } from '../../lib/format';

// Focused, deep-linkable detail view for one purchase order.
export function PurchaseOrderDetailPage() {
  const { token, user } = useAuth();
  const { id } = useParams();
  const po = useQuery({
    queryKey: ['purchase-orders', id],
    enabled: Boolean(id),
    queryFn: () =>
      apiFetch(`/api/v1/purchase-orders/${id}`, { token, schema: PurchaseOrderSchema }),
  });

  const listPath = user?.role === 'admin' ? '/admin/purchase-orders' : '/purchasing/orders';
  const data = po.data;

  return (
    <AppShell
      title={data?.poNumber ?? 'Purchase order'}
      breadcrumbs={[{ label: 'Purchase orders', to: listPath }, { label: data?.poNumber ?? '…' }]}
    >
      {po.isPending && <Loading what="purchase order" />}
      {po.isError && <EmptyState title="Purchase order not found" />}
      {data && (
        <>
          <div className="card">
            <div className="card-row">
              <strong>{data.vendorName}</strong>
              <span>
                v{data.version} · <StatusBadge status={data.status} /> ·{' '}
                {money(data.totalMinor, data.currency)}
              </span>
            </div>
            <div className="card-meta">
              created {formatDate(data.createdAt)} · updated {formatDate(data.updatedAt)}
            </div>
          </div>

          <section>
            <h2>Lines</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>description</th>
                    <th className="num">qty</th>
                    <th className="num">unit price</th>
                    <th className="num">line total</th>
                    <th className="num">received</th>
                    <th className="num">open</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="num">{line.lineNo}</td>
                      <td>
                        {line.description}
                        <div className="card-meta">{line.category}</div>
                      </td>
                      <td className="num">{line.quantity}</td>
                      <td className="num">{money(line.unitPriceMinor, data.currency)}</td>
                      <td className="num">{money(line.lineTotalMinor, data.currency)}</td>
                      <td className="num">{line.receivedQuantity ?? 0}</td>
                      <td className="num">{line.openQuantity ?? line.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
