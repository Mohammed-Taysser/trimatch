'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('password_reset_otps', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // bcrypt hash of the delivered OTP — the code itself is never stored.
      code_hash: { type: Sequelize.STRING(72), allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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
    // Reset verification looks up a user's most recent still-valid OTP.
    await queryInterface.addIndex('password_reset_otps', ['user_id', 'used_at', 'expires_at'], {
      name: 'password_reset_otps_user_active_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('password_reset_otps');
  },
};
