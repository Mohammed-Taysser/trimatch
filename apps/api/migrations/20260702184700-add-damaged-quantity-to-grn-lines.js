'use strict';

// FR-304: damaged/rejected units are recorded separately and never count as
// received (open-qty math uses the good quantity only).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('grn_lines', 'damaged_quantity', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('grn_lines', 'damaged_quantity');
  },
};
