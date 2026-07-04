'use strict';

// Optional TOTP two-factor auth (ClickUp 869dzycut). A user holds one TOTP secret
// (set at enrolment, activated once a code is confirmed) plus a set of single-use
// recovery codes stored only as bcrypt hashes.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'totp_secret', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'totp_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.createTable('two_factor_recovery_codes', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      // Personal, derived data (ADR-0007 tier 3) — CASCADE mirrors password OTPs.
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      // bcrypt hash of a recovery code — the code itself is never stored.
      code_hash: { type: Sequelize.STRING(72), allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
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
    // Verification scans a user's still-unused recovery codes.
    await queryInterface.addIndex('two_factor_recovery_codes', ['user_id', 'used_at'], {
      name: 'two_factor_recovery_codes_user_active_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('two_factor_recovery_codes');
    await queryInterface.removeColumn('users', 'totp_enabled');
    await queryInterface.removeColumn('users', 'totp_secret');
  },
};
