const express = require('express');
const { query, withTransaction } = require('../db/pool');
const {
  z,
  parse,
  parseId,
  text,
  optionalText,
  uuid,
  nullableDate,
  isoDate,
  csv,
  PRIORITIES,
  COLUMN_CATEGORIES,
} = require('../lib/validation');
const { requireTaskAccess, requireProjectRole, hasRole } = require('../lib/permissions');
const { forbidden, notFound, conflict } = require('../lib/errors');
const { logActivity, notify } = require('../lib/events');
const { USER_BRIEF } = require('../lib/sql');
const tasks = require('../services/tasks');
const { listActivity } = require('../services/activity');

const router = express.Router();

const listSchema = z.object({
  projectId: csv(uuid).optional(),
  columnId: csv(uuid).optional(),
  status: csv(z.enum(COLUMN_CATEGORIES)).optional(),
  priority: csv(z.enum(PRIORITIES)).optional(),
  assignee: csv(z.union([uuid, z.literal('me'), z.literal('none')])).optional(),
  createdBy: z.union([uuid, z.literal('me')]).optional(),
  label: csv(z.string().max(30)).optional(),
  due: z.enum(['overdue', 'today', 'week', 'month', 'none']).optional(),
  dueFrom: isoDate.optional(),
  dueTo: isoDate.optional(),
  search: z.string().max(200).optional(),
  archived: z.enum(['true', 'false']).optional(),
  sort: z.enum(['created', 'updated', 'due', 'priority', 'title', 'key']).default('updated'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
});

const createSchema = z.object({
  projectId: uuid,
  title: text(200),
  description: optionalText(20000).optional(),
  columnId: uuid.optional(),
  priority: z.enum(PRIORITIES).optional(),
  startDate: nullableDate.optional(),
  dueDate: nullableDate.optional(),
  assigneeIds: z.array(uuid).max(20).optional(),
  labelIds: z.array(uuid).max(20).optional(),
});

const updateSchema = z
  .object({
    title: text(200).optional(),
    description: optionalText(20000).optional(),
    columnId: uuid.optional(),
    priority: z.enum(PRIORITIES).optional(),
    startDate: nullableDate.optional(),
    dueDate: nullableDate.optional(),
    assigneeIds: z.array(uuid).max(20).optional(),
    labelIds: z.array(uuid).max(20).optional(),
  })
  .strict();

const moveSchema = z.object({ columnId: uuid, index: z.number().int().min(0).max(100000) });
const checklistCreate = z.object({ content: text(300) });
const checklistUpdate = z.object({ content: text(300).optional(), isDone: z.boolean().optional() }).strict();
const dependencySchema = z.object({ blockedById: uuid });
const commentSchema = z.object({ body: text(5000) });

router.get('/', async (req, res) => {
  const filters = parse(listSchema, req.query);
  res.json(await tasks.listTasks({ query }, req.user.id, filters));
});

/** Možnosti za filtre: projekti, člani in oznake, ki jih uporabnik vidi. */
router.get('/facets', async (req, res) => {
  const [projects, members, labels] = await Promise.all([
    query(
      `SELECT p.id, p.name, p.key, p.color, p.archived_at IS NOT NULL AS archived
         FROM projects p JOIN project_members m ON m.project_id = p.id AND m.user_id = $1
        ORDER BY p.archived_at IS NOT NULL, p.name`,
      [req.user.id],
    ),
    query(
      `SELECT DISTINCT ON (u.id) ${USER_BRIEF('u')} AS user, u.first_name, u.last_name
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
        ORDER BY u.id`,
      [req.user.id],
    ),
    query(
      `SELECT lower(l.name) AS value, min(l.name) AS name, min(l.color) AS color
         FROM labels l
        WHERE l.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
        GROUP BY lower(l.name) ORDER BY min(l.name)`,
      [req.user.id],
    ),
  ]);
  res.json({
    projects: projects.rows,
    members: members.rows
      .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'sl'))
      .map((r) => r.user),
    labels: labels.rows,
  });
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  const card = await withTransaction(async (db) => {
    await requireProjectRole(db, data.projectId, req.user.id, 'member');
    return tasks.createTask(db, { projectId: data.projectId, actorId: req.user.id, data });
  });
  res.status(201).json({ task: card });
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const access = await requireTaskAccess({ query }, id, req.user.id, 'viewer');
  const detail = await tasks.getTaskDetail({ query }, id);
  const canEdit = hasRole(access.role, 'member') && !access.projectArchivedAt;
  res.json({
    task: detail,
    permissions: {
      role: access.role,
      canEdit: canEdit && !access.archivedAt,
      canArchive: canEdit,
      canDelete: !access.projectArchivedAt && (hasRole(access.role, 'manager') || (canEdit && access.createdBy === req.user.id)),
      canComment: !access.projectArchivedAt,
    },
  });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(updateSchema, req.body);
  const card = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member');
    return tasks.updateTask(db, { task, actorId: req.user.id, data });
  });
  res.json({ task: card });
});

