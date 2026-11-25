const jwt = require('jsonwebtoken');
const { config } = require('./config');
const { AppError } = require('./errors');
const { User } = require('./models');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next(new AppError(401, 'Authentication required'));

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (_err) {
    return next(new AppError(401, 'Invalid or expired token'));
  }

  User.findByPk(payload.sub)
    .then((user) => {
      if (!user) return next(new AppError(401, 'Invalid or expired token'));
      if (!user.active) return next(new AppError(401, 'This account is inactive'));
      req.user = user;
      return next();
    })
    .catch(next);
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have access to this action'));
    }
    return next();
  };
}

function dbErrorOf(err) {
  return err.parent || err.original || null;
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (err instanceof AppError) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return res.status(err.status).json(body);
  }

  const dbError = dbErrorOf(err);
  if (dbError && dbError.code === '23514') {
    if (dbError.constraint === 'products_quantity_non_negative') {
      return res.status(409).json({
        error: 'Stock cannot go negative',
        code: 'NEGATIVE_STOCK',
      });
    }
    return res.status(400).json({ error: 'Value violates a database constraint', code: 'CHECK' });
  }

  if (dbError && dbError.code === '23505') {
    const messages = {
      users_email_key: 'A user with that email already exists',
      products_sku_key: 'A product with that SKU already exists',
      po_lines_unique_product: 'Each product can appear only once on a purchase order',
      purchase_orders_po_number_key: 'Could not allocate a purchase order number',
    };
    return res.status(409).json({
      error: messages[dbError.constraint] || 'That value is already in use',
      code: 'UNIQUE',
    });
  }

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = {
  asyncHandler,
  requireAuth,
  requireRoles,
  errorHandler,
};
