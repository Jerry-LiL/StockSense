const express = require('express');
const { Op } = require('sequelize');
const { StockMovement } = require('../models');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth } = require('../middleware');
const { parseBody, uuidField, intField, str, oneOf } = require('../validate');
const { pageParams, pageBody, searchText, likePattern } = require('../pagination');
const { sendCsv, exportMaxRows } = require('../csv');
const { recordMovement, movementInclude } = require('../stock');

const router = express.Router();

function forbidStaffReceipt(req, _res, next) {
  if (req.body && req.body.movementType === 'receipt' && req.user.role === 'staff') {
    return next(new AppError(403, 'You do not have access to this action'));
  }
  return next();
}

function listQuery(query) {
  const where = {};
  if (query.movementType) {
    if (!['receipt', 'issue'].includes(query.movementType)) {
      throw new AppError(400, 'Unknown movement type');
    }
    where.movementType = query.movementType;
  }
  if (query.productId) {
    where.productId = uuidField({ productId: query.productId }, 'productId');
  }
  const include = movementInclude.map((entry) => ({ ...entry }));
  const search = searchText(query);
  if (search) {
    const term = likePattern(search);
    include[0] = {
      ...include[0],
      where: {
        [Op.or]: [
          { sku: { [Op.iLike]: term } },
          { name: { [Op.iLike]: term } },
        ],
      },
      required: true,
    };
  }
  return { where, include };
}

router.use(requireAuth);

router.get('/export', asyncHandler(async (req, res) => {
  const { where, include } = listQuery(req.query);
  const rows = await StockMovement.findAll({
    where,
    include,
    order: [['createdAt', 'DESC']],
    limit: exportMaxRows() + 1,
  });
  if (rows.length > exportMaxRows()) {
    throw new AppError(400, 'Too many rows to export. Narrow the filters and try again.');
  }
  sendCsv(res, 'stock-movements.csv', [
    { label: 'created_at', value: (row) => row.createdAt.toISOString() },
    { label: 'sku', value: (row) => row.product.sku },
    { label: 'product', value: (row) => row.product.name },
    { label: 'movement_type', value: 'movementType' },
    { label: 'quantity', value: 'quantity' },
    { label: 'reference_type', value: 'referenceType' },
    { label: 'notes', value: 'notes' },
    { label: 'recorded_by', value: (row) => (row.actor ? row.actor.name : '') },
  ], rows);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const { where, include } = listQuery(req.query);
  const result = await StockMovement.findAndCountAll({
    where,
    include,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  res.json(pageBody(result.rows, result.count, page, limit));
}));

router.post('/', forbidStaffReceipt, asyncHandler(async (req, res) => {
  const body = parseBody(req);
  const movement = await recordMovement({
    productId: uuidField(body, 'productId'),
    movementType: oneOf(body, 'movementType', ['receipt', 'issue']),
    quantity: intField(body, 'quantity', { min: 1 }),
    notes: str(body, 'notes', { required: false, max: 500 }),
    userId: req.user.id,
  });
  res.status(201).json(movement);
}));

module.exports = router;
