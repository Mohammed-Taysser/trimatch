// sequelize-cli config — reads the repo-root .env (the CLI runs outside Nest).
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required — no defaults; copy .env.example to .env');
}

const config = { url, dialect: 'postgres' };

module.exports = { development: config, test: config, production: config };
