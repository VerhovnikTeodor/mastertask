const { TODAY, Params, USER_BRIEF } = require('../lib/sql');
const { notFound, badRequest, conflict } = require('../lib/errors');
const { logActivity, notify } = require('../lib/events');

const DEFAULT_COLUMNS = [
  { name: 'Za narediti', category: 'todo', color: '#8B8D98' },
  { name: 'V teku', category: 'in_progress', color: '#3E63DD' },
  { name: 'V pregledu', category: 'in_progress', color: '#8E4EC6' },
  { name: 'Končano', category: 'done', color: '#30A46C' },
];

const DEFAULT_LABELS = [
  { name: 'Napaka', color: '#E5484D' },
  { name: 'Funkcionalnost', color: '#3E63DD' },
  { name: 'Izboljšava', color: '#12A594' },
  { name: 'Dizajn', color: '#D6409F' },
  { name: 'Dokumentacija', color: '#F76B15' },
];

const STATS_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE c.category = 'done') AS done,
           count(*) FILTER (WHERE c.category = 'in_progress') AS in_progress,
           count(*) FILTER (WHERE c.category <> 'done') AS open,
           count(*) FILTER (WHERE c.category <> 'done' AND t.due_date < ${TODAY}) AS overdue,
           count(*) FILTER (WHERE c.category <> 'done' AND t.due_date BETWEEN ${TODAY} AND ${TODAY} + 7) AS due_soon
      FROM tasks t JOIN board_columns c ON c.id = t.column_id
     WHERE t.project_id = p.id AND t.archived_at IS NULL
  ) s ON true`;

const PROJECT_FIELDS = `
  p.id, p.key, p.name, p.description, p.status, p.priority, p.color,
  p.start_date AS "startDate", p.due_date AS "dueDate", p.archived_at AS "archivedAt",
  p.created_at AS "createdAt", p.updated_at AS "updatedAt",
  (p.due_date IS NOT NULL AND p.due_date < ${TODAY}) AS "isPastDue",
  (p.due_date - ${TODAY}) AS "daysLeft",
  json_build_object('total', s.total, 'done', s.done, 'inProgress', s.in_progress, 'open', s.open,
                    'overdue', s.overdue, 'dueSoon', s.due_soon) AS stats`;

/** Ocena "zdravja" projekta, da uporabnik takoj vidi, kaj potrebuje pozornost. */
function withHealth(project) {
  const { stats } = project;
  const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  let health = 'on_track';
  if (project.status === 'completed') health = 'done';
  else if (project.status === 'on_hold') health = 'paused';
  else if (project.isPastDue || stats.overdue >= 3) health = 'off_track';
  else if (stats.overdue > 0 || (project.daysLeft !== null && project.daysLeft <= 7 && progress < 70)) health = 'at_risk';
  return { ...project, progress, health };
}

const SORTS = {
  updated: 'p.updated_at DESC',
  created: 'p.created_at DESC',
  name: 'lower(p.name) ASC',
  due: 'p.due_date ASC NULLS LAST',
  priority: "CASE p.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC",
  progress: 'CASE WHEN s.total = 0 THEN 0 ELSE s.done::float / s.total END DESC',
};

async function listProjects(db, userId, filters) {
  const p = new Params([userId]);
  const where = [];
  if (filters.archived === 'true') where.push('p.archived_at IS NOT NULL');
  else if (filters.archived !== 'all') where.push('p.archived_at IS NULL');
  if (filters.status?.length) where.push(`p.status = ANY(${p.add(filters.status)}::text[])`);
  if (filters.priority?.length) where.push(`p.priority = ANY(${p.add(filters.priority)}::text[])`);
  if (filters.role === 'owner') where.push("m.role = 'owner'");
  if (filters.search) {
    const like = p.add(`%${filters.search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(p.name ILIKE ${like} OR p.key ILIKE ${like} OR p.description ILIKE ${like})`);
  }

  const { rows } = await db.query(
    `SELECT ${PROJECT_FIELDS}, m.role AS "myRole",
            mem.members, mem.member_count AS "memberCount"
       FROM projects p
       JOIN project_members m ON m.project_id = p.id AND m.user_id = $1
       ${STATS_LATERAL}
       LEFT JOIN LATERAL (
         SELECT count(*) AS member_count,
                COALESCE(json_agg(x.u ORDER BY x.rank DESC, x.joined_at) FILTER (WHERE x.rn <= 5), '[]') AS members
           FROM (
             SELECT ${USER_BRIEF('u')} AS u, pm.joined_at,
                    CASE pm.role WHEN 'owner' THEN 4 WHEN 'manager' THEN 3 WHEN 'member' THEN 2 ELSE 1 END AS rank,
                    row_number() OVER (ORDER BY CASE pm.role WHEN 'owner' THEN 4 WHEN 'manager' THEN 3 WHEN 'member' THEN 2 ELSE 1 END DESC, pm.joined_at) AS rn
               FROM project_members pm JOIN users u ON u.id = pm.user_id
              WHERE pm.project_id = p.id
           ) x
       ) mem ON true
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${SORTS[filters.sort] ?? SORTS.updated}, p.id`,
    p.values,
  );
  return rows.map(withHealth);
}

async function getProjectDetail(db, projectId, userId) {
  const { rows } = await db.query(
    `SELECT ${PROJECT_FIELDS}, m.role AS "myRole",
            ${USER_BRIEF('cu')} AS "createdBy"
       FROM projects p
       JOIN project_members m ON m.project_id = p.id AND m.user_id = $2
       LEFT JOIN users cu ON cu.id = p.created_by
       ${STATS_LATERAL}
      WHERE p.id = $1`,
    [projectId, userId],
  );
  if (!rows[0]) throw notFound('Projekt ne obstaja ali do njega nimate dostopa.');
  const [columns, members, labels] = await Promise.all([
    db.query(
      `SELECT c.id, c.name, c.category, c.color, c.position, c.wip_limit AS "wipLimit",
              (SELECT count(*) FROM tasks t WHERE t.column_id = c.id AND t.archived_at IS NULL) AS "taskCount"
         FROM board_columns c WHERE c.project_id = $1 ORDER BY c.position`,
      [projectId],
    ),
    listMembers(db, projectId),
    db.query(
      `SELECT l.id, l.name, l.color,
              (SELECT count(*) FROM task_labels tl JOIN tasks t ON t.id = tl.task_id
                WHERE tl.label_id = l.id AND t.archived_at IS NULL) AS "taskCount"
         FROM labels l WHERE l.project_id = $1 ORDER BY l.name`,
      [projectId],
    ),
  ]);
  const project = withHealth(rows[0]);
  if (!project.createdBy?.id) project.createdBy = null;
  return { ...project, columns: columns.rows, members, labels: labels.rows };
}

async function listMembers(db, projectId) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.first_name AS "firstName", u.last_name AS "lastName", u.job_title AS "jobTitle",
            u.avatar_color AS "avatarColor", u.is_active AS "isActive", m.role, m.joined_at AS "joinedAt",
            (SELECT count(*) FROM task_assignees a
               JOIN tasks t ON t.id = a.task_id JOIN board_columns c ON c.id = t.column_id
              WHERE a.user_id = u.id AND t.project_id = $1 AND t.archived_at IS NULL AND c.category <> 'done') AS "openTasks",
            (SELECT count(*) FROM task_assignees a
               JOIN tasks t ON t.id = a.task_id JOIN board_columns c ON c.id = t.column_id
              WHERE a.user_id = u.id AND t.project_id = $1 AND t.archived_at IS NULL AND c.category <> 'done'
                AND t.due_date < ${TODAY}) AS "overdueTasks"
       FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = $1
      ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'manager' THEN 2 WHEN 'member' THEN 3 ELSE 4 END,
               u.first_name, u.last_name`,
    [projectId],
  );
  return rows;
}

