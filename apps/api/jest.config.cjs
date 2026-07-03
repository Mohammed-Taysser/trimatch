module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    // Bootstrap/wiring and DB-bound code — exercised by the integration suite
    // (test/*.integration-spec.ts) against real Postgres, not by unit tests.
    '!src/main.ts',
    '!src/setup-app.ts',
    '!src/export-openapi.ts',
    '!src/**/*.module.ts',
    '!src/**/*.model.ts',
    '!src/database/**',
    '!src/identity/users.service.ts',
    '!src/audit/audit.service.ts',
    '!src/requisitions/requisitions.service.ts',
    '!src/approvals/approvals.service.ts',
    '!src/vendors/vendors.service.ts',
    '!src/purchasing/purchasing.service.ts',
    '!src/receiving/receiving.service.ts',
    '!src/invoicing/invoicing.service.ts',
    '!src/matching/matching.service.ts',
    '!src/approvals/matrix.service.ts',
    '!src/approvals/delegations.service.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
};
