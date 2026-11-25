const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../src/app');
const { sequelize, User, Product } = require('../src/models');
const { migrate } = require('../src/migrate');
const { ledgerMismatches } = require('../src/stock');

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await sequelize.query(`
    TRUNCATE TABLE
      stock_movements,
      purchase_order_lines,
      purchase_orders,
      products,
      suppliers,
      users
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  await sequelize.close();
});

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function loginAs(role, extras = {}) {
  const email = extras.email || `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = extras.password || 'test-pass-123';
  await User.create({
    email,
    name: extras.name || role,
    role,
    active: extras.active !== false,
    passwordHash: await bcrypt.hash(password, 4),
  });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, email, password, user: res.body.user };
}

async function createProduct(token, overrides = {}) {
  return request(app)
    .post('/api/products')
    .set(auth(token))
    .send({
      sku: `SKU-${Math.random().toString(16).slice(2, 8)}`,
      name: 'Widget',
      unit: 'each',
      unitCost: '1.25',
      reorderLevel: 0,
      ...overrides,
    });
}

async function expectLedgerBalanced() {
  const rows = await ledgerMismatches();
  expect(rows).toEqual([]);
}

module.exports = {
  app,
  request,
  sequelize,
  User,
  Product,
  auth,
  loginAs,
  createProduct,
  expectLedgerBalanced,
};
