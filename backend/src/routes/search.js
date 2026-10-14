const express = require('express');
const { query } = require('../db/pool');
const { z, parse } = require('../lib/validation');

const router = express.Router();
const schema = z.object({ q: z.string().trim().min(1).max(100) });

router.get('/', async (req, res) => {
  const { q } = parse(schema, req.query);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const keyMatch = q.match(/^([A-Za-z][A-Za-z0-9]{1,5})-(\d+)$/);
  const visible = 'SELECT project_id FROM project_members WHERE user_id = $1';

  const [projects, tasks, people] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.key, p.color, p.status, p.archived_at IS NOT NULL AS archived
         FROM projects p
        WHERE p.id IN (${visible}) AND (p.name ILIKE $2 OR p.key ILIKE $2)
        ORDER BY p.archived_at IS NOT NULL, p.name LIMIT 5`,
      [req.user.id, like],
    ),
    query(
      `SELECT t.id, p.key || '-' || t.number AS key, t.title, t.archived_at IS NOT NULL AS archived,
              json_build_object('name', c.name, 'category', c.category, 'color', c.color) AS status,
              json_build_object('id', p.id, 'name', p.name, 'color', p.color) AS project
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         JOIN board_columns c ON c.id = t.column_id
        WHERE t.project_id IN (${visible})
          AND (t.title ILIKE $2 OR (p.key = $3 AND t.number = $4))
        ORDER BY (p.key = $3 AND t.number = $4) DESC, t.archived_at IS NOT NULL, t.updated_at DESC
        LIMIT 8`,
      [req.user.id, like, keyMatch ? keyMatch[1].toUpperCase() : null, keyMatch ? Number(keyMatch[2]) : null],
    ),
    query(
      `SELECT u.id, u.first_name AS "firstName", u.last_name AS "lastName", u.email,
              u.avatar_color AS "avatarColor", u.job_title AS "jobTitle"
         FROM users u
        WHERE u.is_active AND (u.first_name || ' ' || u.last_name ILIKE $1 OR u.email ILIKE $1)
        ORDER BY u.first_name LIMIT 5`,
      [like],
    ),
  ]);
  res.json({ projects: projects.rows, tasks: tasks.rows, people: people.rows });
});

module.exports = router;
