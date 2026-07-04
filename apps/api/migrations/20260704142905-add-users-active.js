'use strict';

// ADR-0007 tier 1: users are soft-deleted (deactivated), never hard-deleted.
// Mirrors vendors.active — a deactivated user cannot authenticate and is
// excluded from approver pools, but every historical record still resolves the
// real actor. Reversible; the row is never physically removed.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'active');
  },
};
