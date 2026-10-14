class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const unauthorized = (message = 'Prijava je potrebna.') => new HttpError(401, message);
const forbidden = (message = 'Za to dejanje nimate dovoljenja.') => new HttpError(403, message);
const notFound = (message = 'Vir ne obstaja.') => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
