'use strict';

// ADR-0002: matrix rules are versioned, immutable rows — every admin save
// creates a complete new version; in-flight chains stay untouched because
// they were snapshotted at submission (I-5).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('matrix_rules', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      version: { type: Sequelize.INTEGER, allowNull: false },
      rule_label: { type: Sequelize.STRING(10), allowNull: false },
      kind: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'base' },
      min_amount_minor: { type: Sequelize.BIGINT, allowNull: true },
      max_amount_minor: { type: Sequelize.BIGINT, allowNull: true },
      department: { type: Sequelize.STRING(100), allowNull: true },
      category: { type: Sequelize.STRING(100), allowNull: true },
      chain: { type: Sequelize.JSONB, allowNull: false },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
    await queryInterface.addIndex('matrix_rules', ['version']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('matrix_rules');
  },
};
