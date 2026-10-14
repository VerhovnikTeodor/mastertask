const express = require('express');
const { query, withTransaction } = require('../db/pool');
const {
  z,
  parse,
  parseId,
  text,
  optionalText,
  uuid,
  color,
  nullableDate,
  csv,
  PRIORITIES,
  PROJECT_STATUSES,
  COLUMN_CATEGORIES,
} = require('../lib/validation');
const { requireProjectRole, ROLE_RANK } = require('../lib/permissions');
const { badRequest, conflict, forbidden, notFound } = require('../lib/errors');
const { logActivity, notify } = require('../lib/events');
const projects = require('../services/projects');
const { getBoardTasks } = require('../services/tasks');
const { listActivity } = require('../services/activity');

const router = express.Router();

const listSchema = z.object({
  search: z.string().max(120).optional(),
  status: csv(z.enum(PROJECT_STATUSES)).optional(),
  priority: csv(z.enum(PRIORITIES)).optional(),
  archived: z.enum(['true', 'false', 'all']).optional(),
  role: z.enum(['owner', 'any']).optional(),
  sort: z.enum(['updated', 'created', 'name', 'due', 'priority', 'progress']).optional(),
});

const baseFields = {
  name: text(120),
  description: optionalText(5000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  color: color.optional(),
  startDate: nullableDate.optional(),
  dueDate: nullableDate.optional(),
};

const createSchema = z.object({
  ...baseFields,
  key: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,5}$/, 'Oznaka: 2–6 znakov, začne se s črko (npr. WEB).'))
    .optional()
    .or(z.literal('').transform(() => undefined)),
  memberIds: z.array(uuid).max(100).optional(),
});

const updateSchema = z.object({ ...baseFields, name: baseFields.name.optional() }).strict();

const memberAddSchema = z.object({ userId: uuid, role: z.enum(['manager', 'member', 'viewer']).default('member') });
const memberRoleSchema = z.object({ role: z.enum(['owner', 'manager', 'member', 'viewer']) });

const columnSchema = z.object({
  name: text(40),
  category: z.enum(COLUMN_CATEGORIES),
  color: color.optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});
const columnUpdateSchema = columnSchema.partial().strict();
const columnOrderSchema = z.object({ columnIds: z.array(uuid).min(1).max(20) });
const columnDeleteSchema = z.object({ moveTo: uuid.optional() });

const labelSchema = z.object({ name: text(30), color });
const labelUpdateSchema = labelSchema.partial().strict();

router.get('/', async (req, res) => {
  const filters = parse(listSchema, req.query);
  res.json({ items: await projects.listProjects({ query }, req.user.id, filters) });
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  const projectId = await withTransaction((db) => projects.createProject(db, { actorId: req.user.id, data }));
  res.status(201).json({ project: await projects.getProjectDetail({ query }, projectId, req.user.id) });
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.get('/:id/board', async (req, res) => {
  const id = parseId(req.params.id);
  await requireProjectRole({ query }, id, req.user.id, 'viewer');
  res.json({ tasks: await getBoardTasks({ query }, id) });
});

router.get('/:id/activity', async (req, res) => {
  const id = parseId(req.params.id);
  const { before, limit } = parse(
    z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }),
    req.query,
  );
  await requireProjectRole({ query }, id, req.user.id, 'viewer');
  res.json({ items: await listActivity({ query }, { projectId: id, before, limit }) });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(updateSchema, req.body);
  await withTransaction(async (db) => {
    await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query(
      'SELECT name, status, start_date AS "startDate", due_date AS "dueDate" FROM projects WHERE id = $1 FOR UPDATE',
      [id],
    );
    const current = rows[0];
    const start = data.startDate !== undefined ? data.startDate : current.startDate;
    const due = data.dueDate !== undefined ? data.dueDate : current.dueDate;
    if (start && due && due < start) throw badRequest('Podatki niso veljavni.', { dueDate: 'Rok ne more biti pred začetkom.' });

    await db.query(
      `UPDATE projects SET
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         priority = COALESCE($5, priority),
         color = COALESCE($6, color),
         start_date = $7,
         due_date = $8
       WHERE id = $1`,
      [id, data.name ?? null, data.description ?? null, data.status ?? null, data.priority ?? null, data.color ?? null, start, due],
    );
    const details = { name: data.name ?? current.name };
    if (data.status && data.status !== current.status) Object.assign(details, { statusFrom: current.status, statusTo: data.status });
    await logActivity(db, { projectId: id, actorId: req.user.id, action: 'project_updated', details });
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.post('/:id/archive', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, 'owner', { allowArchived: true });
    if (access.archivedAt) throw conflict('Projekt je že arhiviran.');
    await db.query('UPDATE projects SET archived_at = now() WHERE id = $1', [id]);
    await logActivity(db, { projectId: id, actorId: req.user.id, action: 'project_archived', details: { name: access.name } });
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.post('/:id/restore', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, 'owner', { allowArchived: true });
    if (!access.archivedAt) throw conflict('Projekt ni arhiviran.');
    await db.query('UPDATE projects SET archived_at = NULL WHERE id = $1', [id]);
    await logActivity(db, { projectId: id, actorId: req.user.id, action: 'project_restored', details: { name: access.name } });
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, 'owner', { allowArchived: true });
    if (!access.archivedAt) throw conflict('Trajno lahko izbrišete samo arhiviran projekt.');
    await db.query('DELETE FROM projects WHERE id = $1', [id]);
  });
  res.status(204).end();
});

