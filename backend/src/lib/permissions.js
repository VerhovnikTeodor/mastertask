const { notFound, forbidden, conflict } = require('./errors');

const ROLE_RANK = { viewer: 1, member: 2, manager: 3, owner: 4 };

const ROLE_LABEL = {
  viewer: 'opazovalec',
  member: 'član',
  manager: 'vodja',
  owner: 'lastnik',
};

function hasRole(role, minRole) {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];
}

/**
 * Preveri, da je uporabnik član projekta z vsaj zahtevano vlogo.
 * Nečlani dobijo 404, da ne razkrivamo obstoja projekta.
 * Arhivirani projekti so samo za branje (razen če je allowArchived).
 */
async function requireProjectRole(db, projectId, userId, minRole = 'viewer', { allowArchived = false } = {}) {
  const { rows } = await db.query(
    `SELECT p.id, p.key, p.name, p.archived_at AS "archivedAt", m.role
       FROM projects p
       JOIN project_members m ON m.project_id = p.id AND m.user_id = $2
      WHERE p.id = $1`,
    [projectId, userId],
  );
  const access = rows[0];
  if (!access) throw notFound('Projekt ne obstaja ali do njega nimate dostopa.');
  if (!hasRole(access.role, minRole)) {
    throw forbidden(`Za to dejanje potrebujete vlogo »${ROLE_LABEL[minRole]}« ali višjo.`);
  }
  if (access.archivedAt && minRole !== 'viewer' && !allowArchived) {
    throw conflict('Projekt je arhiviran in je na voljo samo za branje.');
  }
  return access;
}

async function requireTaskAccess(db, taskId, userId, minRole = 'viewer', { allowArchivedTask = false } = {}) {
  const { rows } = await db.query(
    `SELECT t.id, t.project_id AS "projectId", t.number, t.title, t.created_by AS "createdBy",
            t.archived_at AS "archivedAt", p.key AS "projectKey", p.archived_at AS "projectArchivedAt",
            m.role
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN project_members m ON m.project_id = t.project_id AND m.user_id = $2
      WHERE t.id = $1`,
    [taskId, userId],
  );
  const task = rows[0];
  if (!task) throw notFound('Naloga ne obstaja ali do nje nimate dostopa.');
  if (!hasRole(task.role, minRole)) {
    throw forbidden(`Za to dejanje potrebujete vlogo »${ROLE_LABEL[minRole]}« ali višjo.`);
  }
  if (minRole !== 'viewer') {
    if (task.projectArchivedAt) throw conflict('Projekt je arhiviran in je na voljo samo za branje.');
    if (task.archivedAt && !allowArchivedTask) {
      throw conflict('Naloga je arhivirana. Za urejanje jo najprej obnovite.');
    }
  }
  return task;
}

module.exports = { ROLE_RANK, hasRole, requireProjectRole, requireTaskAccess };
