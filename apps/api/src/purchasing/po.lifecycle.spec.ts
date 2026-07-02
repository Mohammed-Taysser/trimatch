import { poLifecycle } from './po.lifecycle';

// Table-driven, mirroring FR-204.
describe('purchase order lifecycle state machine', () => {
  it.each`
    from                    | to                      | allowed
    ${'draft'}              | ${'issued'}             | ${true}
    ${'draft'}              | ${'cancelled'}          | ${true}
    ${'issued'}             | ${'partially_received'} | ${true}
    ${'issued'}             | ${'received'}           | ${true}
    ${'issued'}             | ${'cancelled'}          | ${true}
    ${'partially_received'} | ${'received'}           | ${true}
    ${'received'}           | ${'closed'}             | ${true}
    ${'draft'}              | ${'received'}           | ${false}
    ${'received'}           | ${'cancelled'}          | ${false}
    ${'closed'}             | ${'issued'}             | ${false}
    ${'cancelled'}          | ${'issued'}             | ${false}
  `('$from → $to allowed=$allowed', ({ from, to, allowed }) => {
    expect(poLifecycle.canTransition(from, to)).toBe(allowed);
  });
});
