const { z } = require('zod');
const { badRequest, notFound } = require('./errors');

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'];
const COLUMN_CATEGORIES = ['todo', 'in_progress', 'done'];
const PROJECT_ROLES = ['owner', 'manager', 'member', 'viewer'];

// Odstrani kontrolne znake (razen preloma vrstice in tabulatorja) in obreže presledke.
const clean = (value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

const text = (max, min = 1) =>
  z
    .string({ invalid_type_error: 'Vrednost mora biti besedilo.' })
    .transform(clean)
    .pipe(z.string().min(min, min === 1 ? 'Polje je obvezno.' : `Vsaj ${min} znakov.`).max(max, `Največ ${max} znakov.`));

const optionalText = (max) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().max(max, `Največ ${max} znakov.`));

const uuid = z.string().uuid('Neveljaven identifikator.');
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Barva mora biti v obliki #RRGGBB.');
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum mora biti v obliki LLLL-MM-DD.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Neveljaven datum.');
const nullableDate = z.union([isoDate, z.null(), z.literal('').transform(() => null)]);

function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw badRequest('Podatki niso veljavni.', fields);
  }
  return result.data;
}

function parseId(value) {
  if (!uuid.safeParse(value).success) throw notFound();
  return value;
}

// Seznam iz query niza "a,b,c" ali ponovljenega parametra.
const csv = (item) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(item));

module.exports = {
  z,
  parse,
  parseId,
  text,
  optionalText,
  uuid,
  color,
  isoDate,
  nullableDate,
  csv,
  PRIORITIES,
  PROJECT_STATUSES,
  COLUMN_CATEGORIES,
  PROJECT_ROLES,
};
