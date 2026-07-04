'use strict';

// Index audit (ClickUp 869dzpp4p). FK/join columns are already indexed; these
// three close the remaining hot-path gaps found by reviewing the list queries.
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // AP exceptions queue: Invoice.findAndCountAll({ where: { status: 'exception' },
    // order by created_at }) — filter + sort in one index.
    await queryInterface.addIndex('invoices', ['status', 'created_at'], {
      name: 'invoices_status_created_idx',
    });

    // Admin requisitions list (?status=) and purchasing's "approved" list
    // (where status='approved'), both ordered by created_at.
    await queryInterface.addIndex('requisitions', ['status', 'created_at'], {
      name: 'requisitions_status_created_idx',
    });

    // Audit browser filters (entity_type[, entity_id]) and orders by created_at.
    // Fold created_at into the existing prefix index so the sort is covered too;
    // the old two-column index becomes a redundant prefix, so replace it.
    await queryInterface.removeIndex('audit_log', 'audit_log_entity_type_entity_id');
    await queryInterface.addIndex('audit_log', ['entity_type', 'entity_id', 'created_at'], {
      name: 'audit_log_entity_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('audit_log', 'audit_log_entity_created_idx');
    await queryInterface.addIndex('audit_log', ['entity_type', 'entity_id'], {
      name: 'audit_log_entity_type_entity_id',
    });
    await queryInterface.removeIndex('requisitions', 'requisitions_status_created_idx');
    await queryInterface.removeIndex('invoices', 'invoices_status_created_idx');
  },
};
