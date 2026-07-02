import { RequisitionStatus } from '@trimatch/shared';
import { StateMachine } from '../common/state-machine';

// Domain doc §3.1 — the requisition lifecycle, verbatim.
export const requisitionLifecycle = new StateMachine<RequisitionStatus>('requisition', [
  { from: 'draft', to: 'pending_approval' }, // submit (FR-103)
  { from: 'pending_approval', to: 'approved' }, // final step approved
  { from: 'pending_approval', to: 'rejected' }, // any step rejects (FR-104)
  { from: 'pending_approval', to: 'cancelled' }, // requester withdraws
  { from: 'rejected', to: 'draft' }, // revise & resubmit (FR-105)
  { from: 'approved', to: 'converted' }, // PO issued (FR-201)
]);
