import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Notification, NotificationListSchema } from '@trimatch/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { EmptyState, Skeleton } from '../../components/ui';
import { apiFetch, apiFetchPaged } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// Where a notification links to, resolved for the recipient's role — most
// entities have no detail page yet (Epic 21 follow-ups), so fall back to the
// list the recipient can actually reach. Null = no navigation target.
function hrefFor(
  entityType: Notification['entityType'],
  entityId: string | null,
  role: string,
): string | null {
  switch (entityType) {
    case 'purchase_order':
      return entityId && (role === 'purchasing' || role === 'admin')
        ? `/purchase-orders/${entityId}`
        : null;
    case 'requisition':
      if (role === 'approver') return '/approvals';
      if (role === 'admin') return '/admin/requisitions';
      return '/requisitions';
    case 'invoice':
      return '/invoices';
    case 'match':
      return '/invoices/exceptions';
    case 'goods_receipt':
      return '/warehouse';
    case 'delegation':
      return '/approvals';
    default:
      return null;
  }
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Live unread badge — pushed to via the socket below, plus react-query's
  // default refetch-on-focus as a backstop (no polling needed).
  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () =>
      apiFetchPaged('/api/v1/notifications?unread=true&pageSize=1', {
        token,
        schema: NotificationListSchema,
      }).then((page) => page.meta.total),
    enabled: Boolean(token),
  });

  // Real-time push: a Socket.IO connection authenticated with the JWT; the server
  // emits to this user's room, and we invalidate the queries so the badge/panel
  // update live. Same-origin (proxied to the api in dev, nginx in prod).
  useEffect(() => {
    if (!token) return;
    const socket = io({ auth: { token } });
    socket.on('notification', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  // The panel list is only fetched while open (and on focus while open).
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () =>
      apiFetchPaged('/api/v1/notifications?pageSize=20', {
        token,
        schema: NotificationListSchema,
      }).then((page) => page.items),
    enabled: Boolean(token) && open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH', token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Dismiss the panel on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!token || !user) return null;

  const count = unread.data ?? 0;

  const activate = (notification: Notification) => {
    if (!notification.read) markRead.mutate(notification.id); // mark-read on open
    const href = hrefFor(notification.entityType, notification.entityId, user.role);
    setOpen(false);
    if (href) navigate(href);
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className="notif-badge">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">Notifications</div>
          <div className="notif-panel-body">
            {list.isPending ? (
              <Skeleton rows={4} />
            ) : list.data && list.data.length > 0 ? (
              <ul className="notif-list">
                {list.data.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={notification.read ? 'notif-item' : 'notif-item is-unread'}
                      onClick={() => activate(notification)}
                    >
                      {!notification.read && <span className="notif-dot" aria-hidden="true" />}
                      <span className="notif-msg">{notification.message}</span>
                      <span className="notif-time">{timeAgo(notification.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No notifications" hint="You're all caught up." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
