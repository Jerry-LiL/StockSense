const { AppError } = require('./errors');

function parseBody(req) {
  if (req.body === undefined || req.body === null) return {};
  if (typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new AppError(400, 'Expected a JSON object');
  }
  return req.body;
}

function str(body, field, { required = true, max = 200, min = 1 } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    if (!required) return null;
    throw new AppError(400, `${field} is required`);
  }
  if (typeof raw !== 'string') throw new AppError(400, `${field} must be a string`);
  const value = raw.trim();
  if (value.length < min) throw new AppError(400, `${field} is too short`);
  if (value.length > max) throw new AppError(400, `${field} is too long`);
  return value;
}

function passwordField(body) {
  const raw = body.password;
  if (typeof raw !== 'string' || raw.length < 8 || raw.length > 72) {
    throw new AppError(400, 'password must be 8 to 72 characters');
  }
  return raw;
}

function emailField(body, field = 'email', { required = true } = {}) {
  const value = str(body, field, { required, max: 254 });
  if (value === null) return null;
  const email = value.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, `${field} is invalid`);
  }
  return email;
}

function intField(body, field, { required = true, min = 0, max = 1000000 } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return null;
    throw new AppError(400, `${field} is required`);
  }
  const value = typeof raw === 'number'
    ? raw
    : (typeof raw === 'string' && /^-?\d+$/.test(raw) ? Number(raw) : NaN);
  if (!Number.isInteger(value)) throw new AppError(400, `${field} must be an integer`);
  if (value < min || value > max) throw new AppError(400, `${field} is out of range`);
  return value;
}

function money(body, field, { required = false } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return null;
    throw new AppError(400, `${field} is required`);
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new AppError(400, `${field} must be a number`);
  }
  const text = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new AppError(400, `${field} must be a non-negative amount with up to 2 decimals`);
  }
  const [whole, frac = ''] = text.split('.');
  if (whole.length > 8) throw new AppError(400, `${field} is too large`);
  return `${whole}.${frac.padEnd(2, '0')}`;
}

function boolField(body, field) {
  if (typeof body[field] !== 'boolean') {
    throw new AppError(400, `${field} must be true or false`);
  }
  return body[field];
}

function oneOf(body, field, allowed) {
  const value = body[field];
  if (!allowed.includes(value)) {
    throw new AppError(400, `${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function uuidField(body, field) {
  const value = str(body, field, { max: 36, min: 36 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError(400, `${field} must be a uuid`);
  }
  return value.toLowerCase();
}

function dateField(body, field, { required = false } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return null;
    throw new AppError(400, `${field} is required`);
  }
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new AppError(400, `${field} must be a date (YYYY-MM-DD)`);
  }
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new AppError(400, `${field} must be a real date`);
  }
  return raw;
}

function skuField(body, field = 'sku') {
  const value = str(body, field, { max: 64 }).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{0,63}$/.test(value)) {
    throw new AppError(400, 'sku may contain letters, numbers, and hyphens');
  }
  return value;
}

module.exports = {
  parseBody,
  str,
  passwordField,
  emailField,
  intField,
  money,
  boolField,
  oneOf,
  uuidField,
  dateField,
  skuField,
};
