'use strict';

const bcrypt = require('bcryptjs');

// Demo org from runbook §1. All demo logins share the password below —
// local/demo use only, never reuse in a deployed environment.
const DEMO_PASSWORD = 'Demo123!';

const USERS = [
  {
    id: '019787c8-0000-4000-8000-000000000009',
    email: 'findir@demo',
    fullName: 'Farah Findirector',
    role: 'approver',
    managerId: null,
    department: 'Finance',
    jobTitle: 'Finance Director',
  },
  {
    id: '019787c8-0000-4000-8000-00000000000a',
    email: 'ceo@demo',
    fullName: 'Casey Executive',
    role: 'approver',
    managerId: null,
    department: null,
    jobTitle: 'CEO',
  },
  {
    id: '019787c8-0000-4000-8000-00000000000b',
    email: 'ciso@demo',
    fullName: 'Sami Secureson',
    role: 'approver',
    managerId: null,
    department: 'IT',
    jobTitle: 'CISO',
  },
  {
    id: '019787c8-0000-4000-8000-000000000001',
    email: 'requester@demo',
    fullName: 'Riley Requester',
    role: 'requester',
    managerId: '019787c8-0000-4000-8000-000000000002',
    department: 'IT',
  },
  {
    id: '019787c8-0000-4000-8000-000000000008',
    email: 'requester2@demo',
    fullName: 'Robin Requester',
    role: 'requester',
    managerId: '019787c8-0000-4000-8000-000000000002',
    department: 'IT',
  },
  {
    id: '019787c8-0000-4000-8000-000000000002',
    email: 'lead@demo',
    fullName: 'Lee Lead',
    role: 'approver',
    managerId: '019787c8-0000-4000-8000-000000000003',
    department: 'IT',
    jobTitle: 'Team Lead',
  },
  {
    id: '019787c8-0000-4000-8000-000000000003',
    email: 'head@demo',
    fullName: 'Harper Head',
    role: 'approver',
    managerId: null,
    department: 'IT',
    jobTitle: 'Department Head',
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
    // Idempotent via upsert — audit rows reference users, so deleting and
    // re-inserting is no longer possible. Managers in a second pass to satisfy
    // the self-referencing FK.
    for (const u of USERS) {
      await queryInterface.sequelize.query(
        `INSERT INTO users (id, email, full_name, password_hash, role, manager_id, department, job_title, created_at, updated_at)
         VALUES (:id, :email, :fullName, :passwordHash, :role, NULL, :department, :jobTitle, now(), now())
         ON CONFLICT (id) DO UPDATE
         SET email = :email, full_name = :fullName, password_hash = :passwordHash, role = :role,
             department = :department, job_title = :jobTitle`,
        {
          replacements: {
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            passwordHash,
            role: u.role,
            department: u.department ?? null,
            jobTitle: u.jobTitle ?? null,
          },
        },
      );
    }
    for (const u of USERS.filter((x) => x.managerId)) {
      await queryInterface.bulkUpdate('users', { manager_id: u.managerId }, { id: u.id });
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: USERS.map((u) => u.email) });
  },
};
