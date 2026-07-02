// Integration suite (real Postgres/Redis — Testcontainers in CI via services).
// No tests yet: the first ones land with Epic 1. passWithNoTests keeps the
// pipeline stage green on the empty app, per the story's AC.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.integration-spec.ts'],
  passWithNoTests: true,
};
