const express = require('express');
const { asyncHandler, requireAuth } = require('../middleware');
const { pageParams, pageBody, searchText } = require('../pagination');
const { sendCsv, exportMaxRows } = require('../csv');
const { AppError } = require('../errors');
const { lowStock, summary } = require('../reports');

const router = express.Router();

router.use(requireAuth);

router.get('/summary', asyncHandler(async (_req, res) => {
  res.json(await summary());
}));

router.get('/low-stock/export', asyncHandler(async (req, res) => {
  const search = searchText(req.query);
  const cap = exportMaxRows();
  const result = await lowStock({ search, limit: cap + 1, offset: 0 });
  if (result.rows.length > cap) {
    throw new AppError(400, 'Too many rows to export. Narrow the filters and try again.');
  }
  sendCsv(res, 'low-stock.csv', [
    { label: 'sku', value: 'sku' },
    { label: 'name', value: 'name' },
    { label: 'category', value: 'category' },
    { label: 'unit', value: 'unit' },
    { label: 'quantity_on_hand', value: 'quantityOnHand' },
    { label: 'reorder_level', value: 'reorderLevel' },
    { label: 'shortfall', value: 'shortfall' },
    { label: 'unit_cost', value: 'unitCost' },
  ], result.rows);
}));

router.get('/low-stock', asyncHandler(async (req, res) => {
  const { page, limit, offset } = pageParams(req.query);
  const result = await lowStock({
    search: searchText(req.query),
    limit,
    offset,
  });
  res.json(pageBody(result.rows, result.count, page, limit));
}));

module.exports = router;
