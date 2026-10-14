const { HttpError } = require('../lib/errors');
const config = require('../config');

const PG_ERRORS = {
  '23505': [409, 'Vnos s temi podatki že obstaja.'],
  '23503': [409, 'Povezan zapis ne obstaja ali je še v uporabi.'],
  '23514': [400, 'Podatki ne izpolnjujejo pravil.'],
  '22P02': [400, 'Neveljavna oblika podatkov.'],
  '22001': [400, 'Vrednost je predolga.'],
  '22007': [400, 'Neveljaven datum.'],
  '22008': [400, 'Neveljaven datum.'],
};

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Končna točka ne obstaja.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details ? { fields: err.details } : {}) });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Telo zahteve ni veljaven JSON.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Zahteva je prevelika.' });
  }
  if (err?.code && PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }
  if (!config.isTest) console.error('[api] Nepričakovana napaka:', err);
  // Podrobnosti napake nikoli ne pošljemo odjemalcu.
  res.status(500).json({ error: 'Prišlo je do nepričakovane napake. Poskusite znova.' });
}

module.exports = { notFoundHandler, errorHandler };