// Člani --------------------------------------------------------------------
router.post('/:id/members', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(memberAddSchema, req.body);
  await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query(
      `SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id = $1 AND is_active`,
      [data.userId],
    );
    if (!rows[0]) throw badRequest('Podatki niso veljavni.', { userId: 'Uporabnik ne obstaja ali ni aktiven.' });
    const inserted = await db.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, data.userId, data.role],
    );
    if (!inserted.rowCount) throw conflict('Uporabnik je že član projekta.');
    await logActivity(db, {
      projectId: id,
      actorId: req.user.id,
      action: 'member_added',
      details: { member: rows[0].name, role: data.role },
    });
    await notify(db, {
      userIds: [data.userId],
      actorId: req.user.id,
      type: 'project_added',
      projectId: id,
      details: { name: access.name, role: data.role },
    });
  });
  res.status(201).json({ members: await projects.listMembers({ query }, id) });
});

router.patch('/:id/members/:userId', async (req, res) => {
  const id = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  const { role } = parse(memberRoleSchema, req.body);
  await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query(
      `SELECT m.role, u.first_name || ' ' || u.last_name AS name, u.is_active AS "isActive"
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1 AND m.user_id = $2 FOR UPDATE OF m`,
      [id, userId],
    );
    const target = rows[0];
    if (!target) throw notFound('Uporabnik ni član projekta.');
    if (userId === req.user.id) throw badRequest('Svoje vloge ne morete spremeniti.');
    if (target.role === role) return;

    if (role === 'owner') {
      if (access.role !== 'owner') throw forbidden('Lastništvo lahko prenese samo lastnik projekta.');
      if (!target.isActive) throw badRequest('Lastništva ni mogoče prenesti na neaktiven račun.');
      await db.query("UPDATE project_members SET role = 'manager' WHERE project_id = $1 AND user_id = $2", [id, req.user.id]);
    } else if (access.role !== 'owner' && ROLE_RANK[target.role] >= ROLE_RANK[access.role]) {
      throw forbidden('Vloge člana z enako ali višjo vlogo ne morete spremeniti.');
    } else if (target.role === 'owner') {
      throw badRequest('Vlogo lastnika lahko spremenite le s prenosom lastništva.');
    }

    await db.query('UPDATE project_members SET role = $3 WHERE project_id = $1 AND user_id = $2', [id, userId, role]);
    await logActivity(db, {
      projectId: id,
      actorId: req.user.id,
      action: role === 'owner' ? 'ownership_transferred' : 'member_role_changed',
      details: { member: target.name, from: target.role, to: role },
    });
  });
  res.json({ members: await projects.listMembers({ query }, id) });
});

