/** Zapis v dnevnik aktivnosti; kliče se znotraj iste transakcije kot sprememba. */
async function logActivity(db, { projectId, taskId = null, actorId, action, details = {} }) {
  await db.query(
    `INSERT INTO activity_log (project_id, task_id, actor_id, action, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, taskId, actorId, action, JSON.stringify(details)],
  );
}

/** Ustvari obvestila za prejemnike; izpusti avtorja dejanja in neaktivne uporabnike. */
async function notify(db, { userIds, actorId, type, projectId = null, taskId = null, details = {} }) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (recipients.length === 0) return;
  await db.query(
    `INSERT INTO notifications (user_id, actor_id, type, project_id, task_id, details)
     SELECT u.id, $2, $3, $4, $5, $6
       FROM users u
      WHERE u.id = ANY($1::uuid[]) AND u.is_active`,
    [recipients, actorId, type, projectId, taskId, JSON.stringify(details)],
  );
}

module.exports = { logActivity, notify };
