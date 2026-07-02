import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Vendor, VendorCreate, VendorListSchema, VendorSchema } from '@trimatch/shared';
import { FormEvent, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const EMPTY: VendorCreate = { name: '', contactEmail: '', currency: 'USD', paymentTerms: 'NET 30' };

export function VendorsPage() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<VendorCreate>({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);

  const vendors = useQuery({
    queryKey: ['vendors'],
    queryFn: () => apiFetch('/api/v1/vendors', { token, schema: VendorListSchema }),
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
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Vendors</h1>
        <span>
          {user?.fullName} ({user?.role}){' '}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>

      <section>
        <h2>New vendor</h2>
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ flex: 2 }}
            required
          />
          <input
            placeholder="Contact email"
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
            style={{ flex: 2 }}
            required
          />
          <input
            placeholder="CCY"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            maxLength={3}
            style={{ width: 60 }}
            required
          />
          <input
            placeholder="Terms"
            value={form.paymentTerms}
            onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
            style={{ width: 100 }}
            required
          />
          <button type="submit" disabled={create.isPending}>
            Add vendor
          </button>
        </form>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </section>

      <section>
        <h2>Registry</h2>
        {vendors.isPending && <p>Loading…</p>}
        {vendors.isError && <p style={{ color: 'crimson' }}>Could not load vendors.</p>}
        {vendors.data?.length === 0 && <p>No vendors yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {vendors.data?.map((vendor) => (
            <li
              key={vendor.id}
              style={{
                border: '1px solid #ccc',
                borderRadius: 6,
                padding: 12,
                opacity: vendor.active ? 1 : 0.55,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>
                  {vendor.name} {vendor.active ? '' : '(inactive)'}
                </strong>
                <span>
                  {vendor.currency} · {vendor.paymentTerms}
                </span>
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>{vendor.contactEmail}</div>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => toggleActive.mutate(vendor)}
                  disabled={toggleActive.isPending}
                >
                  {vendor.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
