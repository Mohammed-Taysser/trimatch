'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      recipient_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(32), allowNull: false },
      // Optional back-reference to the entity that triggered the notification;
      // not a hard FK because it can point at any of several tables.
      entity_type: { type: Sequelize.STRING(32), allowNull: true },
      entity_id: { type: Sequelize.UUID, allowNull: true },
      message: { type: Sequelize.TEXT, allowNull: false },
      read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
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
    // Serves the per-user feed (recipient_id, newest first) and the unread
    // filter (recipient_id + read) from one composite index.
    await queryInterface.addIndex('notifications', ['recipient_id', 'read', 'created_at'], {
      name: 'notifications_recipient_read_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
