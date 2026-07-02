import { PoStatus } from '@trimatch/shared';
import { StateMachine } from '../common/state-machine';

// FR-204 — the PO lifecycle, verbatim from the PRD.
export const poLifecycle = new StateMachine<PoStatus>('purchase order', [
  { from: 'draft', to: 'issued' }, // number claimed on issue (FR-203)
  { from: 'draft', to: 'cancelled' },
  { from: 'issued', to: 'partially_received' },
  { from: 'issued', to: 'received' },
  { from: 'issued', to: 'cancelled' }, // only while nothing received (guard in service)
  { from: 'partially_received', to: 'received' },
  { from: 'received', to: 'closed' },
  // FR-604: a total-increasing amendment needs sign-off before more goods or
  // invoices can flow; approval returns the PO to where the receipts say it is.
  { from: 'issued', to: 'pending_reapproval' },
  { from: 'partially_received', to: 'pending_reapproval' },
  { from: 'pending_reapproval', to: 'issued' },
  { from: 'pending_reapproval', to: 'partially_received' },
]);
