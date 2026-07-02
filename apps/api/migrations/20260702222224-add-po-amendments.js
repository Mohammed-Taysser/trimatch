'use strict';

// FR-604: PO amendments create version N+1. The live purchase_orders row is
// always the current version; every superseded version is snapshotted into
// po_amendments, which is append-only like audit_log (all versions stay
// visible, forever).
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('purchase_orders', 'version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await queryInterface.createTable('po_amendments', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'purchase_orders', key: 'id' },
      },
      // the version this snapshot preserves (superseded by version + 1)
      version: { type: Sequelize.INTEGER, allowNull: false },
      // { totalMinor, lines: [{ poLineId, lineNo, description, quantity,
      //   unitPriceMinor, lineTotalMinor }] } as of that version
      snapshot: { type: Sequelize.JSONB, allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      requires_reapproval: { type: Sequelize.BOOLEAN, allowNull: false },
      amended_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
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
    await queryInterface.addConstraint('po_amendments', {
      fields: ['po_id', 'version'],
      type: 'unique',
      name: 'po_amendments_po_id_version_unique',
    });
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION po_amendments_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'po_amendments is append-only (FR-604: all versions stay visible)';
      END
      $$ LANGUAGE plpgsql;
    `);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER po_amendments_no_update_or_delete
      BEFORE UPDATE OR DELETE ON po_amendments
      FOR EACH ROW EXECUTE FUNCTION po_amendments_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS po_amendments_no_update_or_delete ON po_amendments;',
    );
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS po_amendments_immutable();');
    await queryInterface.dropTable('po_amendments');
    await queryInterface.removeColumn('purchase_orders', 'version');
  },
};