function asciiFold(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

async function generateKey(db, name) {
  const words = asciiFold(name).replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.length >= 2 ? words.slice(0, 4).map((w) => w[0]).join('') : (words[0] ?? 'PRJ').slice(0, 4);
  if (!/^[A-Z]/.test(base)) base = `P${base}`;
  base = base.padEnd(2, 'X').slice(0, 4);
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`.slice(0, 6);
    const { rowCount } = await db.query('SELECT 1 FROM projects WHERE key = $1', [candidate]);
    if (!rowCount) return candidate;
  }
  throw conflict('Ni bilo mogoče ustvariti unikatne oznake projekta.');
}

async function createProject(db, { actorId, data }) {
  if (data.startDate && data.dueDate && data.dueDate < data.startDate) {
    throw badRequest('Podatki niso veljavni.', { dueDate: 'Rok ne more biti pred začetkom.' });
  }
  let key = data.key;
  if (key) {
    const { rowCount } = await db.query('SELECT 1 FROM projects WHERE key = $1', [key]);
    if (rowCount) throw badRequest('Podatki niso veljavni.', { key: 'Ta oznaka je že v uporabi.' });
  } else {
    key = await generateKey(db, data.name);
  }

  const { rows } = await db.query(
    `INSERT INTO projects (key, name, description, status, priority, color, start_date, due_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      key,
      data.name,
      data.description ?? '',
      data.status ?? 'active',
      data.priority ?? 'medium',
      data.color ?? '#3E63DD',
      data.startDate ?? null,
      data.dueDate ?? null,
      actorId,
    ],
  );
  const projectId = rows[0].id;
  await db.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')", [projectId, actorId]);

  for (const [i, col] of DEFAULT_COLUMNS.entries()) {
    await db.query('INSERT INTO board_columns (project_id, name, category, color, position) VALUES ($1, $2, $3, $4, $5)', [
      projectId,
      col.name,
      col.category,
      col.color,
      i,
    ]);
  }
  for (const label of DEFAULT_LABELS) {
    await db.query('INSERT INTO labels (project_id, name, color) VALUES ($1, $2, $3)', [projectId, label.name, label.color]);
  }

  const memberIds = [...new Set(data.memberIds ?? [])].filter((id) => id !== actorId);
  if (memberIds.length) {
    const { rows: valid } = await db.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND is_active', [memberIds]);
    if (valid.length !== memberIds.length) {
      throw badRequest('Podatki niso veljavni.', { memberIds: 'Nekateri izbrani uporabniki ne obstajajo ali niso aktivni.' });
    }
    await db.query(
      "INSERT INTO project_members (project_id, user_id, role) SELECT $1, unnest($2::uuid[]), 'member'",
      [projectId, memberIds],
    );
    await notify(db, {
      userIds: memberIds,
      actorId,
      type: 'project_added',
      projectId,
      details: { name: data.name, role: 'member' },
    });
  }

  await logActivity(db, { projectId, actorId, action: 'project_created', details: { name: data.name } });
  return projectId;
}

module.exports = { listProjects, getProjectDetail, listMembers, createProject, generateKey, DEFAULT_COLUMNS };
