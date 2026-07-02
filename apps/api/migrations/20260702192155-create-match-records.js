'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // FR-602 / PRD case E vs G: a final-settlement invoice judges under-delivery.
    await queryInterface.addColumn('invoices', 'is_final', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // FR-405: the match record stores the tolerances used, each comparison and
    // the outcome — immutable, so "why was this paid?" is answerable forever.
    await queryInterface.createTable('match_records', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'invoices', key: 'id' },
      },
      outcome: { type: Sequelize.STRING(16), allowNull: false },
      tolerances: { type: Sequelize.JSONB, allowNull: false },
      comparisons: { type: Sequelize.JSONB, allowNull: false },
      reasons: { type: Sequelize.JSONB, allowNull: false },
      expected_total_minor: { type: Sequelize.BIGINT, allowNull: false },
      total_delta_minor: { type: Sequelize.BIGINT, allowNull: false },
      matched_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()'),
      },
    });
    await queryInterface.addIndex('match_records', ['invoice_id']);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION match_records_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'match_records is append-only (FR-405)';
      END
      $$ LANGUAGE plpgsql;
    `);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER match_records_no_update_or_delete
      BEFORE UPDATE OR DELETE ON match_records
      FOR EACH ROW EXECUTE FUNCTION match_records_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS match_records_no_update_or_delete ON match_records;',
    );
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS match_records_immutable();');
    await queryInterface.dropTable('match_records');
    await queryInterface.removeColumn('invoices', 'is_final');
  },
};
