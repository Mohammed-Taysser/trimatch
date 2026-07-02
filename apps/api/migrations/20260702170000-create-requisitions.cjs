'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('requisitions', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      requester_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'draft' },
      justification: { type: Sequelize.TEXT, allowNull: false },
      needed_by: { type: Sequelize.DATEONLY, allowNull: false },
      currency: { type: Sequelize.CHAR(3), allowNull: false },
      total_minor: { type: Sequelize.BIGINT, allowNull: false },
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
    await queryInterface.addIndex('requisitions', ['requester_id']);

    await queryInterface.createTable('requisition_lines', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      requisition_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'requisitions', key: 'id' },
        onDelete: 'CASCADE',
      },
      line_no: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false },
      category: { type: Sequelize.STRING(100), allowNull: false },
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
    await queryInterface.addIndex('requisition_lines', ['requisition_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('requisition_lines');
    await queryInterface.dropTable('requisitions');
  },
};