/**
 * Odstranitev člana: član izgubi dostop in je odstranjen z odprtih nalog.
 * Zaključene naloge, komentarji in zgodovina ostanejo nespremenjeni.
 */
router.delete('/:id/members/:userId', async (req, res) => {
  const id = parseId(req.params.id);
  const userId = parseId(req.params.userId);
  const self = userId === req.user.id;
  const result = await withTransaction(async (db) => {
    const access = await requireProjectRole(db, id, req.user.id, self ? 'viewer' : 'manager');
    const { rows } = await db.query(
      `SELECT m.role, u.first_name || ' ' || u.last_name AS name
         FROM project_members m JOIN users u ON u.id = m.user_id
        WHERE m.project_id = $1 AND m.user_id = $2 FOR UPDATE OF m`,
      [id, userId],
    );
    const target = rows[0];
    if (!target) throw notFound('Uporabnik ni član projekta.');
    if (target.role === 'owner') {
      throw badRequest(self ? 'Lastnik ne more zapustiti projekta. Najprej prenesite lastništvo.' : 'Lastnika projekta ni mogoče odstraniti.');
    }
    if (!self && access.role !== 'owner' && ROLE_RANK[target.role] >= ROLE_RANK[access.role]) {
      throw forbidden('Člana z enako ali višjo vlogo ne morete odstraniti.');
    }
    const { rowCount: unassigned } = await db.query(
      `DELETE FROM task_assignees a USING tasks t, board_columns c
        WHERE a.task_id = t.id AND c.id = t.column_id
          AND a.user_id = $2 AND t.project_id = $1 AND c.category <> 'done'`,
      [id, userId],
    );
    await db.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, userId]);
    await logActivity(db, {
      projectId: id,
      actorId: req.user.id,
      action: self ? 'member_left' : 'member_removed',
      details: { member: target.name, unassignedTasks: unassigned },
    });
    return { unassigned };
  });
  res.json({ unassignedTasks: result.unassigned, members: self ? [] : await projects.listMembers({ query }, id) });
});

