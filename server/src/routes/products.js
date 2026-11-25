const express = require('express');
const { Op } = require('sequelize');
const { Product } = require('../models');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth, requireRoles } = require('../middleware');
const {
  parseBody,
  str,
  money,
  intField,
  boolField,
  skuField,
  uuidField,
} = require('../validate');
const { pageParams, pageBody, searchText, likePattern, sortOrder } = require('../pagination');
const { sendCsv, exportMaxRows } = require('../csv');

const router = express.Router();
const writers = requireRoles('admin', 'manager');
const SORTS = {
  sku: 'sku',
  name: 'name',
  quantity: 'quantityOnHand',
  reorder: 'reorderLevel',
  updated: 'updatedAt',
};

const CSV_COLUMNS = [
  { label: 'sku', value: 'sku' },
  { label: 'name', value: 'name' },
  { label: 'description', value: 'description' },
  { label: 'category', value: 'category' },
  { label: 'unit', value: 'unit' },
  { label: 'quantity_on_hand', value: 'quantityOnHand' },
  { label: 'reorder_level', value: 'reorderLevel' },
  { label: 'unit_cost', value: 'unitCost' },
  { label: 'active', value: (row) => (row.active ? 'true' : 'false') },
];

function filters(query) {
  const where = {};
  if (query.active === 'all') {
    // both
  } else if (query.active === 'false') {
    where.active = false;
  } else {
    where.active = true;
  }
  const search = searchText(query);
  if (search) {
    const term = likePattern(search);
    where[Op.or] = [
      { sku: { [Op.iLike]: term } },
      { name: { [Op.iLike]: term } },
      { category: { [Op.iLike]: term } },
    ];
  }
  return where;
}

function productPayload(body, { partial }) {
  if (body.quantityOnHand !== undefined) {
    throw new AppError(400, 'quantityOnHand changes only through stock movements');
  }
  const data = {};
  if (!partial || body.sku !== undefined) data.sku = skuField(body);
  if (!partial || body.name !== undefined) data.name = str(body, 'name', { max: 200 });
  if (!partial || body.description !== undefined) {
    data.description = str(body, 'description', { required: false, max: 2000 });
  }
  if (!partial || body.category !== undefined) {
    data.category = str(body, 'category', { required: false, max: 80 });
  }
  if (!partial || body.unit !== undefined) {
    data.unit = str(body, 'unit', { required: false, max: 20 }) || 'each';
  }
  if (!partial || body.unitCost !== undefined) {
    data.unitCost = money(body, 'unitCost', { required: false }) || '0.00';
  }
  if (!partial || body.reorderLevel !== undefined) {
    data.reorderLevel = intField(body, 'reorderLevel', { required: false, min: 0 }) ?? 0;
  }
  if (body.active !== undefined) data.active = boolField(body, 'active');
  if (partial && Object.keys(data).length === 0) {
    throw new AppError(400, 'No changes supplied');
  }
  return data;
}

router.use(requireAuth);

router.get('/export', asyncHandler(async (req, res) => {
  const where = filters(req.query);
  const rows = await Product.findAll({
    where,
    order: sortOrder(req.query, SORTS, 'sku'),
    limit: exportMaxRows() + 1,
  });
  if (rows.length > exportMaxRows()) {
    throw new AppError(400, 'Too many rows to export. Narrow the filters and try again.');
  }
  sendCsv(res, 'products.csv', CSV_COLUMNS, rows);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const result = await Product.findAndCountAll({
    where: filters(req.query),
    order: sortOrder(req.query, SORTS, 'sku'),
    limit,
    offset,
  });
  res.json(pageBody(result.rows, result.count, page, limit));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  const product = await Product.findByPk(req.params.id);
  if (!product) throw new AppError(404, 'Product not found');
  res.json(product);
}));

router.post('/', writers, asyncHandler(async (req, res) => {
  const product = await Product.create(productPayload(parseBody(req), { partial: false }));
  res.status(201).json(product);
}));

router.patch('/:id', writers, asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  const product = await Product.findByPk(req.params.id);
  if (!product) throw new AppError(404, 'Product not found');
  await product.update(productPayload(parseBody(req), { partial: true }));
  res.json(product);
}));

module.exports = router;
