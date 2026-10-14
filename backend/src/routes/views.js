const express = require('express');
const { query } = require('../db/pool');
const { z, parse, parseId, text } = require('../lib/validation');
const { notFound, conflict } = require('../lib/errors');

const router = express.Router();

const filterValue = z.union([z.string().max(200), z.array(z.string().max(100)).max(50)]);
const createSchema = z.object({
  name: text(60),
  filters: z.record(z.string().max(30), filterValue).refine((f) => Object.keys(f).length <= 20, 'Preveč filtrov.'),
});

router.get('/', async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, filters, created_at AS "createdAt" FROM saved_views WHERE user_id = $1 ORDER BY lower(name)',
    [req.user.id],
  );
  res.json({ items: rows });
});

router.post('/', async (req, res) => {
  const data = parse(createSchema, req.body);
  const { rows: count } = await query('SELECT count(*) AS n FROM saved_views WHERE user_id = $1', [req.user.id]);
  if (count[0].n >= 30) throw conflict('Shranite lahko največ 30 pogledov.');
  const { rows } = await query(
    `INSERT INTO saved_views (user_id, name, filters) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, lower(name)) DO UPDATE SET filters = EXCLUDED.filters
     RETURNING id, name, filters, created_at AS "createdAt"`,
    [req.user.id, data.name, JSON.stringify(data.filters)],
  );
  res.status(201).json({ view: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rowCount } = await query('DELETE FROM saved_views WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (!rowCount) throw notFound('Pogled ne obstaja.');
  res.status(204).end();
});

module.exports = router;
