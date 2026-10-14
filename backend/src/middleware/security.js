const { forbidden } = require('../lib/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Zaščita pred CSRF: vse spreminjajoče zahteve morajo imeti glavo X-Requested-With.
 * Brskalnik je med domenami ne more poslati brez CORS preflighta, ki ga API ne dovoli.
 * Sejni piškotek je poleg tega SameSite=Lax.
 */
function requireCsrfHeader(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('x-requested-with') !== 'MasterTask') {
    return next(forbidden('Zahteva je bila zavrnjena (manjka varnostna glava).'));
  }
  next();
}

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { requireCsrfHeader, noStore };
