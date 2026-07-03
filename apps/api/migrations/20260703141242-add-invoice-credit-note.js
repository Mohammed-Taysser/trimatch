'use strict';

// FR-404 follow-through: an invoice held in awaiting_credit_note records the
// vendor's credit note (amount + reference) when it is applied, so the net
// payable (invoice total − credit) and the reconciliation are traceable.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('invoices', 'credit_note_minor', {
      type: Sequelize.BIGINT,
      allowNull: true,
    });
    await queryInterface.addColumn('invoices', 'credit_note_ref', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'credit_note_ref');
    await queryInterface.removeColumn('invoices', 'credit_note_minor');
  },
};
