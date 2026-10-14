const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { query, withTransaction } = require('../db/pool');
const { z, parse, text, optionalText, color } = require('../lib/validation');
const { unauthorized, forbidden, HttpError, badRequest } = require('../lib/errors');
const {
  USER_COLUMNS,
  authenticate,
  issueSession,
  clearSession,
  publicUser,
} = require('../middleware/auth');

const router = express.Router();

const AVATAR_COLORS = ['#3E63DD', '#0D9488', '#D9480F', '#7C3AED', '#C2255C', '#2F9E44', '#E67700', '#1C7ED6'];
// Hash za primerjavo, ko uporabnik ne obstaja, da čas odziva ne razkrije obstoja računa.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

const MAX_FAILED_PER_EMAIL = 8;
const MAX_FAILED_PER_IP = 40;
const LOCKOUT_MINUTES = 15;

const email = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email('Vnesite veljaven e-poštni naslov.').max(254));
const password = z
  .string()
  .min(8, 'Geslo mora imeti vsaj 8 znakov.')
  .max(128, 'Geslo je predolgo.')
  .refine((v) => /[A-Za-zčšžČŠŽ]/.test(v) && /\d/.test(v), 'Geslo mora vsebovati vsaj eno črko in eno števko.');

const registerSchema = z.object({
  email,
  password,
  firstName: text(80),
  lastName: text(80),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Vnesite geslo.').max(128),
});

const preferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    defaultTaskView: z.enum(['board', 'list']).optional(),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .strict();

const profileSchema = z
  .object({
    firstName: text(80).optional(),
    lastName: text(80).optional(),
    jobTitle: optionalText(120).nullable().optional(),
    avatarColor: color.optional(),
    preferences: preferencesSchema.optional(),
  })
  .strict();

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Vnesite trenutno geslo.'),
  newPassword: password,
});

function clientIp(req) {
  return (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim().slice(0, 64) || null;
}

router.post('/register', async (req, res) => {
  if (!config.allowRegistration) throw forbidden('Registracija novih računov je onemogočena.');
  const data = parse(registerSchema, req.body);
  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

  const user = await withTransaction(async (db) => {
    // Zaklep prepreči, da bi dva hkratna prva uporabnika oba postala skrbnika.
    await db.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    const existing = await db.query('SELECT 1 FROM users WHERE lower(email) = $1', [data.email]);
    if (existing.rowCount > 0) throw new HttpError(409, 'Račun s tem e-poštnim naslovom že obstaja.');
    const { rows: countRows } = await db.query('SELECT count(*)::int AS n FROM users');
    const role = countRows[0].n === 0 ? 'admin' : 'member';
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, avatar_color, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING ${USER_COLUMNS}`,
      [data.email, passwordHash, data.firstName, data.lastName, role, avatarColor],
    );
    return rows[0];
  });

  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const data = parse(loginSchema, req.body);
  const ip = clientIp(req);

  const { rows: limits } = await query(
    `SELECT
       count(*) FILTER (WHERE lower(email) = $1) AS by_email,
       count(*) FILTER (WHERE ip = $2) AS by_ip
     FROM login_attempts
     WHERE NOT succeeded AND created_at > now() - make_interval(mins => $3)`,
    [data.email, ip, LOCKOUT_MINUTES],
  );
  if (limits[0].by_email >= MAX_FAILED_PER_EMAIL || limits[0].by_ip >= MAX_FAILED_PER_IP) {
    throw new HttpError(429, `Preveč neuspešnih poskusov prijave. Poskusite znova čez ${LOCKOUT_MINUTES} minut.`);
  }

  const { rows } = await query(
    `SELECT ${USER_COLUMNS}, password_hash AS "passwordHash" FROM users WHERE lower(email) = $1`,
    [data.email],
  );
  const found = rows[0];
  const valid = await bcrypt.compare(data.password, found?.passwordHash ?? DUMMY_HASH);
  const succeeded = Boolean(found && valid && found.isActive);

  await query('INSERT INTO login_attempts (email, ip, succeeded) VALUES ($1, $2, $3)', [data.email, ip, succeeded]);
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");

  if (!succeeded) throw unauthorized('E-poštni naslov ali geslo ni pravilno.');

  const { passwordHash, ...user } = found;
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.status(204).end();
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/me', authenticate, async (req, res) => {
  const data = parse(profileSchema, req.body);
  const preferences = data.preferences ? { ...req.user.preferences, ...data.preferences } : undefined;
  const { rows } = await query(
    `UPDATE users SET
       first_name   = COALESCE($2, first_name),
       last_name    = COALESCE($3, last_name),
       job_title    = CASE WHEN $4::boolean THEN NULLIF($5, '') ELSE job_title END,
       avatar_color = COALESCE($6, avatar_color),
       preferences  = COALESCE($7::jsonb, preferences)
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [
      req.user.id,
      data.firstName ?? null,
      data.lastName ?? null,
      data.jobTitle !== undefined,
      data.jobTitle ?? null,
      data.avatarColor ?? null,
      preferences ? JSON.stringify(preferences) : null,
    ],
  );
  res.json({ user: publicUser(rows[0]) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const data = parse(passwordSchema, req.body);
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const valid = await bcrypt.compare(data.currentPassword, rows[0].password_hash);
  if (!valid) throw badRequest('Podatki niso veljavni.', { currentPassword: 'Trenutno geslo ni pravilno.' });
  const hash = await bcrypt.hash(data.newPassword, config.bcryptRounds);
  // Povečanje token_version razveljavi vse obstoječe seje; trenutno izdamo na novo.
  const { rows: updated } = await query(
    `UPDATE users SET password_hash = $2, token_version = token_version + 1
      WHERE id = $1 RETURNING ${USER_COLUMNS}`,
    [req.user.id, hash],
  );
  issueSession(res, updated[0]);
  res.json({ user: publicUser(updated[0]) });
});

module.exports = router;
