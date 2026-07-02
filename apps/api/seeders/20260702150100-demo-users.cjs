'use strict';

const bcrypt = require('bcryptjs');

// Demo org from runbook §1. All demo logins share the password below —
// local/demo use only, never reuse in a deployed environment.
const DEMO_PASSWORD = 'Demo123!';

const USERS = [
  {
    id: '019787c8-0000-4000-8000-000000000001',
    email: 'requester@demo',
    fullName: 'Riley Requester',
    role: 'requester',
    managerId: '019787c8-0000-4000-8000-000000000002',
  },
  {
    id: '019787c8-0000-4000-8000-000000000008',
    email: 'requester2@demo',
    fullName: 'Robin Requester',
    role: 'requester',
    managerId: '019787c8-0000-4000-8000-000000000002',
  },
  {
    id: '019787c8-0000-4000-8000-000000000002',
    email: 'lead@demo',
    fullName: 'Lee Lead',
    role: 'approver',
    managerId: '019787c8-0000-4000-8000-000000000003',
  },
  {
    id: '019787c8-0000-4000-8000-000000000003',
    email: 'head@demo',
    fullName: 'Harper Head',
    role: 'approver',
    managerId: null,
  },
  {
    id: '019787c8-0000-4000-8000-000000000004',
    email: 'purchasing@demo',
    fullName: 'Parker Purchasing',
    role: 'purchasing',
    managerId: null,
  },
  {
    id: '019787c8-0000-4000-8000-000000000005',
    email: 'warehouse@demo',
    fullName: 'Winter Warehouse',
    role: 'warehouse',
    managerId: null,
  },
  {
    id: '019787c8-0000-4000-8000-000000000006',
    email: 'ap@demo',
    fullName: 'Avery Payable',
    role: 'ap',
    managerId: null,
  },
  {
    id: '019787c8-0000-4000-8000-000000000007',
    email: 'admin@demo',
    fullName: 'Adrian Admin',
    role: 'admin',
    managerId: null,
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
    const now = new Date();
    // Idempotent: replace the demo rows wholesale (fixed ids), managers second
    // pass to satisfy the self-referencing FK.
    await queryInterface.bulkDelete('users', { email: USERS.map((u) => u.email) });
    await queryInterface.bulkInsert(
      'users',
      USERS.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        password_hash: passwordHash,
        role: u.role,
        manager_id: null,
        created_at: now,
        updated_at: now,
      })),
    );
    for (const u of USERS.filter((x) => x.managerId)) {
      await queryInterface.bulkUpdate('users', { manager_id: u.managerId }, { id: u.id });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: USERS.map((u) => u.email) });
  },
};
