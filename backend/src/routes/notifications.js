const express = require('express');
const { query } = require('../db/pool');
const { z, parse, uuid } = require('../lib/validation');
const { USER_BRIEF } = require('../lib/sql');

const router = express.Router();

const listSchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const readSchema = z.union([z.object({ ids: z.array(uuid).min(1).max(200) }), z.object({ all: z.literal(true) })]);

router.get('/', async (req, res) => {
  const q = parse(listSchema, req.query);
  // Obvestila za projekte, do katerih uporabnik nima več dostopa, se ne prikažejo.
  const { rows } = await query(
    `SELECT n.id, n.type, n.details, n.read_at AS "readAt", n.created_at AS "createdAt",
            CASE WHEN u.id IS NULL THEN NULL ELSE ${USER_BRIEF('u')} END AS actor,
            CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'name', p.name, 'key', p.key, 'color', p.color) END AS project,
            CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object('id', t.id, 'key', p.key || '-' || t.number, 'title', t.title) END AS task
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       LEFT JOIN projects p ON p.id = n.project_id
       LEFT JOIN tasks t ON t.id = n.task_id
      WHERE n.user_id = $1
        AND (n.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = n.project_id AND m.user_id = $1))
        ${q.unread === 'true' ? 'AND n.read_at IS NULL' : ''}
      ORDER BY n.created_at DESC
      LIMIT $2`,
    [req.user.id, q.limit],
  );
  const { rows: count } = await query(
    `SELECT count(*) AS n FROM notifications n
      WHERE n.user_id = $1 AND n.read_at IS NULL
        AND (n.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = n.project_id AND m.user_id = $1))`,
    [req.user.id],
  );
  res.json({ items: rows, unreadCount: count[0].n });
});

router.get('/unread-count', async (req, res) => {
  const { rows } = await query(
    `SELECT count(*) AS n FROM notifications n
      WHERE n.user_id = $1 AND n.read_at IS NULL
        AND (n.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = n.project_id AND m.user_id = $1))`,
    [req.user.id],
  );
  res.json({ unreadCount: rows[0].n });
});

router.post('/read', async (req, res) => {
  const data = parse(readSchema, req.body);
  if ('all' in data) {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  } else {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL', [
      req.user.id,
      data.ids,
    ]);
  }
  res.status(204).end();
});

module.exports = router;
