import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AuditListSchema,
  RequisitionListSchema,
  UserAdminListSchema,
  UserRoleSchema,
} from '@trimatch/shared';
import { useState } from 'react';
import { AppShell } from '../../components/AppShell';
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Loading,
  Pagination,
  StatusBadge,
} from '../../components/ui';
import { ApiError, apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate, formatDateTime, money } from '../../lib/format';
import { Outlet } from 'react-router-dom';

const ADMIN_NAV = [
  { to: '/admin/requisitions', label: 'Requisitions' },
  { to: '/admin/purchase-orders', label: 'Purchase orders' },
  { to: '/admin/vendors', label: 'Vendors' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/audit', label: 'Audit' },
];

const REQ_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'converted',
  'cancelled',
];
const AUDIT_ENTITIES = [
  'requisition',
  'purchase_order',
  'grn',
  'invoice',
  'match_record',
  'vendor',
  'user',
];

export function RequisitionsTab() {
  const { token } = useAuth();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['admin-requisitions', status, page],
    queryFn: () =>
      apiFetchPaged(
        `/api/v1/requisitions/all?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`,
        { token, schema: RequisitionListSchema },
      ),
  });
  return (
    <section>
      <Field label="Status">
        <select
          aria-label="Filter requisitions by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">all</option>
          {REQ_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      {list.isPending && <Loading what="requisitions" />}
      {list.data?.items.length === 0 && <EmptyState title="No requisitions match." />}
      <ul className="card-list" style={undefined}>
        {list.data?.items.map((req) => (
          <li key={req.id} className="card">
            <div className="card-row">
              <strong>{req.justification}</strong>
              <span>
                <StatusBadge status={req.status} /> {money(req.totalMinor, req.currency)}
              </span>
            </div>
            <div className="card-meta">
              from {req.requesterName ?? req.requesterId} · needed by {formatDate(req.neededBy)} ·{' '}
              {req.lines.length} line(s)
            </div>
          </li>
        ))}
      </ul>
      <Pagination meta={list.data?.meta} onPage={setPage} />
    </section>
  );
}

export function UsersTab() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [edits, setEdits] = useState<Record<string, { role?: string; managerId?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/users?page=${page}&pageSize=20`, {
        token,
        schema: UserAdminListSchema,
      }),
  });
  // manager options need the whole org, not just the current page
  const everyone = useQuery({
    queryKey: ['admin-users', 'options'],
    queryFn: () => apiFetch('/api/v1/users?pageSize=100', { token, schema: UserAdminListSchema }),
  });

  const save = useMutation({
    mutationFn: ({ id, change }: { id: string; change: { role?: string; managerId?: string } }) =>
      apiFetch(`/api/v1/users/${id}`, { method: 'PATCH', token, body: change }),
    onSuccess: () => {
      setError(null);
      setMessage('Saved — the change is in the audit trail');
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => {
      setMessage(null);
      setError(err instanceof ApiError ? err.message : 'Save failed');
    },
  });

  return (
    <section>
      {error && <Alert kind="error">{error}</Alert>}
      {message && <Alert kind="success">{message}</Alert>}
      {users.isPending && <Loading what="users" />}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Role</th>
              <th>Manager</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((u) => {
              const edit = edits[u.id] ?? {};
              const dirty = edit.role !== undefined || edit.managerId !== undefined;
              return (
                <tr key={u.id}>
                  <td>
                    {u.fullName}
                    {u.jobTitle ? <span className="card-meta"> · {u.jobTitle}</span> : null}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.department ?? '—'}</td>
                  <td>
                    <select
                      aria-label={`Role for ${u.fullName}`}
                      value={edit.role ?? u.role}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [u.id]: { ...prev[u.id], role: e.target.value },
                        }))
                      }
                    >
                      {UserRoleSchema.options.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Manager for ${u.fullName}`}
                      value={edit.managerId ?? u.managerId ?? ''}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [u.id]: { ...prev[u.id], managerId: e.target.value },
                        }))
                      }
                    >
                      <option value="">— none —</option>
                      {everyone.data
                        ?.filter((candidate) => candidate.id !== u.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.fullName}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    <Button
                      small
                      variant="primary"
                      disabled={!dirty || save.isPending}
                      onClick={() =>
                        save.mutate({
                          id: u.id,
                          change: {
                            ...(edit.role !== undefined ? { role: edit.role } : {}),
                            ...(edit.managerId !== undefined
                              ? { managerId: edit.managerId === '' ? null : edit.managerId }
                              : {}),
                          } as { role?: string; managerId?: string },
                        })
                      }
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination meta={users.data?.meta} onPage={setPage} />
    </section>
  );
}

export function AuditTab() {
  const { token } = useAuth();
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const filters = `${entityType ? `&entityType=${entityType}` : ''}${
    entityId ? `&entityId=${entityId}` : ''
  }`;
  const trail = useQuery({
    queryKey: ['admin-audit', entityType, entityId, page],
    queryFn: () =>
      apiFetchPaged(`/api/v1/audit?page=${page}&pageSize=20${filters}`, {
        token,
        schema: AuditListSchema,
      }),
  });
  return (
    <section>
      <div className="form-row">
        <Field label="Entity type">
          <select
            aria-label="Filter audit by entity type"
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">all</option>
            {AUDIT_ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Entity id">
          <input
            aria-label="Filter audit by entity id"
            placeholder="uuid"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value);
              setPage(1);
            }}
            style={{ width: 320 }}
          />
        </Field>
      </div>
      {trail.isPending && <Loading what="audit trail" />}
      {trail.data?.items.length === 0 && <EmptyState title="No audit rows match." />}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Transition</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {trail.data?.items.map((entry) => (
              <tr key={entry.id}>
                <td>{formatDateTime(entry.createdAt)}</td>
                <td>{entry.actorName}</td>
                <td>
                  <span className="badge badge-neutral">{entry.action}</span>
                  <div className="card-meta">
                    {entry.entityType} {entry.entityId.slice(0, 8)}…
                  </div>
                </td>
                <td>
                  {entry.fromState || entry.toState
                    ? `${entry.fromState ?? '∅'} → ${entry.toState ?? '∅'}`
                    : '—'}
                </td>
                <td>{entry.comment ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination meta={trail.data?.meta} onPage={setPage} />
    </section>
  );
}

// The admin area is a nested-route layout: a sub-nav of deep-linkable sections
// over an <Outlet/>; the section components are routed in App.tsx.
export function AdminLayout() {
  return (
    <AppShell
      title="Admin dashboard"
      subtitle="Everything, permission-checked server-side"
      nav={ADMIN_NAV}
    >
      <Outlet />
    </AppShell>
  );
}
