'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('approval_steps', {
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
      round: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      step_no: { type: Sequelize.INTEGER, allowNull: false },
      approver_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
      reason: { type: Sequelize.TEXT, allowNull: true },
      decided_at: { type: Sequelize.DATE, allowNull: true },
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
    await queryInterface.addIndex('approval_steps', ['requisition_id']);
    await queryInterface.addIndex('approval_steps', ['approver_id', 'status']);

    // Append-only (I-7): no updated_at on purpose; rows are never touched again.
    await queryInterface.createTable('audit_log', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      entity_type: { type: Sequelize.STRING(32), allowNull: false },
      entity_id: { type: Sequelize.UUID, allowNull: false },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      action: { type: Sequelize.STRING(64), allowNull: false },
      from_state: { type: Sequelize.STRING(32), allowNull: true },
      to_state: { type: Sequelize.STRING(32), allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
    await queryInterface.addIndex('audit_log', ['entity_type', 'entity_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_log');
    await queryInterface.dropTable('approval_steps');
  },
};
