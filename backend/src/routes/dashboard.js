const express = require('express');
const config = require('../config');
const { query } = require('../db/pool');
const { TODAY } = require('../lib/sql');
const { TASK_CARD_SELECT } = require('../services/tasks');
const { listProjects } = require('../services/projects');
const { listActivity } = require('../services/activity');

const router = express.Router();

const VISIBLE = `t.project_id IN (SELECT project_id FROM project_members WHERE user_id = $1)
  AND t.archived_at IS NULL AND p.archived_at IS NULL`;
const MINE = 'EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = $1)';
const OPEN = "c.category <> 'done'";

router.get('/', async (req, res) => {
  const uid = [req.user.id];
  const [stats, myTasks, upcoming, overdue, recent, throughput, projects, activity] = await Promise.all([
    query(
      `SELECT
         count(*) FILTER (WHERE ${MINE} AND ${OPEN}) AS "myOpen",
         count(*) FILTER (WHERE ${MINE} AND c.category = 'in_progress') AS "myInProgress",
         count(*) FILTER (WHERE ${MINE} AND ${OPEN} AND t.due_date < ${TODAY}) AS "myOverdue",
         count(*) FILTER (WHERE ${MINE} AND ${OPEN} AND t.due_date BETWEEN ${TODAY} AND ${TODAY} + 7) AS "myDueSoon",
         count(*) FILTER (WHERE ${MINE} AND c.category = 'done' AND t.completed_at > now() - interval '7 days') AS "myCompletedWeek",
         count(*) FILTER (WHERE ${OPEN} AND t.due_date < ${TODAY}) AS "teamOverdue"
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN board_columns c ON c.id = t.column_id
      WHERE ${VISIBLE}`,
      uid,
    ),
    query(
      `${TASK_CARD_SELECT}
        WHERE ${VISIBLE} AND ${MINE} AND ${OPEN}
        ORDER BY (t.due_date < ${TODAY}) DESC NULLS LAST, t.due_date ASC NULLS LAST,
                 CASE t.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
        LIMIT 8`,
      uid,
    ),
    query(
      `${TASK_CARD_SELECT}
        WHERE ${VISIBLE} AND ${OPEN} AND t.due_date BETWEEN ${TODAY} AND ${TODAY} + 14
        ORDER BY t.due_date, t.priority LIMIT 8`,
      uid,
    ),
    query(
      `${TASK_CARD_SELECT}
        WHERE ${VISIBLE} AND ${OPEN} AND t.due_date < ${TODAY}
        ORDER BY t.due_date LIMIT 8`,
      uid,
    ),
    query(`${TASK_CARD_SELECT} WHERE ${VISIBLE} ORDER BY t.updated_at DESC LIMIT 6`, uid),
    query(
      `SELECT d::date AS day,
              (SELECT count(*) FROM tasks t
                 JOIN projects p ON p.id = t.project_id
                 JOIN board_columns c ON c.id = t.column_id
                WHERE ${VISIBLE} AND c.category = 'done'
                  AND (t.completed_at AT TIME ZONE '${config.timezone}')::date = d::date) AS completed,
              (SELECT count(*) FROM tasks t
                 JOIN projects p ON p.id = t.project_id
                WHERE ${VISIBLE}
                  AND (t.created_at AT TIME ZONE '${config.timezone}')::date = d::date) AS created
         FROM generate_series(${TODAY} - 13, ${TODAY}, interval '1 day') d
        ORDER BY d`,
      uid,
    ),
    listProjects({ query }, req.user.id, { archived: 'false', sort: 'updated' }),
    listActivity({ query }, { userId: req.user.id, limit: 12 }),
  ]);

  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning');
  res.json({
    stats: {
      ...stats.rows[0],
      activeProjects: activeProjects.length,
      projectsNeedingAttention: projects.filter((p) => p.health === 'at_risk' || p.health === 'off_track').length,
    },
    myTasks: myTasks.rows,
    upcoming: upcoming.rows,
    overdue: overdue.rows,
    recentlyUpdated: recent.rows,
    throughput: throughput.rows,
    projects: activeProjects.slice(0, 6),
    activity,
  });
});

module.exports = router;
