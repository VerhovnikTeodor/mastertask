const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { unauthorized, forbidden } = require('../lib/errors');

const COOKIE_NAME = 'mt_session';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: config.sessionDays * 24 * 60 * 60 * 1000,
  };
}

function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, tv: user.tokenVersion }, config.jwtSecret, {
    expiresIn: `${config.sessionDays}d`,
    algorithm: 'HS256',
  });
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearSession(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
}

const USER_COLUMNS = `
  id, email, first_name AS "firstName", last_name AS "lastName", job_title AS "jobTitle",
  role, avatar_color AS "avatarColor", is_active AS "isActive", preferences,
  token_version AS "tokenVersion", created_at AS "createdAt", last_login_at AS "lastLoginAt"`;

/** Preveri sejo in naloži uporabnika iz baze (tako deaktivacija ali sprememba gesla takoj velja). */
async function authenticate(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(unauthorized());

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    clearSession(res);
    return next(unauthorized('Seja je potekla. Prijavite se znova.'));
  }

  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [payload.sub]);
  const user = rows[0];
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    clearSession(res);
    return next(unauthorized('Seja ni več veljavna. Prijavite se znova.'));
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(forbidden('To dejanje je na voljo samo skrbnikom.'));
  next();
}

function publicUser(user) {
  const { tokenVersion, ...rest } = user;
  return rest;
}

module.exports = {
  COOKIE_NAME,
  USER_COLUMNS,
  authenticate,
  requireAdmin,
  issueSession,
  clearSession,
  publicUser,
};