router.post('/:id/move', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(moveSchema, req.body);
  const card = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member');
    return tasks.moveTask(db, { task, actorId: req.user.id, ...data });
  });
  res.json({ task: card });
});

router.post('/:id/archive', async (req, res) => {
  const id = parseId(req.params.id);
  const card = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member', { allowArchivedTask: true });
    if (task.archivedAt) throw conflict('Naloga je že arhivirana.');
    await db.query('UPDATE tasks SET archived_at = now() WHERE id = $1', [id]);
    await logActivity(db, {
      projectId: task.projectId,
      taskId: id,
      actorId: req.user.id,
      action: 'task_archived',
      details: { title: task.title, number: task.number },
    });
    return tasks.getTaskCard(db, id);
  });
  res.json({ task: card });
});

router.post('/:id/restore', async (req, res) => {
  const id = parseId(req.params.id);
  const card = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member', { allowArchivedTask: true });
    if (!task.archivedAt) throw conflict('Naloga ni arhivirana.');
    const { rows } = await db.query('SELECT column_id FROM tasks WHERE id = $1', [id]);
    const { rows: pos } = await db.query(
      'SELECT COALESCE(max(position), 0) + 1024 AS pos FROM tasks WHERE column_id = $1 AND archived_at IS NULL',
      [rows[0].column_id],
    );
    await db.query('UPDATE tasks SET archived_at = NULL, position = $2 WHERE id = $1', [id, pos[0].pos]);
    await logActivity(db, {
      projectId: task.projectId,
      taskId: id,
      actorId: req.user.id,
      action: 'task_restored',
      details: { title: task.title, number: task.number },
    });
    return tasks.getTaskCard(db, id);
  });
  res.json({ task: card });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member', { allowArchivedTask: true });
    if (!hasRole(task.role, 'manager') && task.createdBy !== req.user.id) {
      throw forbidden('Nalogo lahko izbriše njen avtor ali vodja projekta.');
    }
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    await logActivity(db, {
      projectId: task.projectId,
      actorId: req.user.id,
      action: 'task_deleted',
      details: { title: task.title, number: task.number },
    });
  });
  res.status(204).end();
});

router.get('/:id/activity', async (req, res) => {
  const id = parseId(req.params.id);
  await requireTaskAccess({ query }, id, req.user.id, 'viewer');
  res.json({ items: await listActivity({ query }, { taskId: id, limit: 100 }) });
});

// Podnaloge / kontrolni seznam ----------------------------------------------
router.post('/:id/checklist', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(checklistCreate, req.body);
  const item = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member');
    const { rows: count } = await db.query('SELECT count(*) AS n, COALESCE(max(position), 0) AS max FROM checklist_items WHERE task_id = $1', [id]);
    if (count[0].n >= 100) throw conflict('Naloga ima lahko največ 100 podnalog.');
    const { rows } = await db.query(
      `INSERT INTO checklist_items (task_id, content, position) VALUES ($1, $2, $3)
       RETURNING id, content, is_done AS "isDone", position, created_at AS "createdAt"`,
      [id, data.content, count[0].max + 1],
    );
    await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [id]);
    await logActivity(db, {
      projectId: task.projectId,
      taskId: id,
      actorId: req.user.id,
      action: 'checklist_added',
      details: { title: task.title, number: task.number, item: data.content },
    });
    return rows[0];
  });
  res.status(201).json({ item });
});

