import { ConflictException } from '@nestjs/common';
import { requisitionLifecycle } from './requisition.lifecycle';

// Table-driven, mirroring domain doc §3.1 (TC-104/TC-107 transition rules).
describe('requisition lifecycle state machine', () => {
  it.each`
    from                  | to                    | allowed
    ${'draft'}            | ${'pending_approval'} | ${true}
    ${'pending_approval'} | ${'approved'}         | ${true}
    ${'pending_approval'} | ${'rejected'}         | ${true}
    ${'pending_approval'} | ${'cancelled'}        | ${true}
    ${'rejected'}         | ${'draft'}            | ${true}
    ${'approved'}         | ${'converted'}        | ${true}
    ${'approved'}         | ${'pending_approval'} | ${false}
    ${'draft'}            | ${'approved'}         | ${false}
    ${'converted'}        | ${'draft'}            | ${false}
    ${'cancelled'}        | ${'pending_approval'} | ${false}
  `('$from → $to allowed=$allowed', ({ from, to, allowed }) => {
    expect(requisitionLifecycle.canTransition(from, to)).toBe(allowed);
    if (!allowed) {
      expect(() => requisitionLifecycle.assertCanTransition(from, to)).toThrow(ConflictException);
    }
  });

  it('rejects with the machine-readable INVALID_TRANSITION code (TC-107)', () => {
    try {
      requisitionLifecycle.assertCanTransition('approved', 'pending_approval');
      fail('expected ConflictException');
    } catch (error) {
      const body = (error as ConflictException).getResponse() as { code: string };
      expect(body.code).toBe('INVALID_TRANSITION');
    }
  });
});
