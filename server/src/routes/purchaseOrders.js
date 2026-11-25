const express = require('express');
const { Op } = require('sequelize');
const { sequelize, PurchaseOrder, Supplier } = require('../models');
const { AppError } = require('../errors');
const { asyncHandler, requireAuth, requireRoles } = require('../middleware');
const {
  parseBody,
  str,
  uuidField,
  intField,
  money,
  dateField,
} = require('../validate');
const { pageParams, pageBody, searchText, likePattern } = require('../pagination');
const { sendCsv, exportMaxRows } = require('../csv');
const {
  getPurchaseOrder,
  createPurchaseOrder,
  submitPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
} = require('../purchaseOrders');

const router = express.Router();
const writers = requireRoles('admin', 'manager');
const STATUSES = ['draft', 'submitted', 'partial', 'received', 'cancelled'];

function listWhere(query) {
  const where = {};
  if (query.status) {
    if (!STATUSES.includes(query.status)) throw new AppError(400, 'Unknown status');
    where.status = query.status;
  }
  const search = searchText(query);
  if (search) {
    const term = likePattern(search);
    where[Op.or] = [
      { poNumber: { [Op.iLike]: term } },
      { '$supplier.name$': { [Op.iLike]: term } },
    ];
  }
  return where;
}

router.use(requireAuth);

router.get('/export', asyncHandler(async (req, res) => {
  const where = [];
  const replacements = { limit: exportMaxRows() + 1 };
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) throw new AppError(400, 'Unknown status');
    where.push('po.status = :status');
    replacements.status = req.query.status;
  }
  const search = searchText(req.query);
  if (search) {
    where.push('(po.po_number ILIKE :term OR s.name ILIKE :term)');
    replacements.term = likePattern(search);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await sequelize.query(
    `SELECT
       po.po_number,
       s.name AS supplier,
       po.status,
       po.expected_on,
       p.sku,
       p.name AS product,
       l.quantity_ordered,
       l.quantity_received,
       l.unit_cost
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN purchase_order_lines l ON l.purchase_order_id = po.id
     JOIN products p ON p.id = l.product_id
     ${clause}
     ORDER BY po.created_at DESC, p.sku ASC
     LIMIT :limit`,
    { replacements }
  );
  if (rows.length > exportMaxRows()) {
    throw new AppError(400, 'Too many rows to export. Narrow the filters and try again.');
  }
  sendCsv(res, 'purchase-orders.csv', [
    { label: 'po_number', value: 'po_number' },
    { label: 'supplier', value: 'supplier' },
    { label: 'status', value: 'status' },
    {
      label: 'expected_on',
      value: (row) => {
        if (!row.expected_on) return '';
        if (row.expected_on instanceof Date) return row.expected_on.toISOString().slice(0, 10);
        return String(row.expected_on).slice(0, 10);
      },
    },
    { label: 'sku', value: 'sku' },
    { label: 'product', value: 'product' },
    { label: 'quantity_ordered', value: 'quantity_ordered' },
    { label: 'quantity_received', value: 'quantity_received' },
    { label: 'unit_cost', value: 'unit_cost' },
  ], rows);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const result = await PurchaseOrder.findAndCountAll({
    where: listWhere(req.query),
    include: [{ model: Supplier, as: 'supplier', attributes: ['id', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    subQuery: false,
    distinct: true,
  });

  const ids = result.rows.map((po) => po.id);
  let totals = [];
  if (ids.length) {
    const [rows] = await sequelize.query(
      `SELECT purchase_order_id,
              COUNT(*)::int AS line_count,
              COALESCE(SUM(quantity_ordered), 0)::int AS quantity_ordered,
              COALESCE(SUM(quantity_received), 0)::int AS quantity_received
       FROM purchase_order_lines
       WHERE purchase_order_id IN (:ids)
       GROUP BY purchase_order_id`,
      { replacements: { ids } }
    );
    totals = rows;
  }
  const byId = new Map(totals.map((row) => [row.purchase_order_id, row]));
  const data = result.rows.map((po) => {
    const json = po.toJSON();
    const total = byId.get(po.id);
    json.lineCount = total ? total.line_count : 0;
    json.quantityOrdered = total ? total.quantity_ordered : 0;
    json.quantityReceived = total ? total.quantity_received : 0;
    return json;
  });
  res.json(pageBody(data, result.count, page, limit));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  res.json(await getPurchaseOrder(req.params.id));
}));

router.post('/', writers, asyncHandler(async (req, res) => {
  const body = parseBody(req);
  if (!Array.isArray(body.lines)) throw new AppError(400, 'lines must be a list');
  const lines = body.lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new AppError(400, 'Invalid line');
    }
    return {
      productId: uuidField(line, 'productId'),
      quantityOrdered: intField(line, 'quantityOrdered', { min: 1 }),
      unitCost: money(line, 'unitCost', { required: true }),
    };
  });
  const po = await createPurchaseOrder({
    supplierId: uuidField(body, 'supplierId'),
    expectedOn: dateField(body, 'expectedOn'),
    notes: str(body, 'notes', { required: false, max: 500 }),
    lines,
    userId: req.user.id,
  });
  res.status(201).json(po);
}));

router.post('/:id/submit', writers, asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  res.json(await submitPurchaseOrder(req.params.id));
}));

router.post('/:id/cancel', writers, asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  res.json(await cancelPurchaseOrder(req.params.id));
}));

router.post('/:id/receive', writers, asyncHandler(async (req, res) => {
  uuidField({ id: req.params.id }, 'id');
  const body = parseBody(req);
  if (!Array.isArray(body.lines)) throw new AppError(400, 'lines must be a list');
  const lines = body.lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      throw new AppError(400, 'Invalid line');
    }
    return {
      lineId: uuidField(line, 'lineId'),
      quantity: intField(line, 'quantity', { min: 1 }),
    };
  });
  const po = await receivePurchaseOrder(req.params.id, {
    lines,
    notes: str(body, 'notes', { required: false, max: 500 }),
    userId: req.user.id,
  });
  res.json(po);
}));

module.exports = router;
