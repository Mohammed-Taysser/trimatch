'use strict';

// Default ruleset R1–R5 (PRD §5.1) as version 1 — amounts in minor units.
const ADMIN = '019787c8-0000-4000-8000-000000000007';
const RULES = [
  {
    id: '019787c8-7777-4000-8000-000000000001',
    rule_label: 'R1',
    kind: 'base',
    min_amount_minor: 0,
    max_amount_minor: 500_00,
    department: null,
    category: null,
    chain: ['Team Lead'],
  },
  {
    id: '019787c8-7777-4000-8000-000000000002',
    rule_label: 'R2',
    kind: 'base',
    min_amount_minor: 500_01,
    max_amount_minor: 5_000_00,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head'],
  },
  {
    id: '019787c8-7777-4000-8000-000000000003',
    rule_label: 'R3',
    kind: 'base',
    min_amount_minor: 5_000_01,
    max_amount_minor: 25_000_00,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head', 'Finance Director'],
  },
  {
    id: '019787c8-7777-4000-8000-000000000004',
    rule_label: 'R4',
    kind: 'base',
    min_amount_minor: 25_000_01,
    max_amount_minor: null,
    department: null,
    category: null,
    chain: ['Team Lead', 'Department Head', 'Finance Director', 'CEO'],
  },
  {
    id: '019787c8-7777-4000-8000-000000000005',
    rule_label: 'R5',
    kind: 'append',
    min_amount_minor: null,
    max_amount_minor: null,
    department: 'IT',
    category: 'Software licenses',
    chain: ['CISO'],
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkDelete('matrix_rules', { id: RULES.map((r) => r.id) });
    await queryInterface.bulkInsert(
      'matrix_rules',
      RULES.map((r) => ({
        ...r,
        chain: JSON.stringify(r.chain),
        version: 1,
        created_by: ADMIN,
        created_at: now,
      })),
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('matrix_rules', { id: RULES.map((r) => r.id) });
  },
};
