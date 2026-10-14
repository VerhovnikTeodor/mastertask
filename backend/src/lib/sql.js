const config = require('../config');

if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(config.timezone)) {
  throw new Error('APP_TIMEZONE ni veljaven časovni pas (npr. Europe/Ljubljana).');
}

/** Današnji datum v časovnem pasu aplikacije (ne v UTC strežnika). */
const TODAY = `(now() AT TIME ZONE '${config.timezone}')::date`;

/** Pogoj za "odprto" nalogo; pričakuje alias t (tasks) in c (board_columns). */
const OPEN_TASK = `(t.archived_at IS NULL AND c.category <> 'done')`;

/** Gradnik parametriziranih poizvedb: vrednosti gredo vedno v $n parametre. */
class Params {
  constructor(initial = []) {
    this.values = [...initial];
  }
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

const USER_BRIEF = (alias) => `json_build_object(
  'id', ${alias}.id,
  'firstName', ${alias}.first_name,
  'lastName', ${alias}.last_name,
  'email', ${alias}.email,
  'avatarColor', ${alias}.avatar_color,
  'isActive', ${alias}.is_active
)`;

module.exports = { TODAY, OPEN_TASK, Params, USER_BRIEF };
