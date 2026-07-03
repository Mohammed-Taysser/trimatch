import { PageMeta } from '@trimatch/shared';
import { ButtonHTMLAttributes, ReactNode, useState } from 'react';

// The shared building blocks of every screen (story 869dz698b). Components
// carry the semantics; all visual decisions live in styles/global.css tokens.

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

export function Button({
  variant = 'default',
  small = false,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  const variantClass = variant === 'default' ? '' : ` btn-${variant}`;
  return (
    <button
      type="button"
      className={`btn${variantClass}${small ? ' btn-sm' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  );
}

// One color language for every document status in the system.
const STATUS_TONE: Record<string, string> = {
  // requisitions
  draft: 'neutral',
  pending_approval: 'warn',
  approved: 'ok',
  rejected: 'danger',
  converted: 'brand',
  // purchase orders
  issued: 'brand',
  pending_reapproval: 'warn',
  partially_received: 'info',
  received: 'ok',
  closed: 'neutral',
  cancelled: 'danger',
  // invoices
  entered: 'neutral',
  matched: 'ok',
  exception: 'danger',
  variance_accepted: 'warn',
  awaiting_credit_note: 'warn',
  payable: 'ok',
  // approval steps
  pending: 'warn',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  return <span className={`badge badge-${tone}`}>{status.replaceAll('_', ' ')}</span>;
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <div
      className="card"
      style={tone === 'danger' ? { borderColor: 'var(--color-danger)' } : undefined}
    >
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`alert alert-${kind}`}>
      {children}
    </p>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="loading">{what}…</p>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function Pagination({
  meta,
  onPage,
}: {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
}) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button small disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        ← Previous
      </Button>
      <span>
        Page {meta.page} of {meta.totalPages} ({meta.total} total)
      </span>
      <Button small disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Next →
      </Button>
    </nav>
  );
}

// A destructive action that asks for inline confirmation before firing — no
// modal, no dependency; keyboard-reachable.
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Confirm',
  variant,
  small,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  onConfirm: () => void;
  confirmLabel?: string;
  variant?: ButtonVariant;
  small?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="confirm-inline">
        <span className="card-meta">Sure?</span>
        <Button
          small
          variant="danger"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button small onClick={() => setArmed(false)}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <Button variant={variant} small={small} {...rest} onClick={() => setArmed(true)}>
      {children}
    </Button>
  );
}

// Shimmer placeholder for a list while it loads.
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="card-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="card">
          <div className="skeleton-line" />
          <div className="skeleton-line skeleton-line-short" />
        </li>
      ))}
    </ul>
  );
}
