const { TODAY, Params, USER_BRIEF } = require('../lib/sql');
const { badRequest, notFound, conflict } = require('../lib/errors');
const { logActivity, notify } = require('../lib/events');

const POSITION_STEP = 1024;

const TASK_CARD_SELECT = `
  SELECT t.id, t.project_id AS "projectId", t.number, p.key || '-' || t.number AS key,
         t.title, t.priority, t.column_id AS "columnId", t.position,
         t.start_date AS "startDate", t.due_date AS "dueDate",
         t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
         t.archived_at AS "archivedAt",
         json_build_object('id', c.id, 'name', c.name, 'category', c.category, 'color', c.color) AS status,
         json_build_object('id', p.id, 'name', p.name, 'key', p.key, 'color', p.color,
                           'archived', p.archived_at IS NOT NULL) AS project,
         (t.due_date IS NOT NULL AND t.due_date < ${TODAY} AND c.category <> 'done') AS "isOverdue",
         COALESCE((SELECT json_agg(${USER_BRIEF('u')} ORDER BY a.assigned_at)
                     FROM task_assignees a JOIN users u ON u.id = a.user_id
                    WHERE a.task_id = t.id), '[]') AS assignees,
         COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY l.name)
                     FROM task_labels tl JOIN labels l ON l.id = tl.label_id
                    WHERE tl.task_id = t.id), '[]') AS labels,
         (SELECT json_build_object('total', count(*), 'done', count(*) FILTER (WHERE ci.is_done))
            FROM checklist_items ci WHERE ci.task_id = t.id) AS checklist,
         (SELECT count(*) FROM comments cm WHERE cm.task_id = t.id) AS "commentCount",
         (SELECT count(*) FROM task_dependencies d
            JOIN tasks bt ON bt.id = d.blocked_by_id
            JOIN board_columns bc ON bc.id = bt.column_id
           WHERE d.task_id = t.id AND bc.category <> 'done' AND bt.archived_at IS NULL) AS "openBlockers"
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN board_columns c ON c.id = t.column_id`;

const PRIORITY_RANK = `CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

const SORTS = {
  created: 't.created_at',
  updated: 't.updated_at',
  due: 't.due_date',
  priority: PRIORITY_RANK,
  title: 'lower(t.title)',
  key: 'p.key, t.number',
};

/** Gradi WHERE del za seznam nalog; vse vrednosti so parametrizirane. */
function buildTaskFilters(filters, userId, p) {
  const where = [`t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ${p.add(userId)})`];

  if (filters.archived === 'true') {
    where.push('(t.archived_at IS NOT NULL OR p.archived_at IS NOT NULL)');
  } else {
    where.push('t.archived_at IS NULL AND p.archived_at IS NULL');
  }
  if (filters.projectId?.length) where.push(`t.project_id = ANY(${p.add(filters.projectId)}::uuid[])`);
  if (filters.columnId?.length) where.push(`t.column_id = ANY(${p.add(filters.columnId)}::uuid[])`);
  if (filters.status?.length) where.push(`c.category = ANY(${p.add(filters.status)}::text[])`);
  if (filters.priority?.length) where.push(`t.priority = ANY(${p.add(filters.priority)}::text[])`);

  if (filters.assignee?.length) {
    const ids = filters.assignee.map((a) => (a === 'me' ? userId : a)).filter((a) => a !== 'none');
    const parts = [];
    if (ids.length) {
      parts.push(`EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ANY(${p.add(ids)}::uuid[]))`);
    }
    if (filters.assignee.includes('none')) {
      parts.push('NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id)');
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  if (filters.createdBy) {
    where.push(`t.created_by = ${p.add(filters.createdBy === 'me' ? userId : filters.createdBy)}`);
  }
  if (filters.label?.length) {
    where.push(`EXISTS (SELECT 1 FROM task_labels tl JOIN labels l ON l.id = tl.label_id
                         WHERE tl.task_id = t.id AND lower(l.name) = ANY(${p.add(filters.label.map((l) => l.toLowerCase()))}::text[]))`);
  }

  switch (filters.due) {
    case 'overdue':
      where.push(`t.due_date < ${TODAY} AND c.category <> 'done'`);
      break;
    case 'today':
      where.push(`t.due_date = ${TODAY}`);
      break;
    case 'week':
      where.push(`t.due_date BETWEEN ${TODAY} AND ${TODAY} + 6`);
      break;
    case 'month':
      where.push(`t.due_date BETWEEN ${TODAY} AND ${TODAY} + 29`);
      break;
    case 'none':
      where.push('t.due_date IS NULL');
      break;
    default:
      break;
  }
  if (filters.dueFrom) where.push(`t.due_date >= ${p.add(filters.dueFrom)}::date`);
  if (filters.dueTo) where.push(`t.due_date <= ${p.add(filters.dueTo)}::date`);

  if (filters.search) {
    const term = filters.search.trim();
    const keyMatch = term.match(/^([A-Za-z][A-Za-z0-9]{1,5})-(\d+)$/);
    const like = p.add(`%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const parts = [`t.title ILIKE ${like}`, `t.description ILIKE ${like}`];
    if (keyMatch) {
      parts.push(`(p.key = ${p.add(keyMatch[1].toUpperCase())} AND t.number = ${p.add(Number(keyMatch[2]))})`);
    }
    where.push(`(${parts.join(' OR ')})`);
  }
  return where;
}

