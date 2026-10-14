const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { z, parse, parseId } = require('../lib/validation');
const { requireAdmin } = require('../middleware/auth');
const { notFound, conflict, badRequest } = require('../lib/errors');
const { TODAY, Params } = require('../lib/sql');

const router = express.Router();

const listSchema = z.object({
  search: z.string().max(100).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

const updateSchema = z
  .object({
    role: z.enum(['admin', 'member']).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * Imenik ekipe z obremenjenostjo. Štejejo se samo naloge v projektih,
 * ki jih vidi tudi uporabnik, ki poizveduje.
 */
router.get('/', async (req, res) => {
  const q = parse(listSchema, req.query);
  const p = new Params([req.user.id]);
  const where = [];
  if (q.includeInactive !== 'true') where.push('u.is_active');
  if (q.search) {
    const term = p.add(`%${q.search.trim().toLowerCase()}%`);
    where.push(`(lower(u.first_name || ' ' || u.last_name) LIKE ${term} OR lower(u.email) LIKE ${term})`);
  }

  const { rows } = await query(
    `WITH visible AS (
       SELECT project_id FROM project_members WHERE user_id = $1
     ),
     load AS (
       SELECT a.user_id,
              count(*) AS open_tasks,
              count(*) FILTER (WHERE t.due_date < ${TODAY}) AS overdue,
              count(*) FILTER (WHERE t.due_date BETWEEN ${TODAY} AND ${TODAY} + 7) AS due_soon,
              count(*) FILTER (WHERE c.category = 'in_progress') AS in_progress
         FROM task_assignees a
         JOIN tasks t ON t.id = a.task_id
         JOIN board_columns c ON c.id = t.column_id
         JOIN projects p ON p.id = t.project_id
        WHERE t.project_id IN (SELECT project_id FROM visible)
          AND t.archived_at IS NULL AND p.archived_at IS NULL AND c.category <> 'done'
        GROUP BY a.user_id
     ),
     shared AS (
       SELECT m.user_id, count(*) AS projects
         FROM project_members m
         JOIN projects p ON p.id = m.project_id AND p.archived_at IS NULL
        WHERE m.project_id IN (SELECT project_id FROM visible)
        GROUP BY m.user_id
     )
     SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName",
            u.job_title AS "jobTitle", u.role, u.avatar_color AS "avatarColor",
            u.is_active AS "isActive", u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
            json_build_object(
              'openTasks', COALESCE(l.open_tasks, 0),
              'inProgress', COALESCE(l.in_progress, 0),
              'overdue', COALESCE(l.overdue, 0),
              'dueSoon', COALESCE(l.due_soon, 0),
              'sharedProjects', COALESCE(s.projects, 0)
            ) AS workload
       FROM users u
       LEFT JOIN load l ON l.user_id = u.id
       LEFT JOIN shared s ON s.user_id = u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.is_active DESC, u.first_name, u.last_name
      LIMIT 500`,
    p.values,
  );
  res.json({ items: rows });
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await query(
    `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName",
            u.job_title AS "jobTitle", u.role, u.avatar_color AS "avatarColor",
            u.is_active AS "isActive", u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
            COALESCE((
              SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'key', p.key,
                                                'color', p.color, 'role', m.role) ORDER BY p.name)
                FROM project_members m
                JOIN projects p ON p.id = m.project_id AND p.archived_at IS NULL
               WHERE m.user_id = u.id
                 AND m.project_id IN (SELECT project_id FROM project_members WHERE user_id = $2)
            ), '[]') AS projects
       FROM users u WHERE u.id = $1`,
    [id, req.user.id],
  );
  if (!rows[0]) throw notFound('Uporabnik ne obstaja.');
  res.json({ user: rows[0] });
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(updateSchema, req.body);
  if (id === req.user.id && (data.role === 'member' || data.isActive === false)) {
    throw badRequest('Svoje skrbniške vloge ali računa ne morete odstraniti.');
  }

  const user = await withTransaction(async (db) => {
    const { rows: current } = await db.query('SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE', [id]);
    if (!current[0]) throw notFound('Uporabnik ne obstaja.');
    if (current[0].role === 'admin' && (data.role === 'member' || data.isActive === false)) {
      const { rows } = await db.query("SELECT count(*) AS n FROM users WHERE role = 'admin' AND is_active");
      if (rows[0].n <= 1) throw conflict('V sistemu mora ostati vsaj en aktiven skrbnik.');
    }
    const { rows } = await db.query(
      `UPDATE users SET
         role = COALESCE($2::varchar, role),
         is_active = COALESCE($3::boolean, is_active),
         token_version = token_version + CASE WHEN $3::boolean = false THEN 1 ELSE 0 END
       WHERE id = $1
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", role,
                 is_active AS "isActive", avatar_color AS "avatarColor", job_title AS "jobTitle"`,
      [id, data.role ?? null, data.isActive ?? null],
    );
    return rows[0];
  });
  res.json({ user });
});

module.exports = router;
