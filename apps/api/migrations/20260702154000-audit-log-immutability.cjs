'use strict';

// I-7: audit rows are never updated or deleted — enforced by the database,
// not just by application convention.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is append-only (domain invariant I-7)';
      END
      $$ LANGUAGE plpgsql;
    `);
    await queryInterface.sequelize.query(`
      CREATE TRIGGER audit_log_no_update_or_delete
      BEFORE UPDATE OR DELETE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP TRIGGER IF EXISTS audit_log_no_update_or_delete ON audit_log;',
    );
    await queryInterface.sequelize.query('DROP FUNCTION IF EXISTS audit_log_immutable();');
  },
};