async function listTasks(db, userId, filters) {
  const p = new Params();
  const where = buildTaskFilters(filters, userId, p).join(' AND ');
  const sortExpr = SORTS[filters.sort] ?? SORTS.updated;
  const dir = filters.order === 'asc' ? 'ASC' : 'DESC';
  const nulls = filters.sort === 'due' ? 'NULLS LAST' : '';
  const pageSize = filters.pageSize;
  const offset = (filters.page - 1) * pageSize;

  const countParams = [...p.values];
  const limit = p.add(pageSize);
  const off = p.add(offset);

  const [items, count] = await Promise.all([
    db.query(
      `${TASK_CARD_SELECT}
        WHERE ${where}
        ORDER BY ${sortExpr} ${dir} ${nulls}, t.created_at DESC, t.id
        LIMIT ${limit} OFFSET ${off}`,
      p.values,
    ),
    db.query(
      `SELECT count(*) AS total FROM tasks t
         JOIN projects p ON p.id = t.project_id
         JOIN board_columns c ON c.id = t.column_id
        WHERE ${where}`,
      countParams,
    ),
  ]);
  return { items: items.rows, total: count.rows[0].total, page: filters.page, pageSize };
}

async function getTaskCard(db, taskId) {
  const { rows } = await db.query(`${TASK_CARD_SELECT} WHERE t.id = $1`, [taskId]);
  if (!rows[0]) throw notFound('Naloga ne obstaja.');
  return rows[0];
}

async function getBoardTasks(db, projectId) {
  const { rows } = await db.query(
    `${TASK_CARD_SELECT} WHERE t.project_id = $1 AND t.archived_at IS NULL ORDER BY t.position, t.created_at`,
    [projectId],
  );
  return rows;
}

async function getTaskDetail(db, taskId) {
  const card = await getTaskCard(db, taskId);
  const [extra, checklist, blockedBy, blocking] = await Promise.all([
    db.query(
      `SELECT t.description, ${USER_BRIEF('u')} AS "createdBy"
         FROM tasks t LEFT JOIN users u ON u.id = t.created_by WHERE t.id = $1`,
      [taskId],
    ),
    db.query(
      `SELECT id, content, is_done AS "isDone", position, created_at AS "createdAt"
         FROM checklist_items WHERE task_id = $1 ORDER BY position, created_at`,
      [taskId],
    ),
    db.query(
      `SELECT bt.id, p.key || '-' || bt.number AS key, bt.title,
              json_build_object('name', c.name, 'category', c.category, 'color', c.color) AS status
         FROM task_dependencies d
         JOIN tasks bt ON bt.id = d.blocked_by_id
         JOIN projects p ON p.id = bt.project_id
         JOIN board_columns c ON c.id = bt.column_id
        WHERE d.task_id = $1 ORDER BY bt.number`,
      [taskId],
    ),
    db.query(
      `SELECT bt.id, p.key || '-' || bt.number AS key, bt.title,
              json_build_object('name', c.name, 'category', c.category, 'color', c.color) AS status
         FROM task_dependencies d
         JOIN tasks bt ON bt.id = d.task_id
         JOIN projects p ON p.id = bt.project_id
         JOIN board_columns c ON c.id = bt.column_id
        WHERE d.blocked_by_id = $1 ORDER BY bt.number`,
      [taskId],
    ),
  ]);
  const createdBy = extra.rows[0].createdBy?.id ? extra.rows[0].createdBy : null;
  return {
    ...card,
    description: extra.rows[0].description,
    createdBy,
    checklistItems: checklist.rows,
    blockedBy: blockedBy.rows,
    blocking: blocking.rows,
  };
}

