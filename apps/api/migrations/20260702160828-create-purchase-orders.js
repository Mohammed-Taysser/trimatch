'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('purchase_orders', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      // Claimed on issue (FR-203, gapless per year) — null while draft.
      po_number: { type: Sequelize.STRING(20), allowNull: true, unique: true },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'draft' },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendors', key: 'id' },
      },
      requisition_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'requisitions', key: 'id' },
      },
      currency: { type: Sequelize.CHAR(3), allowNull: false },
      total_minor: { type: Sequelize.BIGINT, allowNull: false },
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
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
    await queryInterface.addIndex('purchase_orders', ['vendor_id']);
    await queryInterface.addIndex('purchase_orders', ['requisition_id']);

    await queryInterface.createTable('po_lines', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'purchase_orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      line_no: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false },
      category: { type: Sequelize.STRING(100), allowNull: false },
      vendor_sku: { type: Sequelize.STRING(100), allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      unit_price_minor: { type: Sequelize.BIGINT, allowNull: false },
      line_total_minor: { type: Sequelize.BIGINT, allowNull: false },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
    await queryInterface.addIndex('po_lines', ['po_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('po_lines');
    await queryInterface.dropTable('purchase_orders');
  },
};
