'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!globalThis.__tileRushPool) {
  if (!connectionString) console.error('DATABASE_URL is not set');
  globalThis.__tileRushPool = new Pool({
    connectionString,
    ssl: connectionString ? { rejectUnauthorized: false } : false,
    max: 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  globalThis.__tileRushPool.on('error', (err) => {
    console.error('idle postgres client error', err);
  });
}

module.exports = { pool: globalThis.__tileRushPool };
