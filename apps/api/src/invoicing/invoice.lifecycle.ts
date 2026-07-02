import { InvoiceStatus } from '@trimatch/shared';
import { StateMachine } from '../common/state-machine';

// Domain doc §3 — the invoice lifecycle. matched auto-advances to payable
// (FR-403); exceptions resolve to payable (accepted variance) or rejected
// (FR-404, Epic 4 resolution story).
export const invoiceLifecycle = new StateMachine<InvoiceStatus>('invoice', [
  { from: 'entered', to: 'matched' },
  { from: 'entered', to: 'exception' },
  { from: 'matched', to: 'payable' },
  { from: 'exception', to: 'payable' },
  { from: 'exception', to: 'rejected' },
]);
