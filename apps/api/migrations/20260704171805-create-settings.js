'use strict';

// Settings framework (ClickUp 869e01dmv). A generic key/value store for overrides
// of code-defined setting definitions, at two scopes: 'company' (org-wide, one
// row per key, scope_id = '') and 'user' (scope_id = user id). Only overrides are
// stored — defaults live in the code registry, so an unset key is not a row.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      scope: { type: Sequelize.STRING(16), allowNull: false },
      // '' for company scope; the user id for user scope. Kept non-null so the
      // uniqueness constraint below treats company rows as one-per-key.
      scope_id: { type: Sequelize.STRING(64), allowNull: false, defaultValue: '' },
      key: { type: Sequelize.STRING(100), allowNull: false },
      value: { type: Sequelize.JSONB, allowNull: false },
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
    await queryInterface.addIndex('settings', ['scope', 'scope_id', 'key'], {
      name: 'settings_scope_key_uidx',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  },
};
