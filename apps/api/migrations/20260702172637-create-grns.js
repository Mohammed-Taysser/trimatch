'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('grns', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      grn_number: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'purchase_orders', key: 'id' },
      },
      received_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      note: { type: Sequelize.TEXT, allowNull: true },
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
    await queryInterface.addIndex('grns', ['po_id']);

    await queryInterface.createTable('grn_lines', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      grn_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'grns', key: 'id' },
        onDelete: 'CASCADE',
      },
      po_line_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'po_lines', key: 'id' },
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
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
    await queryInterface.addIndex('grn_lines', ['grn_id']);
    await queryInterface.addIndex('grn_lines', ['po_line_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('grn_lines');
    await queryInterface.dropTable('grns');
  },
};
