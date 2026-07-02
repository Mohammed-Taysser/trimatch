import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DelegationListSchema, DelegationSchema, InboxSchema } from '@trimatch/shared';
import { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { Alert, Button, EmptyState, Field, Loading, Pagination } from '../../components/ui';
import { ApiError, apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, money } from '../../lib/format';

export function ApprovalsInboxPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateFrom, setDelegateFrom] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ['approvals', 'inbox', page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/approvals/inbox?page=${page}&pageSize=20`, {
        token,
        schema: InboxSchema,
      }),
    refetchInterval: 15000,
  });

  const delegations = useQuery({
    queryKey: ['delegations'],
    queryFn: () =>
      apiFetch('/api/v1/delegations?pageSize=100', { token, schema: DelegationListSchema }),
  });

  const delegate = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/delegations', {
        method: 'POST',
        token,
        schema: DelegationSchema,
        body: { delegateEmail, startsOn: delegateFrom, endsOn: delegateTo },
      }),
    onSuccess: () => {
      setError(null);
      setDelegateEmail('');
      void queryClient.invalidateQueries({ queryKey: ['delegations'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Delegation failed'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/delegations/${id}`, { method: 'DELETE', token }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['delegations'] }),
  });

  const decide = useMutation({
    mutationFn: ({ stepId, action, reason }: { stepId: string; action: string; reason?: string }) =>
      apiFetch(`/api/v1/approvals/steps/${stepId}/${action}`, {
        method: 'POST',
        token,
        body: action === 'reject' ? { reason } : {},
      }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'inbox'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Action failed'),
  });

  return (
    <AppShell title="Approvals inbox">
      {error && <Alert kind="error">{error}</Alert>}

      <details className="card">
        <summary>Delegate my approvals</summary>
        <div className="form-row">
          <Field label="Delegate email">
            <input
              placeholder="Delegate email"
              aria-label="Delegate email"
              value={delegateEmail}
              onChange={(e) => setDelegateEmail(e.target.value)}
            />
          </Field>
          <Field label="Starts on">
            <input
              type="date"
              aria-label="Delegation start"
              value={delegateFrom}
              onChange={(e) => setDelegateFrom(e.target.value)}
            />
          </Field>
          <Field label="Ends on">
            <input
              type="date"
              aria-label="Delegation end"
              value={delegateTo}
              onChange={(e) => setDelegateTo(e.target.value)}
            />
          </Field>
          <Button onClick={() => delegate.mutate()} disabled={delegate.isPending}>
            Delegate
          </Button>
        </div>
        {delegations.data?.map((d) => (
          <p key={d.id} className="card-meta">
            {d.delegateName} ({formatDate(d.startsOn)} – {formatDate(d.endsOn)}){' '}
            <Button small variant="danger" onClick={() => revoke.mutate(d.id)}>
              Revoke
            </Button>
          </p>
        ))}
      </details>

      {inbox.isPending && <Loading />}
      {inbox.isError && <Alert kind="error">Could not load the inbox.</Alert>}
      {inbox.data?.items.length === 0 && (
        <EmptyState title="Inbox zero" hint="Nothing waiting for your approval." />
      )}

      <ul className="card-list">
        {inbox.data?.items.map((item) => (
          <li key={item.stepId} className="card">
            <div className="card-row">
              <strong>{item.requisition.justification}</strong>
              <span>{money(item.requisition.totalMinor, item.requisition.currency)}</span>
            </div>
            <div className="card-meta">
              from {item.requisition.requesterName} · needed by{' '}
              {formatDate(item.requisition.neededBy)} · round {item.round}, step {item.stepNo}
            </div>
            <div className="card-actions">
              <Button
                variant="primary"
                small
                onClick={() => decide.mutate({ stepId: item.stepId, action: 'approve' })}
                disabled={decide.isPending}
              >
                Approve
              </Button>
              <input
                placeholder="Reason (required to reject)"
                aria-label="Reason (required to reject)"
                value={reasons[item.stepId] ?? ''}
                onChange={(e) => setReasons((prev) => ({ ...prev, [item.stepId]: e.target.value }))}
              />
              <Button
                variant="danger"
                small
                onClick={() =>
                  decide.mutate({
                    stepId: item.stepId,
                    action: 'reject',
                    reason: reasons[item.stepId],
                  })
                }
                disabled={decide.isPending}
              >
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Pagination meta={inbox.data?.meta} onPage={setPage} />
    </AppShell>
  );
}
