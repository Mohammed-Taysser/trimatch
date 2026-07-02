'use strict';

// FR-503: an approver delegates to a peer for a date range; both identities
// are recorded on every decision taken under the delegation.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('delegations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      delegator_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      delegate_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      starts_on: { type: Sequelize.DATEONLY, allowNull: false },
      ends_on: { type: Sequelize.DATEONLY, allowNull: false },
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
    await queryInterface.addIndex('delegations', ['delegate_id', 'starts_on', 'ends_on']);
    await queryInterface.addIndex('delegations', ['delegator_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('delegations');
  },
};
