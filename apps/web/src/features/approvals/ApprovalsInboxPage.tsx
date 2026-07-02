import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DelegationListSchema, DelegationSchema, InboxSchema } from '@trimatch/shared';
import { useState } from 'react';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../lib/auth';

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

export function ApprovalsInboxPage() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateFrom, setDelegateFrom] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => apiFetch('/api/v1/approvals/inbox', { token, schema: InboxSchema }),
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
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Approval inbox</h1>
        <span>
          {user?.fullName} ({user?.role}){' '}
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </span>
      </header>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <details style={{ marginBottom: 12 }}>
        <summary>Delegate my approvals</summary>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            placeholder="Delegate email"
            aria-label="Delegate email"
            value={delegateEmail}
            onChange={(e) => setDelegateEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="date"
            aria-label="Delegation start"
            value={delegateFrom}
            onChange={(e) => setDelegateFrom(e.target.value)}
          />
          <input
            type="date"
            aria-label="Delegation end"
            value={delegateTo}
            onChange={(e) => setDelegateTo(e.target.value)}
          />
          <button type="button" onClick={() => delegate.mutate()} disabled={delegate.isPending}>
            Delegate
          </button>
        </div>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {delegations.data?.map((d) => (
            <li key={d.id} style={{ fontSize: 14, marginTop: 4 }}>
              → {d.delegateName} ({d.startsOn} – {d.endsOn}){' '}
              <button type="button" onClick={() => revoke.mutate(d.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </details>

      {inbox.isPending && <p>Loading…</p>}
      {inbox.isError && <p style={{ color: 'crimson' }}>Could not load the inbox.</p>}
      {inbox.data?.length === 0 && <p>Nothing waiting for your approval. 🎉</p>}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {inbox.data?.map((item) => (
          <li key={item.stepId} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{item.requisition.justification}</strong>
              <span>{money(item.requisition.totalMinor, item.requisition.currency)}</span>
            </div>
            <div style={{ color: '#555', fontSize: 14 }}>
              from {item.requisition.requesterName} · needed by {item.requisition.neededBy} · round{' '}
              {item.round}, step {item.stepNo}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => decide.mutate({ stepId: item.stepId, action: 'approve' })}
                disabled={decide.isPending}
              >
                Approve
              </button>
              <input
                placeholder="Reason (required to reject)"
                value={reasons[item.stepId] ?? ''}
                onChange={(e) => setReasons((prev) => ({ ...prev, [item.stepId]: e.target.value }))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
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
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