// Stolpci table --------------------------------------------------------------
router.post('/:id/columns', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(columnSchema, req.body);
  await withTransaction(async (db) => {
    await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query('SELECT count(*) AS n, COALESCE(max(position), -1) AS max FROM board_columns WHERE project_id = $1', [id]);
    if (rows[0].n >= 12) throw conflict('Tabla ima lahko največ 12 stolpcev.');
    await db.query(
      'INSERT INTO board_columns (project_id, name, category, color, position, wip_limit) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, data.name, data.category, data.color ?? '#8B8D98', rows[0].max + 1, data.wipLimit ?? null],
    );
    await logActivity(db, { projectId: id, actorId: req.user.id, action: 'column_created', details: { name: data.name } });
  });
  res.status(201).json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.put('/:id/columns/order', async (req, res) => {
  const id = parseId(req.params.id);
  const { columnIds } = parse(columnOrderSchema, req.body);
  await withTransaction(async (db) => {
    await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query('SELECT id FROM board_columns WHERE project_id = $1 FOR UPDATE', [id]);
    const existing = new Set(rows.map((r) => r.id));
    if (existing.size !== columnIds.length || !columnIds.every((c) => existing.has(c))) {
      throw badRequest('Seznam stolpcev se ne ujema s stolpci projekta.');
    }
    await db.query(
      `UPDATE board_columns c SET position = o.ord - 1
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
        WHERE c.id = o.id AND c.project_id = $1`,
      [id, columnIds],
    );
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.patch('/:id/columns/:columnId', async (req, res) => {
  const id = parseId(req.params.id);
  const columnId = parseId(req.params.columnId);
  const data = parse(columnUpdateSchema, req.body);
  await withTransaction(async (db) => {
    await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows } = await db.query('SELECT category FROM board_columns WHERE id = $1 AND project_id = $2 FOR UPDATE', [columnId, id]);
    if (!rows[0]) throw notFound('Stolpec ne obstaja.');
    await db.query(
      `UPDATE board_columns SET name = COALESCE($2, name), category = COALESCE($3, category),
              color = COALESCE($4, color), wip_limit = CASE WHEN $5::boolean THEN $6 ELSE wip_limit END
        WHERE id = $1`,
      [columnId, data.name ?? null, data.category ?? null, data.color ?? null, data.wipLimit !== undefined, data.wipLimit ?? null],
    );
    if (data.category && data.category !== rows[0].category) {
      // Sprememba kategorije vpliva na "dokončanost" vseh nalog v stolpcu.
      await db.query(
        `UPDATE tasks SET completed_at = CASE WHEN $2 THEN COALESCE(completed_at, now()) ELSE NULL END WHERE column_id = $1`,
        [columnId, data.category === 'done'],
      );
    }
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

router.delete('/:id/columns/:columnId', async (req, res) => {
  const id = parseId(req.params.id);
  const columnId = parseId(req.params.columnId);
  const { moveTo } = parse(columnDeleteSchema, req.query);
  await withTransaction(async (db) => {
    await requireProjectRole(db, id, req.user.id, 'manager');
    const { rows: cols } = await db.query('SELECT id, name, category FROM board_columns WHERE project_id = $1 FOR UPDATE', [id]);
    const column = cols.find((c) => c.id === columnId);
    if (!column) throw notFound('Stolpec ne obstaja.');
    if (cols.length <= 1) throw conflict('Tabla mora imeti vsaj en stolpec.');
    const { rows: count } = await db.query('SELECT count(*) AS n FROM tasks WHERE column_id = $1', [columnId]);
    if (count[0].n > 0) {
      const target = cols.find((c) => c.id === moveTo && c.id !== columnId);
      if (!target) throw badRequest('Stolpec vsebuje naloge. Izberite stolpec, v katerega jih premaknete.');
      await db.query(
        `UPDATE tasks SET column_id = $2,
                completed_at = CASE WHEN $3 THEN COALESCE(completed_at, now()) ELSE NULL END,
                position = position + (SELECT COALESCE(max(position), 0) FROM tasks WHERE column_id = $2)
          WHERE column_id = $1`,
        [columnId, target.id, target.category === 'done'],
      );
    }
    await db.query('DELETE FROM board_columns WHERE id = $1', [columnId]);
    await logActivity(db, { projectId: id, actorId: req.user.id, action: 'column_deleted', details: { name: column.name } });
  });
  res.json({ project: await projects.getProjectDetail({ query }, id, req.user.id) });
});

// Oznake -------------------------------------------------------------------
router.post('/:id/labels', async (req, res) => {
  const id = parseId(req.params.id);
  const data = parse(labelSchema, req.body);
  await requireProjectRole({ query }, id, req.user.id, 'member');
  const { rows } = await query(
    `INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, lower(name)) DO NOTHING RETURNING id, name, color`,
    [id, data.name, data.color],
  );
  if (!rows[0]) throw conflict('Oznaka s tem imenom že obstaja.');
  res.status(201).json({ label: { ...rows[0], taskCount: 0 } });
});

router.patch('/:id/labels/:labelId', async (req, res) => {
  const id = parseId(req.params.id);
  const labelId = parseId(req.params.labelId);
  const data = parse(labelUpdateSchema, req.body);
  await requireProjectRole({ query }, id, req.user.id, 'manager');
  const { rows } = await query(
    `UPDATE labels SET name = COALESCE($3, name), color = COALESCE($4, color)
      WHERE id = $1 AND project_id = $2 RETURNING id, name, color`,
    [labelId, id, data.name ?? null, data.color ?? null],
  );
  if (!rows[0]) throw notFound('Oznaka ne obstaja.');
  res.json({ label: rows[0] });
});

router.delete('/:id/labels/:labelId', async (req, res) => {
  const id = parseId(req.params.id);
  const labelId = parseId(req.params.labelId);
  await requireProjectRole({ query }, id, req.user.id, 'manager');
  const { rowCount } = await query('DELETE FROM labels WHERE id = $1 AND project_id = $2', [labelId, id]);
  if (!rowCount) throw notFound('Oznaka ne obstaja.');
  res.status(204).end();
});

module.exports = router;
