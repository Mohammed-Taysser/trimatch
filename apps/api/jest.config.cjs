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
    '!src/**/*.module.ts',
    '!src/database/**',
    '!src/identity/**',
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
