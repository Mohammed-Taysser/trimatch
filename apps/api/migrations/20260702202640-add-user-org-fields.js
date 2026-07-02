'use strict';

// FR-501: matrix routing needs the requester's department; named chain titles
// (Finance Director, CEO, CISO) resolve via job_title.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'department', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'job_title', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'job_title');
    await queryInterface.removeColumn('users', 'department');
  },
};
