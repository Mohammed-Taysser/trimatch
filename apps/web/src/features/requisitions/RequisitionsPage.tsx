import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Requisition,
  RequisitionCreate,
  RequisitionListSchema,
  RequisitionSchema,
} from '@trimatch/shared';
import { FormEvent, useState } from 'react';
import { AppShell } from '../../components/AppShell';
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
import { formatDate, formatDateTime, money } from '../../lib/format';

interface LineDraft {
  description: string;
  category: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_LINE: LineDraft = { description: '', category: '', quantity: '1', unitPrice: '' };

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
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [lines, setLines] = useState<LineDraft[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['requisitions', page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/requisitions?page=${page}&pageSize=20`, {
        token,
        schema: RequisitionListSchema,
      }),
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
    <AppShell title="My requisitions">
      <section>
        <h2>{editingId ? 'Edit draft' : 'New draft'}</h2>
        <Card>
          <form onSubmit={onSubmit} className="form-grid">
            <Field label="Justification">
              <input
                aria-label="Justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                required
              />
            </Field>
            <div className="form-row">
              <Field label="Needed by">
                <input
                  type="date"
                  aria-label="Needed by"
                  value={neededBy}
                  onChange={(e) => setNeededBy(e.target.value)}
                  required
                />
              </Field>
              <Field label="Currency">
                <input
                  aria-label="Currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </Field>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="form-row">
                <input
                  aria-label="Description"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                  required
                />
                <input
                  aria-label="Category"
                  placeholder="Category"
                  value={line.category}
                  onChange={(e) => setLine(i, { category: e.target.value })}
                  required
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="Qty"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })}
                  required
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  aria-label="Unit price"
                  placeholder="Unit price"
                  value={line.unitPrice}
                  onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  required
                />
                <Button
                  small
                  variant="danger"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={lines.length === 1}
                >
                  ✕
                </Button>
              </div>
            ))}
            <div className="card-actions">
              <Button onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}>
                + Add line
              </Button>
              <Button type="submit" variant="primary" disabled={save.isPending}>
                {editingId ? 'Save draft' : 'Create draft'}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
            {error && <Alert kind="error">{error}</Alert>}
          </form>
        </Card>
      </section>

      <section>
        <h2>Drafts</h2>
        {list.isPending && <Loading what="requisitions" />}
        {list.isError && <Alert kind="error">Could not load requisitions.</Alert>}
        {list.data?.items.length === 0 && (
          <EmptyState
            title="No requisitions yet"
            hint="Create your first draft with the form above."
          />
        )}
        <ul className="card-list">
          {list.data?.items.map((req) => (
            <li key={req.id} className="card">
              <div className="card-row">
                <strong>{req.justification}</strong>
                <span>
                  <StatusBadge status={req.status} /> {money(req.totalMinor, req.currency)}
                </span>
              </div>
              <div className="card-meta">
                needed by {formatDate(req.neededBy)} · {req.lines.length} line(s)
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
                <ol className="card-meta">
                  {req.steps.map((step) => (
                    <li key={step.id}>
                      round {step.round} · {step.approverName} —{' '}
                      <StatusBadge status={step.status} />
                      {step.decidedAt ? ` (${formatDateTime(step.decidedAt)})` : null}
                    </li>
                  ))}
                </ol>
              )}
              {req.po && (
                <p className="card-meta">
                  📦 Purchase order {req.po.poNumber ?? '(pending number)'} —{' '}
                  <StatusBadge status={req.po.status} />
                </p>
              )}
              {req.steps
                .filter((step) => step.status === 'rejected' && step.reason)
                .map((step) => (
                  <Alert key={step.id} kind="error">
                    Rejected by {step.approverName}: “{step.reason}”
                  </Alert>
                ))}
              {req.status === 'rejected' && (
                <div className="card-actions">
                  <Button
                    small
                    variant="primary"
                    onClick={() => revise.mutate(req.id)}
                    disabled={revise.isPending}
                  >
                    Revise & edit
                  </Button>
                </div>
              )}
              {req.status === 'draft' && (
                <div className="card-actions">
                  <Button
                    small
                    variant="primary"
                    onClick={() => submit.mutate(req.id)}
                    disabled={submit.isPending}
                  >
                    Submit for approval
                  </Button>
                  <Button small onClick={() => startEdit(req)}>
                    Edit
                  </Button>
                  <Button
                    small
                    variant="danger"
                    onClick={() => remove.mutate(req.id)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Pagination meta={list.data?.meta} onPage={setPage} />
      </section>
    </AppShell>
  );
}
