const express = require('express');
const { query, withTransaction } = require('../db/pool');
const { z, parse, parseId, text } = require('../lib/validation');
const { requireTaskAccess, hasRole } = require('../lib/permissions');
const { forbidden, notFound, conflict } = require('../lib/errors');
const { USER_BRIEF } = require('../lib/sql');

const router = express.Router();
const updateSchema = z.object({ body: text(5000) });

async function loadComment(db, id) {
  const { rows } = await db.query('SELECT id, task_id AS "taskId", author_id AS "authorId" FROM comments WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Komentar ne obstaja.');
  return rows[0];
}

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(updateSchema, req.body);
  const comment = await withTransaction(async (db) => {
    const existing = await loadComment(db, id);
    const task = await requireTaskAccess(db, existing.taskId, req.user.id, 'viewer');
    if (task.projectArchivedAt) throw conflict('Projekt je arhiviran in je na voljo samo za branje.');
    if (existing.authorId !== req.user.id) throw forbidden('Komentar lahko ureja samo njegov avtor.');
    await db.query('UPDATE comments SET body = $2, edited_at = now() WHERE id = $1', [id, data.body]);
    const { rows } = await db.query(
      `SELECT cm.id, cm.task_id AS "taskId", cm.body, cm.created_at AS "createdAt", cm.edited_at AS "editedAt",
              ${USER_BRIEF('u')} AS author
         FROM comments cm JOIN users u ON u.id = cm.author_id WHERE cm.id = $1`,
      [id],
    );
    return rows[0];
  });
  res.json({ comment });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const existing = await loadComment({ query }, id);
  const task = await requireTaskAccess({ query }, existing.taskId, req.user.id, 'viewer');
  if (task.projectArchivedAt) throw conflict('Projekt je arhiviran in je na voljo samo za branje.');
  if (existing.authorId !== req.user.id && !hasRole(task.role, 'manager')) {
    throw forbidden('Komentar lahko izbriše avtor ali vodja projekta.');
  }
  await query('DELETE FROM comments WHERE id = $1', [id]);
  res.status(204).end();
});

module.exports = router;
