'use strict';

// Demo org flow data (runbook §1): every MVP state is visible right after
// `pnpm seed`, so the full raise → approve → PO → receive loop is demoable
// with the seeded logins. Idempotent: fixed UUIDs, delete-then-insert.
// Document numbers use a reserved 9xxx band; sequences are bumped with
// GREATEST so real claims continue above it (I-6 holds across re-runs).

const YEAR = new Date().getUTCFullYear();

const U = {
  requester: '019787c8-0000-4000-8000-000000000001',
  lead: '019787c8-0000-4000-8000-000000000002',
  purchasing: '019787c8-0000-4000-8000-000000000004',
  warehouse: '019787c8-0000-4000-8000-000000000005',
};

const VENDORS = [
  {
    id: '019787c8-1111-4000-8000-000000000001',
    name: 'Acme Office Supplies (demo)',
    contact_email: 'sales@acme.demo',
    currency: 'USD',
    payment_terms: 'NET 30',
    active: true,
  },
  {
    id: '019787c8-1111-4000-8000-000000000002',
    name: 'Globex Industrial (demo)',
    contact_email: 'orders@globex.demo',
    currency: 'USD',
    payment_terms: 'NET 60',
    active: true,
  },
  {
    id: '019787c8-1111-4000-8000-000000000003',
    name: 'Dormant Traders (demo)',
    contact_email: 'gone@dormant.demo',
    currency: 'USD',
    payment_terms: 'NET 30',
    active: false,
  },
];

// requisitions: one per lifecycle state
const REQS = [
  {
    id: '019787c8-2222-4000-8000-000000000001',
    status: 'draft',
    justification: 'Standing desks for the design pod (demo draft)',
    total: 2400_00,
  },
  {
    id: '019787c8-2222-4000-8000-000000000002',
    status: 'pending_approval',
    justification: 'Monitors for onboarding batch (demo pending)',
    total: 1200_00,
  },
  {
    id: '019787c8-2222-4000-8000-000000000003',
    status: 'rejected',
    justification: 'Espresso machine for floor 3 (demo rejected)',
    total: 900_00,
  },
  {
    id: '019787c8-2222-4000-8000-000000000004',
    status: 'approved',
    justification: 'Laptops for new hires (demo approved)',
    total: 5200_00,
  },
  {
    id: '019787c8-2222-4000-8000-000000000005',
    status: 'converted',
    justification: 'Warehouse shelving units (demo converted)',
    total: 3000_00,
  },
];

const REQ_LINE = (i, reqId, desc, qty, price) => ({
  id: `019787c8-3333-4000-8000-00000000000${i}`,
  requisition_id: reqId,
  line_no: 1,
  description: desc,
  category: 'Office equipment',
  quantity: qty,
  unit_price_minor: price,
  line_total_minor: qty * price,
});

const PO_ID = '019787c8-4444-4000-8000-000000000001';
const PO_LINE_ID = '019787c8-4444-4000-8000-000000000002';
const GRN_ID = '019787c8-5555-4000-8000-000000000001';
const PO_NUMBER = `PO-${YEAR}-9001`;
const GRN_NUMBER = `GRN-${YEAR}-9001`;

