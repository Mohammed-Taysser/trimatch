'use strict';

// Session invalidation (ClickUp 869dzymvv). A monotonic per-user counter that is
// stamped into every JWT (`tv` claim) at login and checked on every authenticated
// request. Bumping it (on password change/reset or deactivation) instantly
// invalidates all previously-issued tokens without server-side session storage.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'token_version');
  },
};
