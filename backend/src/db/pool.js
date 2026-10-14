const { Pool, types } = require('pg');
const config = require('../config');

// DATE vrnemo kot 'YYYY-MM-DD', da ne pride do zamika časovnega pasu.
types.setTypeParser(1082, (value) => value);
// bigint (COUNT) vrnemo kot število; vrednosti so v praksi daleč pod 2^53.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));
types.setTypeParser(1700, (value) => Number.parseFloat(value));

function createPool() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL ni nastavljen. PostgreSQL je obvezen vir podatkov.');
  }
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => {
    console.error('[db] Napaka nedejavne povezave:', err.message);
  });
  return pool;
}

// Na Vercelu se modul ponovno uporabi med klici iste instance; pool hranimo globalno,
// da ob "toplem" zagonu ne odpiramo novih povezav.
function getPool() {
  if (!globalThis.__mastertaskPool) {
    globalThis.__mastertaskPool = createPool();
  }
  return globalThis.__mastertaskPool;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function closePool() {
  if (globalThis.__mastertaskPool) {
    await globalThis.__mastertaskPool.end();
    globalThis.__mastertaskPool = undefined;
  }
}

module.exports = { getPool, query, withTransaction, closePool };
