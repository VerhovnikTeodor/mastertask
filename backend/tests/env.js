const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL ni nastavljen. Testi potrebujejo ločeno PostgreSQL bazo (podatki se brišejo).');
}

const testDbName = new URL(process.env.TEST_DATABASE_URL).pathname.slice(1);
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL || !/test/i.test(testDbName)) {
  throw new Error('TEST_DATABASE_URL mora kazati na ločeno bazo, katere ime vsebuje "test" (testi brišejo shemo).');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
