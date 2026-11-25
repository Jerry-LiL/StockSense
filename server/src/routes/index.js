const express = require('express');
const auth = require('./auth');
const users = require('./users');
const products = require('./products');
const suppliers = require('./suppliers');
const purchaseOrders = require('./purchaseOrders');
const movements = require('./movements');
const reports = require('./reports');

const router = express.Router();

router.use('/auth', auth);
router.use('/users', users);
router.use('/products', products);
router.use('/suppliers', suppliers);
router.use('/purchase-orders', purchaseOrders);
router.use('/stock-movements', movements);
router.use('/reports', reports);

router.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = router;
