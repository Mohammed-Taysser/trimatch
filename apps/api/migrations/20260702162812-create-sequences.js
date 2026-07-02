'use strict';

// I-6: document numbers are gapless per year per type — claimed inside the
// issuing transaction against this table (architecture §3, common/sequences).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sequences', {
      doc_type: { type: Sequelize.STRING(16), allowNull: false, primaryKey: true },
      year: { type: Sequelize.INTEGER, allowNull: false, primaryKey: true },
      last_no: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sequences');
  },
};
