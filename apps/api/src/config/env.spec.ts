import { validateEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  API_PORT: '3000',
  DATABASE_URL: 'postgres://trimatch:trimatch@localhost:5432/trimatch',
  REDIS_URL: 'redis://localhost:6379',
};

describe('app refuses to boot with invalid env config (AC 3)', () => {
  it('accepts a complete valid environment', () => {
    const env = validateEnv(validEnv);
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });

  it('applies defaults for NODE_ENV and API_PORT', () => {
    const { NODE_ENV, API_PORT, ...rest } = validEnv;
    const env = validateEnv(rest);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a postgres URL', () => {
    expect(() => validateEnv({ ...validEnv, DATABASE_URL: 'mysql://nope' })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('throws when REDIS_URL is missing', () => {
    const { REDIS_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/REDIS_URL/);
  });

  it('throws when API_PORT is not a number', () => {
    expect(() => validateEnv({ ...validEnv, API_PORT: 'not-a-port' })).toThrow(
      /API_PORT/,
    );
  });
});
