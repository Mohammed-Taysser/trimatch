import { InvoiceStatus } from '@trimatch/shared';
import { StateMachine } from '../common/state-machine';

// Domain doc §3 — the invoice lifecycle. matched auto-advances to payable
// (FR-403); exceptions resolve to payable (accepted variance) or rejected
// (FR-404, Epic 4 resolution story).
export const invoiceLifecycle = new StateMachine<InvoiceStatus>('invoice', [
  { from: 'entered', to: 'matched' },
  { from: 'entered', to: 'exception' },
  { from: 'exception', to: 'variance_accepted' }, // FR-404, reason mandatory
  { from: 'exception', to: 'awaiting_credit_note' }, // FR-404, invoice held
  { from: 'exception', to: 'rejected' }, // FR-404, returned to vendor
  { from: 'awaiting_credit_note', to: 'matched' }, // credit note applied (Epic 6)
  { from: 'matched', to: 'payable' }, // hard gate FR-406
  { from: 'variance_accepted', to: 'payable' }, // hard gate FR-406
]);
