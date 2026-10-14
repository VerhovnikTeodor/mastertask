const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const LOCK_ID = 7_243_901;

async function migrate({ connectionString = config.migrationDatabaseUrl, log = console.log } = {}) {
  if (!connectionString) {
    throw new Error('DATABASE_URL (ali DATABASE_URL_UNPOOLED) ni nastavljen.');
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`[migrate] ✓ ${file}`);
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migracija ${file} ni uspela: ${err.message}`);
      }
    }
    log(count === 0 ? '[migrate] Shema je že posodobljena.' : `[migrate] Izvedenih migracij: ${count}`);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
