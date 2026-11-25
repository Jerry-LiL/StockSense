const express = require('express');
const { Op } = require('sequelize');
const { Supplier } = require('../models');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth, requireRoles } = require('../middleware');
const { parseBody, str, emailField, boolField, uuidField } = require('../validate');
const { pageParams, pageBody, searchText, likePattern, sortOrder } = require('../pagination');
const { sendCsv, exportMaxRows } = require('../csv');

const router = express.Router();
const writers = requireRoles('admin', 'manager');
const SORTS = {
  name: 'name',
  updated: 'updatedAt',
};

const CSV_COLUMNS = [
  { label: 'name', value: 'name' },
  { label: 'contact_name', value: 'contactName' },
  { label: 'email', value: 'email' },
  { label: 'phone', value: 'phone' },
  { label: 'address', value: 'address' },
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
      { name: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { contactName: { [Op.iLike]: term } },
    ];
  }
  return where;
}

function supplierPayload(body, { partial }) {
  const data = {};
  if (!partial || body.name !== undefined) data.name = str(body, 'name', { max: 160 });
  if (!partial || body.contactName !== undefined) {
    data.contactName = str(body, 'contactName', { required: false, max: 120 });
  }
  if (!partial || body.email !== undefined) data.email = emailField(body, 'email', { required: false });
  if (!partial || body.phone !== undefined) data.phone = str(body, 'phone', { required: false, max: 40 });
  if (!partial || body.address !== undefined) {
    data.address = str(body, 'address', { required: false, max: 300 });
  }
  if (body.active !== undefined) data.active = boolField(body, 'active');
  if (partial && Object.keys(data).length === 0) throw new AppError(400, 'No changes supplied');
  return data;
}

router.use(requireAuth);

router.get('/export', asyncHandler(async (req, res) => {
  const rows = await Supplier.findAll({
    where: filters(req.query),
    order: sortOrder(req.query, SORTS, 'name'),
    limit: exportMaxRows() + 1,
  });
  if (rows.length > exportMaxRows()) {
    throw new AppError(400, 'Too many rows to export. Narrow the filters and try again.');
  }
  sendCsv(res, 'suppliers.csv', CSV_COLUMNS, rows);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const result = await Supplier.findAndCountAll({
    where: filters(req.query),
    order: sortOrder(req.query, SORTS, 'name'),
    limit,
    offset,
  });
  res.json(pageBody(result.rows, result.count, page, limit));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  const supplier = await Supplier.findByPk(req.params.id);
  if (!supplier) throw new AppError(404, 'Supplier not found');
  res.json(supplier);
}));

router.post('/', writers, asyncHandler(async (req, res) => {
  const supplier = await Supplier.create(supplierPayload(parseBody(req), { partial: false }));
  res.status(201).json(supplier);
}));

router.patch('/:id', writers, asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  const supplier = await Supplier.findByPk(req.params.id);
  if (!supplier) throw new AppError(404, 'Supplier not found');
  await supplier.update(supplierPayload(parseBody(req), { partial: true }));
  res.json(supplier);
}));

module.exports = router;