async function getColumn(db, projectId, columnId) {
  const { rows } = await db.query(
    'SELECT id, name, category FROM board_columns WHERE id = $1 AND project_id = $2',
    [columnId, projectId],
  );
  if (!rows[0]) throw badRequest('Podatki niso veljavni.', { columnId: 'Stolpec ne pripada temu projektu.' });
  return rows[0];
}

async function getDefaultColumn(db, projectId) {
  const { rows } = await db.query(
    `SELECT id, name, category FROM board_columns WHERE project_id = $1
      ORDER BY (category = 'todo') DESC, position LIMIT 1`,
    [projectId],
  );
  if (!rows[0]) throw conflict('Projekt nima nobenega stolpca.');
  return rows[0];
}

async function assertProjectMembers(db, projectId, userIds) {
  if (!userIds.length) return;
  const { rows } = await db.query(
    `SELECT m.user_id FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1 AND m.user_id = ANY($2::uuid[]) AND u.is_active`,
    [projectId, userIds],
  );
  if (rows.length !== new Set(userIds).size) {
    throw badRequest('Podatki niso veljavni.', { assigneeIds: 'Odgovorne osebe morajo biti aktivni člani projekta.' });
  }
}

async function assertProjectLabels(db, projectId, labelIds) {
  if (!labelIds.length) return;
  const { rows } = await db.query('SELECT id FROM labels WHERE project_id = $1 AND id = ANY($2::uuid[])', [
    projectId,
    labelIds,
  ]);
  if (rows.length !== new Set(labelIds).size) {
    throw badRequest('Podatki niso veljavni.', { labelIds: 'Oznake morajo pripadati projektu.' });
  }
}

async function nextPositionAtEnd(db, columnId) {
  const { rows } = await db.query(
    'SELECT COALESCE(max(position), 0) + $2 AS pos FROM tasks WHERE column_id = $1 AND archived_at IS NULL',
    [columnId, POSITION_STEP],
  );
  return rows[0].pos;
}

async function createTask(db, { projectId, actorId, data }) {
  const column = data.columnId ? await getColumn(db, projectId, data.columnId) : await getDefaultColumn(db, projectId);
  const assigneeIds = [...new Set(data.assigneeIds ?? [])];
  const labelIds = [...new Set(data.labelIds ?? [])];
  await assertProjectMembers(db, projectId, assigneeIds);
  await assertProjectLabels(db, projectId, labelIds);
  if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
    throw badRequest('Podatki niso veljavni.', { dueDate: 'Rok ne more biti pred začetkom.' });
  }

  // Zaklep vrstice projekta zagotovi zaporedne in unikatne številke nalog.
  const { rows: counter } = await db.query(
    'UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter',
    [projectId],
  );
  const position = await nextPositionAtEnd(db, column.id);
  const { rows } = await db.query(
    `INSERT INTO tasks (project_id, number, title, description, column_id, position, priority,
                        start_date, due_date, completed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $10 THEN now() END, $11)
     RETURNING id, number`,
    [
      projectId,
      counter[0].task_counter,
      data.title,
      data.description ?? '',
      column.id,
      position,
      data.priority ?? 'medium',
      data.startDate ?? null,
      data.dueDate ?? null,
      column.category === 'done',
      actorId,
    ],
  );
  const task = rows[0];
  if (assigneeIds.length) {
    await db.query('INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])', [task.id, assigneeIds]);
  }
  if (labelIds.length) {
    await db.query('INSERT INTO task_labels (task_id, label_id) SELECT $1, unnest($2::uuid[])', [task.id, labelIds]);
  }
  await logActivity(db, {
    projectId,
    taskId: task.id,
    actorId,
    action: 'task_created',
    details: { title: data.title, number: task.number, column: column.name },
  });
  await notify(db, {
    userIds: assigneeIds,
    actorId,
    type: 'task_assigned',
    projectId,
    taskId: task.id,
    details: { title: data.title },
  });
  return getTaskCard(db, task.id);
}

const TRACKED_FIELDS = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  startDate: 'start_date',
  dueDate: 'due_date',
};

