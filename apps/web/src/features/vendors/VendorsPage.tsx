import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Vendor, VendorCreate, VendorListSchema, VendorSchema } from '@trimatch/shared';
import { FormEvent, useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, Loading, Pagination } from '../../components/ui';
import { ApiError, apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const EMPTY: VendorCreate = { name: '', contactEmail: '', currency: 'USD', paymentTerms: 'NET 30' };

export function VendorsPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<VendorCreate>({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const vendors = useQuery({
    queryKey: ['vendors', page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/vendors?page=${page}&pageSize=20`, {
        token,
        schema: VendorListSchema,
      }),
  });

  const create = useMutation({
    mutationFn: (payload: VendorCreate) =>
      apiFetch('/api/v1/vendors', { method: 'POST', body: payload, token, schema: VendorSchema }),
    onSuccess: () => {
      setForm({ ...EMPTY });
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Save failed'),
  });

  const toggleActive = useMutation({
    mutationFn: (vendor: Vendor) =>
      apiFetch(`/api/v1/vendors/${vendor.id}`, {
        method: 'PUT',
        body: { active: !vendor.active },
        token,
        schema: VendorSchema,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate(form);
  }

  return (
    <>
      <section>
        <h2>New vendor</h2>
        <Card>
          <form onSubmit={onSubmit} className="form-grid">
            <div className="form-row">
              <Field label="Name">
                <input
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Contact email">
                <input
                  placeholder="Contact email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Currency">
                <input
                  placeholder="CCY"
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
                  }
                  maxLength={3}
                  required
                />
              </Field>
              <Field label="Payment terms">
                <input
                  placeholder="Terms"
                  value={form.paymentTerms}
                  onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  required
                />
              </Field>
              <Button type="submit" variant="primary" disabled={create.isPending}>
                Add vendor
              </Button>
            </div>
            {error && <Alert kind="error">{error}</Alert>}
          </form>
        </Card>
      </section>

      <section>
        <h2>Registry</h2>
        {vendors.isPending && <Loading what="Loading vendors" />}
        {vendors.isError && <Alert kind="error">Could not load vendors.</Alert>}
        {vendors.data?.items.length === 0 && <EmptyState title="No vendors yet." />}
        <ul className="card-list">
          {vendors.data?.items.map((vendor) => (
            <li key={vendor.id} className="card">
              <div className="card-row">
                <strong>
                  {vendor.name}{' '}
                  {vendor.active ? (
                    <span className="badge badge-ok">active</span>
                  ) : (
                    <span className="badge badge-neutral">inactive</span>
                  )}
                </strong>
                <span>
                  {vendor.currency} · {vendor.paymentTerms}
                </span>
              </div>
              <div className="card-meta">{vendor.contactEmail}</div>
              <div className="card-actions">
                <Button
                  small
                  onClick={() => toggleActive.mutate(vendor)}
                  disabled={toggleActive.isPending}
                >
                  {vendor.active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Pagination meta={vendors.data?.meta} onPage={setPage} />
      </section>
    </>
  );
}
