import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Requisition,
  RequisitionCreate,
  RequisitionListSchema,
  RequisitionSchema,
} from '@trimatch/shared';
import { FormEvent, useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface LineDraft {
  description: string;
  category: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { description: '', category: '', quantity: '1', unitPrice: '' };

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function toPayload(
  justification: string,
  neededBy: string,
  currency: string,
  lines: LineDraft[],
): RequisitionCreate {
  return {
    justification,
    neededBy,
    currency,
    lines: lines.map((line) => ({
      description: line.description,
      category: line.category,
      quantity: Number(line.quantity),
      unitPriceMinor: Math.round(Number(line.unitPrice) * 100),
    })),
  };
}

export function RequisitionsPage() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => apiFetch('/api/v1/requisitions', { token, schema: RequisitionListSchema }),
  });

  const save = useMutation({
    mutationFn: (payload: RequisitionCreate) =>
      editingId
        ? apiFetch(`/api/v1/requisitions/${editingId}`, {
            method: 'PUT',
            body: payload,
            token,
            schema: RequisitionSchema,
          })
        : apiFetch('/api/v1/requisitions', {
            method: 'POST',
            body: payload,
            token,
            schema: RequisitionSchema,
          }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      resetForm();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Save failed'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/requisitions/${id}`, { method: 'DELETE', token }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['requisitions'] }),
  });

  const submit = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/requisitions/${id}/submit`, {
        method: 'POST',
        token,
        schema: RequisitionSchema,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['requisitions'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Submit failed'),
  });

  const revise = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/requisitions/${id}/revise`, {
        method: 'POST',
        token,
        schema: RequisitionSchema,
      }),
    onSuccess: (req) => {
      void queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      startEdit(req);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Revise failed'),
  });

  function resetForm() {
    setEditingId(null);
    setJustification('');
    setNeededBy('');
    setCurrency('USD');
    setLines([{ ...EMPTY_LINE }]);
    setError(null);
  }

  function startEdit(req: Requisition) {
    setEditingId(req.id);
    setJustification(req.justification);
    setNeededBy(req.neededBy);
    setCurrency(req.currency);
    setLines(
      req.lines.map((line) => ({
        description: line.description,
        category: line.category,
        quantity: String(line.quantity),
        unitPrice: (line.unitPriceMinor / 100).toFixed(2),
      })),
    );
  }

  function setLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate(toPayload(justification, neededBy, currency, lines));
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>My requisitions</h1>
        <span>
          {user?.fullName} ({user?.role}){' '}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>

      <section>
        <h2>{editingId ? 'Edit draft' : 'New draft'}</h2>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
          <label>
            Justification
            <input
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label>
              Needed by
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                required
              />
            </label>
            <label>
              Currency
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                style={{ width: 60 }}
                required
              />
            </label>
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Description"
                value={line.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                style={{ flex: 2 }}
                required
              />
              <input
                placeholder="Category"
                value={line.category}
                onChange={(e) => setLine(i, { category: e.target.value })}
                style={{ flex: 1 }}
                required
              />
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                style={{ width: 70 }}
                required
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Unit price"
                value={line.unitPrice}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                style={{ width: 110 }}
                required
              />
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={lines.length === 1}
              >
                ✕
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
              + Add line
            </button>
            <button type="submit" disabled={save.isPending}>
              {editingId ? 'Save draft' : 'Create draft'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
        </form>
      </section>

      <section>
        <h2>Drafts</h2>
        {list.isPending && <p>Loading…</p>}
        {list.isError && <p style={{ color: 'crimson' }}>Could not load requisitions.</p>}
        {list.data?.length === 0 && <p>No requisitions yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {list.data?.map((req) => (
            <li key={req.id} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{req.justification}</strong>
                <span>
                  {req.status} · {money(req.totalMinor, req.currency)}
                </span>
              </div>
              <div style={{ color: '#555', fontSize: 14 }}>
                needed by {req.neededBy} · {req.lines.length} line(s)
                {req.status === 'pending_approval' &&
                  req.steps.some((step) => step.status === 'pending') && (
                    <>
                      {' · '}
                      <strong>
                        pending with{' '}
                        {req.steps.find((step) => step.status === 'pending')?.approverName}
                      </strong>
                    </>
                  )}
              </div>
              {req.steps.length > 0 && (
                <ol style={{ margin: '6px 0 0', paddingLeft: 18, color: '#555', fontSize: 13 }}>
                  {req.steps.map((step) => (
                    <li key={step.id}>
                      round {step.round} · {step.approverName} —{' '}
                      {step.status === 'pending' ? '⏳ pending' : null}
                      {step.status === 'approved' ? '✅ approved' : null}
                      {step.status === 'rejected' ? '❌ rejected' : null}
                      {step.decidedAt ? ` (${new Date(step.decidedAt).toLocaleString()})` : null}
                    </li>
                  ))}
                </ol>
              )}
              {req.po && (
                <p style={{ margin: '6px 0 0', color: '#1a6b2f' }}>
                  📦 Purchase order {req.po.poNumber ?? '(pending number)'} — {req.po.status}
                </p>
              )}
              {req.steps
                .filter((step) => step.status === 'rejected' && step.reason)
                .map((step) => (
                  <p key={step.id} style={{ color: 'crimson', margin: '6px 0 0' }}>
                    Rejected by {step.approverName}: “{step.reason}”
                  </p>
                ))}
              {req.status === 'rejected' && (
                <div style={{ marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => revise.mutate(req.id)}
                    disabled={revise.isPending}
                  >
                    Revise & edit
                  </button>
                </div>
              )}
              {req.status === 'draft' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => submit.mutate(req.id)}
                    disabled={submit.isPending}
                  >
                    Submit for approval
                  </button>
                  <button type="button" onClick={() => startEdit(req)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(req.id)}
                    disabled={remove.isPending}
                  >
                    Delete
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