const STEP = (i, reqId, status, reason, approver = U.lead) => ({
  id: `019787c8-6666-4000-8000-00000000000${i}`,
  requisition_id: reqId,
  round: 1,
  step_no: 1,
  approver_id: approver,
  status,
  reason,
  decided_at: status === 'pending' ? null : new Date(),
  created_at: new Date(),
  updated_at: new Date(),
});

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const q = queryInterface;

    // Idempotency via upsert on fixed ids — deletes are impossible once other
    // rows (invoices, append-only match records) reference the demo data.
    async function upsert(table, rows) {
      for (const row of rows) {
        const cols = Object.keys(row);
        const names = cols.map((c) => `"${c}"`).join(', ');
        const params = cols.map((c) => `:${c}`).join(', ');
        const updates = cols
          .filter((c) => c !== 'id' && c !== 'created_at')
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');
        await q.sequelize.query(
          `INSERT INTO ${table} (${names}) VALUES (${params})
           ON CONFLICT (id) DO UPDATE SET ${updates}`,
          { replacements: row },
        );
      }
    }

    await upsert(
      'vendors',
      VENDORS.map((v) => ({ ...v, created_at: now, updated_at: now })),
    );

    await upsert(
      'requisitions',
      REQS.map((r) => ({
        id: r.id,
        requester_id: U.requester,
        status: r.status,
        justification: r.justification,
        needed_by: `${YEAR}-12-15`,
        currency: 'USD',
        total_minor: r.total,
        created_at: now,
        updated_at: now,
      })),
    );
    await upsert(
      'requisition_lines',
      [
        REQ_LINE(1, REQS[0].id, 'Standing desk 160cm', 8, 300_00),
        REQ_LINE(2, REQS[1].id, '27" monitor', 8, 150_00),
        REQ_LINE(3, REQS[2].id, 'Espresso machine', 1, 900_00),
        REQ_LINE(4, REQS[3].id, 'Laptop 16GB', 4, 1300_00),
        REQ_LINE(5, REQS[4].id, 'Shelving unit 5-tier', 20, 150_00),
      ].map((l) => ({ ...l, created_at: now, updated_at: now })),
    );

    await upsert('approval_steps', [
      STEP(1, REQS[1].id, 'pending', null),
      STEP(2, REQS[2].id, 'rejected', 'Budget freeze — resubmit next quarter (demo)'),
      STEP(3, REQS[3].id, 'approved', null),
      STEP(4, REQS[4].id, 'approved', null),
    ]);

    await upsert('purchase_orders', [
      {
        id: PO_ID,
        po_number: PO_NUMBER,
        status: 'partially_received',
        vendor_id: VENDORS[1].id,
        requisition_id: REQS[4].id,
        currency: 'USD',
        total_minor: 3000_00,
        created_by: U.purchasing,
        created_at: now,
        updated_at: now,
      },
    ]);
    await upsert('po_lines', [
      {
        id: PO_LINE_ID,
        po_id: PO_ID,
        line_no: 1,
        description: 'Shelving unit 5-tier',
        category: 'Office equipment',
        vendor_sku: 'GLX-SHELF-5T',
        quantity: 20,
        unit_price_minor: 150_00,
        line_total_minor: 3000_00,
        created_at: now,
        updated_at: now,
      },
    ]);
    await upsert('grns', [
      {
        id: GRN_ID,
        grn_number: GRN_NUMBER,
        po_id: PO_ID,
        received_by: U.warehouse,
        note: 'First pallet of the demo delivery',
        created_at: now,
        updated_at: now,
      },
    ]);
    await upsert('grn_lines', [
      {
        id: '019787c8-5555-4000-8000-000000000002',
        grn_id: GRN_ID,
        po_line_id: PO_LINE_ID,
        quantity: 12,
        damaged_quantity: 1,
        created_at: now,
        updated_at: now,
      },
    ]);

    // reserve the demo number band without breaking gaplessness
    for (const docType of ['PO', 'GRN']) {
      await q.sequelize.query(
        `INSERT INTO sequences (doc_type, year, last_no) VALUES (:docType, :year, 9001)
         ON CONFLICT (doc_type, year) DO UPDATE
         SET last_no = GREATEST(sequences.last_no, 9001)`,
        { replacements: { docType, year: YEAR } },
      );
    }
  },

  async down(queryInterface) {
    const q = queryInterface;
    await q.bulkDelete('grn_lines', { grn_id: GRN_ID });
    await q.bulkDelete('grns', { id: GRN_ID });
    await q.bulkDelete('po_lines', { po_id: PO_ID });
    await q.bulkDelete('purchase_orders', { id: PO_ID });
    await q.bulkDelete('approval_steps', { requisition_id: REQS.map((r) => r.id) });
    await q.bulkDelete('requisition_lines', { requisition_id: REQS.map((r) => r.id) });
    await q.bulkDelete('requisitions', { id: REQS.map((r) => r.id) });
    await q.bulkDelete('vendors', { id: VENDORS.map((v) => v.id) });
  },
};
