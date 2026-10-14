const { Params, USER_BRIEF } = require('../lib/sql');

/** Dnevnik aktivnosti za projekt, nalogo ali vse projekte uporabnika. */
async function listActivity(db, { projectId, taskId, userId, limit = 30, before }) {
  const p = new Params();
  const where = [];
  if (projectId) where.push(`a.project_id = ${p.add(projectId)}`);
  if (taskId) where.push(`a.task_id = ${p.add(taskId)}`);
  if (userId) {
    where.push(`a.project_id IN (SELECT project_id FROM project_members WHERE user_id = ${p.add(userId)})`);
  }
  if (before) where.push(`a.id < ${p.add(before)}`);

  const { rows } = await db.query(
    `SELECT a.id, a.action, a.details, a.created_at AS "createdAt",
            CASE WHEN u.id IS NULL THEN NULL ELSE ${USER_BRIEF('u')} END AS actor,
            json_build_object('id', pr.id, 'name', pr.name, 'key', pr.key, 'color', pr.color) AS project,
            CASE WHEN t.id IS NULL THEN NULL
                 ELSE json_build_object('id', t.id, 'key', pr.key || '-' || t.number, 'title', t.title) END AS task
       FROM activity_log a
       JOIN projects pr ON pr.id = a.project_id
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN tasks t ON t.id = a.task_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.id DESC
      LIMIT ${p.add(Math.min(limit, 100))}`,
    p.values,
  );
  return rows;
}

module.exports = { listActivity };
