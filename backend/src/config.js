const path = require('path');

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
}

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
const isTest = process.env.NODE_ENV === 'test';

function readJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET mora biti nastavljen in dolg vsaj 32 znakov.');
  }
  // Samo za lokalni razvoj in teste; v produkciji se aplikacija brez skrivnosti ne zažene.
  return 'local-development-secret-do-not-use-in-production';
}

// Časovni pas se vstavi v SQL kot literal, zato dovolimo le veljavna IANA imena.
function readTimezone() {
  const tz = process.env.APP_TIMEZONE || 'Europe/Ljubljana';
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(tz)) throw new Error(`APP_TIMEZONE "${tz}" ni veljaven časovni pas.`);
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    throw new Error(`APP_TIMEZONE "${tz}" ni veljaven časovni pas.`);
  }
  return tz;
}

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const config = {
  isProduction,
  isTest,
  port: intFromEnv('PORT', 8001),
  databaseUrl: process.env.DATABASE_URL,
  // Neposredna (nepooled) povezava za migracije; Neon/Vercel jo izpostavi kot DATABASE_URL_UNPOOLED.
  migrationDatabaseUrl: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  dbPoolMax: intFromEnv('DB_POOL_MAX', process.env.VERCEL ? 3 : 10),
  jwtSecret: readJwtSecret(),
  sessionDays: intFromEnv('SESSION_DAYS', 7),
  bcryptRounds: intFromEnv('BCRYPT_ROUNDS', 11),
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  timezone: readTimezone(),
};

module.exports = config;
