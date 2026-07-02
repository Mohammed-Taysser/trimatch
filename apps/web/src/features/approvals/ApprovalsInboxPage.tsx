import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InboxSchema } from '@trimatch/shared';
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
  const [error, setError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => apiFetch('/api/v1/approvals/inbox', { token, schema: InboxSchema }),
    refetchInterval: 15000,
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