async function updateTask(db, { task, actorId, data }) {
  const { rows: currentRows } = await db.query(
    `SELECT t.title, t.description, t.priority, t.start_date AS "startDate", t.due_date AS "dueDate",
            t.column_id AS "columnId", t.created_by AS "createdBy", c.name AS "columnName", c.category
       FROM tasks t JOIN board_columns c ON c.id = t.column_id WHERE t.id = $1 FOR UPDATE OF t`,
    [task.id],
  );
  const current = currentRows[0];

  const startDate = data.startDate !== undefined ? data.startDate : current.startDate;
  const dueDate = data.dueDate !== undefined ? data.dueDate : current.dueDate;
  if (startDate && dueDate && dueDate < startDate) {
    throw badRequest('Podatki niso veljavni.', { dueDate: 'Rok ne more biti pred začetkom.' });
  }

  const sets = [];
  const p = new Params([task.id]);
  const changes = [];
  for (const [field, column] of Object.entries(TRACKED_FIELDS)) {
    if (data[field] === undefined || data[field] === current[field]) continue;
    sets.push(`${column} = ${p.add(data[field])}`);
    changes.push(field === 'description' ? { field } : { field, from: current[field], to: data[field] });
  }

  if (data.columnId && data.columnId !== current.columnId) {
    const column = await getColumn(db, task.projectId, data.columnId);
    sets.push(`column_id = ${p.add(column.id)}`, `position = ${p.add(await nextPositionAtEnd(db, column.id))}`);
    sets.push(`completed_at = ${column.category === 'done' ? 'COALESCE(completed_at, now())' : 'NULL'}`);
    changes.push({ field: 'status', from: current.columnName, to: column.name });
    if (column.category === 'done' && current.category !== 'done') {
      await notify(db, {
        userIds: [current.createdBy],
        actorId,
        type: 'task_completed',
        projectId: task.projectId,
        taskId: task.id,
        details: { title: current.title },
      });
    }
  }

  if (sets.length) {
    await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, p.values);
  }

  if (data.assigneeIds) {
    const ids = [...new Set(data.assigneeIds)];
    const { rows: before } = await db.query('SELECT user_id FROM task_assignees WHERE task_id = $1', [task.id]);
    const beforeIds = before.map((r) => r.user_id);
    const added = ids.filter((id) => !beforeIds.includes(id));
    const removed = beforeIds.filter((id) => !ids.includes(id));
    // Odstranjenih (npr. bivših članov) ne preverjamo, novi morajo biti aktivni člani projekta.
    await assertProjectMembers(db, task.projectId, added);
    if (removed.length) {
      await db.query('DELETE FROM task_assignees WHERE task_id = $1 AND user_id = ANY($2::uuid[])', [task.id, removed]);
    }
    if (added.length) {
      await db.query('INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::uuid[])', [task.id, added]);
      await notify(db, {
        userIds: added,
        actorId,
        type: 'task_assigned',
        projectId: task.projectId,
        taskId: task.id,
        details: { title: data.title ?? current.title },
      });
    }
    if (added.length || removed.length) {
      const { rows: names } = await db.query(
        `SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id = ANY($1::uuid[])`,
        [[...added, ...removed]],
      );
      const nameOf = (id) => names.find((n) => n.id === id)?.name ?? 'Neznan uporabnik';
      changes.push({ field: 'assignees', added: added.map(nameOf), removed: removed.map(nameOf) });
    }
  }

  if (data.labelIds) {
    const ids = [...new Set(data.labelIds)];
    await assertProjectLabels(db, task.projectId, ids);
    const { rows: before } = await db.query(
      'SELECT l.id, l.name FROM task_labels tl JOIN labels l ON l.id = tl.label_id WHERE tl.task_id = $1',
      [task.id],
    );
    const beforeIds = before.map((r) => r.id);
    const added = ids.filter((id) => !beforeIds.includes(id));
    const removed = beforeIds.filter((id) => !ids.includes(id));
    if (removed.length) {
      await db.query('DELETE FROM task_labels WHERE task_id = $1 AND label_id = ANY($2::uuid[])', [task.id, removed]);
    }
    if (added.length) {
      await db.query('INSERT INTO task_labels (task_id, label_id) SELECT $1, unnest($2::uuid[])', [task.id, added]);
    }
    if (added.length || removed.length) {
      const { rows: names } = await db.query('SELECT id, name FROM labels WHERE id = ANY($1::uuid[])', [
        [...added, ...removed],
      ]);
      const nameOf = (id) => names.find((n) => n.id === id)?.name ?? '';
      changes.push({ field: 'labels', added: added.map(nameOf), removed: removed.map(nameOf) });
    }
  }

  if (changes.length) {
    if (!sets.length) await db.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [task.id]);
    await logActivity(db, {
      projectId: task.projectId,
      taskId: task.id,
      actorId,
      action: 'task_updated',
      details: { title: data.title ?? current.title, number: task.number, changes },
    });
  }
  return getTaskCard(db, task.id);
}