router.patch('/:id/checklist/:itemId', async (req, res) => {
  const id = parseId(req.params.id);
  const itemId = parseId(req.params.itemId);
  const data = parse(checklistUpdate, req.body);
  const item = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member');
    const { rows } = await db.query(
      `UPDATE checklist_items SET content = COALESCE($3, content), is_done = COALESCE($4, is_done)
        WHERE id = $1 AND task_id = $2
        RETURNING id, content, is_done AS "isDone", position, created_at AS "createdAt"`,
      [itemId, id, data.content ?? null, data.isDone ?? null],
    );
    if (!rows[0]) throw notFound('Podnaloga ne obstaja.');
    await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [id]);
    if (data.isDone !== undefined) {
      await logActivity(db, {
        projectId: task.projectId,
        taskId: id,
        actorId: req.user.id,
        action: data.isDone ? 'checklist_done' : 'checklist_reopened',
        details: { title: task.title, number: task.number, item: rows[0].content },
      });
    }
    return rows[0];
  });
  res.json({ item });
});

router.delete('/:id/checklist/:itemId', async (req, res) => {
  const id = parseId(req.params.id);
  const itemId = parseId(req.params.itemId);
  await withTransaction(async (db) => {
    await requireTaskAccess(db, id, req.user.id, 'member');
    const { rowCount } = await db.query('DELETE FROM checklist_items WHERE id = $1 AND task_id = $2', [itemId, id]);
    if (!rowCount) throw notFound('Podnaloga ne obstaja.');
    await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [id]);
  });
  res.status(204).end();
});

// Odvisnosti ---------------------------------------------------------------
router.post('/:id/dependencies', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(dependencySchema, req.body);
  await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'member');
    await tasks.addDependency(db, { task, blockedById: data.blockedById, actorId: req.user.id });
  });
  res.status(201).json({ task: await tasks.getTaskDetail({ query }, id) });
});

router.delete('/:id/dependencies/:blockedById', async (req, res) => {
  const id = parseId(req.params.id);
  const blockedById = parseId(req.params.blockedById);
  await withTransaction(async (db) => {
    await requireTaskAccess(db, id, req.user.id, 'member');
    await db.query('DELETE FROM task_dependencies WHERE task_id = $1 AND blocked_by_id = $2', [id, blockedById]);
  });
  res.status(204).end();
});

// Komentarji ---------------------------------------------------------------
const COMMENT_SELECT = `
  SELECT cm.id, cm.task_id AS "taskId", cm.body, cm.created_at AS "createdAt", cm.edited_at AS "editedAt",
         ${USER_BRIEF('u')} AS author
    FROM comments cm JOIN users u ON u.id = cm.author_id`;

router.get('/:id/comments', async (req, res) => {
  const id = parseId(req.params.id);
  await requireTaskAccess({ query }, id, req.user.id, 'viewer');
  const { rows } = await query(`${COMMENT_SELECT} WHERE cm.task_id = $1 ORDER BY cm.created_at`, [id]);
  res.json({ items: rows });
});

router.post('/:id/comments', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(commentSchema, req.body);
  const comment = await withTransaction(async (db) => {
    const task = await requireTaskAccess(db, id, req.user.id, 'viewer');
    if (task.projectArchivedAt) throw conflict('Projekt je arhiviran in je na voljo samo za branje.');
    const { rows } = await db.query('INSERT INTO comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING id', [
      id,
      req.user.id,
      data.body,
    ]);
    const { rows: watchers } = await db.query(
      `SELECT user_id AS id FROM task_assignees WHERE task_id = $1
       UNION SELECT created_by FROM tasks WHERE id = $1 AND created_by IS NOT NULL`,
      [id],
    );
    // Obvestila prejmejo le še aktivni člani projekta.
    const { rows: members } = await db.query(
      'SELECT user_id AS id FROM project_members WHERE project_id = $1 AND user_id = ANY($2::uuid[])',
      [task.projectId, watchers.map((w) => w.id)],
    );
    await notify(db, {
      userIds: members.map((m) => m.id),
      actorId: req.user.id,
      type: 'comment_added',
      projectId: task.projectId,
      taskId: id,
      details: { title: task.title, excerpt: data.body.slice(0, 140) },
    });
    await logActivity(db, {
      projectId: task.projectId,
      taskId: id,
      actorId: req.user.id,
      action: 'comment_added',
      details: { title: task.title, number: task.number },
    });
    const { rows: full } = await db.query(`${COMMENT_SELECT} WHERE cm.id = $1`, [rows[0].id]);
    return full[0];
  });
  res.status(201).json({ comment });
});

module.exports = router;
