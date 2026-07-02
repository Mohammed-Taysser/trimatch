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
]);