/** Premik naloge na indeks znotraj (morda drugega) stolpca. */
async function moveTask(db, { task, actorId, columnId, index }) {
  const column = await getColumn(db, task.projectId, columnId);
  // Zaklep stolpca serializira hkratne premike v isti stolpec.
  await db.query('SELECT id FROM board_columns WHERE id = $1 FOR UPDATE', [column.id]);
  const { rows: currentRows } = await db.query(
    `SELECT t.column_id AS "columnId", t.created_by AS "createdBy", t.title, c.name, c.category
       FROM tasks t JOIN board_columns c ON c.id = t.column_id WHERE t.id = $1 FOR UPDATE OF t`,
    [task.id],
  );
  const current = currentRows[0];

  const loadSiblings = async () =>
    (
      await db.query(
        `SELECT id, position FROM tasks
          WHERE column_id = $1 AND archived_at IS NULL AND id <> $2
          ORDER BY position, created_at`,
        [column.id, task.id],
      )
    ).rows;

  let siblings = await loadSiblings();
  const at = Math.max(0, Math.min(index, siblings.length));
  const computePosition = () => {
    const prev = siblings[at - 1]?.position;
    const next = siblings[at]?.position;
    if (prev === undefined && next === undefined) return POSITION_STEP;
    if (prev === undefined) return next - POSITION_STEP;
    if (next === undefined) return prev + POSITION_STEP;
    return (prev + next) / 2;
  };
  let position = computePosition();
  const prev = siblings[at - 1]?.position;
  const next = siblings[at]?.position;
  if (prev !== undefined && next !== undefined && next - prev < 1e-6) {
    // Razmik med pozicijami je premajhen: renormaliziramo stolpec.
    await db.query(
      `UPDATE tasks SET position = s.rn * ${POSITION_STEP}
         FROM (SELECT id, row_number() OVER (ORDER BY position, created_at) AS rn
                 FROM tasks WHERE column_id = $1 AND archived_at IS NULL AND id <> $2) s
        WHERE tasks.id = s.id`,
      [column.id, task.id],
    );
    siblings = await loadSiblings();
    position = computePosition();
  }

  const statusChanged = current.columnId !== column.id;
  await db.query(
    `UPDATE tasks SET column_id = $2, position = $3,
            completed_at = CASE WHEN $4 THEN COALESCE(completed_at, now()) ELSE NULL END
      WHERE id = $1`,
    [task.id, column.id, position, column.category === 'done'],
  );
  if (statusChanged) {
    await logActivity(db, {
      projectId: task.projectId,
      taskId: task.id,
      actorId,
      action: 'task_moved',
      details: { title: current.title, number: task.number, from: current.name, to: column.name },
    });
    if (column.category === 'done' && current.category !== 'done') {
      await notify(db, {
        userIds: [current.createdBy],
        actorId,
        type: 'task_completed',
        projectId: task.projectId,
        taskId: task.id,
        details: { title: current.title },
      });
    }
  }
  return getTaskCard(db, task.id);
}

async function addDependency(db, { task, blockedById, actorId }) {
  const { rows } = await db.query('SELECT id, number, title FROM tasks WHERE id = $1 AND project_id = $2', [
    blockedById,
    task.projectId,
  ]);
  if (!rows[0]) throw badRequest('Podatki niso veljavni.', { blockedById: 'Naloga mora biti v istem projektu.' });
  if (blockedById === task.id) throw badRequest('Naloga ne more biti odvisna sama od sebe.');

  const { rows: cycle } = await db.query(
    `WITH RECURSIVE chain(id) AS (
       SELECT blocked_by_id FROM task_dependencies WHERE task_id = $1
       UNION
       SELECT d.blocked_by_id FROM task_dependencies d JOIN chain ON d.task_id = chain.id
     )
     SELECT 1 FROM chain WHERE id = $2 LIMIT 1`,
    [blockedById, task.id],
  );
  if (cycle.length) throw conflict('Ta odvisnost bi ustvarila krožno povezavo med nalogami.');

  const inserted = await db.query(
    'INSERT INTO task_dependencies (task_id, blocked_by_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [task.id, blockedById],
  );
  if (inserted.rowCount) {
    await logActivity(db, {
      projectId: task.projectId,
      taskId: task.id,
      actorId,
      action: 'dependency_added',
      details: { title: task.title, number: task.number, blockedBy: `${task.projectKey}-${rows[0].number}` },
    });
  }
}

module.exports = {
  TASK_CARD_SELECT,
  listTasks,
  getTaskCard,
  getTaskDetail,
  getBoardTasks,
  createTask,
  updateTask,
  moveTask,
  addDependency,
};
