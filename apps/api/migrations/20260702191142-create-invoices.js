'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      // The vendor's own invoice number — unique per vendor (TC-401).
      invoice_number: { type: Sequelize.STRING(50), allowNull: false },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendors', key: 'id' },
      },
      po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'purchase_orders', key: 'id' },
      },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'entered' },
      invoice_date: { type: Sequelize.DATEONLY, allowNull: false },
      due_date: { type: Sequelize.DATEONLY, allowNull: true },
      currency: { type: Sequelize.CHAR(3), allowNull: false },
      subtotal_minor: { type: Sequelize.BIGINT, allowNull: false },
      tax_minor: { type: Sequelize.BIGINT, allowNull: false },
      total_minor: { type: Sequelize.BIGINT, allowNull: false },
      entered_by: {
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
    await queryInterface.addConstraint('invoices', {
      fields: ['vendor_id', 'invoice_number'],
      type: 'unique',
      name: 'invoices_vendor_number_unique',
    });
    await queryInterface.addIndex('invoices', ['po_id']);

    await queryInterface.createTable('invoice_lines', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
        onDelete: 'CASCADE',
      },
      po_line_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'po_lines', key: 'id' },
      },
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
    await queryInterface.addIndex('invoice_lines', ['invoice_id']);
    await queryInterface.addIndex('invoice_lines', ['po_line_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoice_lines');
    await queryInterface.dropTable('invoices');
  },
};
