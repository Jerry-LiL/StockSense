const {
  app,
  request,
  auth,
  loginAs,
  createProduct,
  expectLedgerBalanced,
  Product,
} = require('./helpers');

async function supplier(token, name = 'Northwind Packaging') {
  const res = await request(app)
    .post('/api/suppliers')
    .set(auth(token))
    .send({ name, email: 'orders@northwind.example' });
  expect(res.status).toBe(201);
  return res.body;
}

async function draftOrder(token, { supplierId, lines, expectedOn = '2026-12-05' }) {
  return request(app)
    .post('/api/purchase-orders')
    .set(auth(token))
    .send({ supplierId, expectedOn, notes: 'Restock', lines });
}

describe('purchase orders', () => {
  test('receiving stock is transactional and can complete across partial receipts', async () => {
    const manager = await loginAs('manager');
    const vendor = await supplier(manager.token);
    const tape = await createProduct(manager.token, { sku: 'TAPE-48', name: 'Packing tape' });
    const labels = await createProduct(manager.token, { sku: 'LBL-4X6', name: 'Thermal labels' });

    const created = await draftOrder(manager.token, {
      supplierId: vendor.id,
      lines: [
        { productId: tape.body.id, quantityOrdered: 10, unitCost: '1.85' },
        { productId: labels.body.id, quantityOrdered: 4, unitCost: '6.40' },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.poNumber).toMatch(/^PO-\d+$/);

    const submitted = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/submit`)
      .set(auth(manager.token));
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('submitted');

    const tapeLine = submitted.body.lines.find((line) => line.product.sku === 'TAPE-48');
    const labelLine = submitted.body.lines.find((line) => line.product.sku === 'LBL-4X6');

    const tooMuch = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/receive`)
      .set(auth(manager.token))
      .send({
        lines: [
          { lineId: tapeLine.id, quantity: 10 },
          { lineId: labelLine.id, quantity: 9 },
        ],
      });
    expect(tooMuch.status).toBe(409);
    expect((await Product.findByPk(tape.body.id)).quantityOnHand).toBe(0);
    expect((await Product.findByPk(labels.body.id)).quantityOnHand).toBe(0);

    const reloaded = await request(app)
      .get(`/api/purchase-orders/${created.body.id}`)
      .set(auth(manager.token));
    expect(reloaded.body.status).toBe('submitted');
    expect(reloaded.body.lines.every((line) => line.quantityReceived === 0)).toBe(true);

    const partial = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/receive`)
      .set(auth(manager.token))
      .send({ lines: [{ lineId: tapeLine.id, quantity: 4 }], notes: 'Dock 2' });
    expect(partial.status).toBe(200);
    expect(partial.body.status).toBe('partial');
    expect((await Product.findByPk(tape.body.id)).quantityOnHand).toBe(4);

    const rest = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/receive`)
      .set(auth(manager.token))
      .send({
        lines: [
          { lineId: tapeLine.id, quantity: 6 },
          { lineId: labelLine.id, quantity: 4 },
        ],
      });
    expect(rest.body.status).toBe('received');
    expect((await Product.findByPk(tape.body.id)).quantityOnHand).toBe(10);
    expect((await Product.findByPk(labels.body.id)).quantityOnHand).toBe(4);

    const movements = await request(app)
      .get('/api/stock-movements?movementType=receipt')
      .set(auth(manager.token));
    expect(movements.body.pagination.total).toBe(3);
    expect(movements.body.data.every((row) => row.referenceType === 'purchase_order')).toBe(true);
    await expectLedgerBalanced();
  });

  test('staff cannot create or receive a purchase order', async () => {
    const manager = await loginAs('manager');
    const staff = await loginAs('staff');
    const vendor = await supplier(manager.token);
    const product = await createProduct(manager.token, { sku: 'MAIL-10' });
    const created = await draftOrder(manager.token, {
      supplierId: vendor.id,
      lines: [{ productId: product.body.id, quantityOrdered: 2, unitCost: '0.42' }],
    });
    await request(app).post(`/api/purchase-orders/${created.body.id}/submit`).set(auth(manager.token));

    const deniedCreate = await draftOrder(staff.token, {
      supplierId: vendor.id,
      lines: [{ productId: product.body.id, quantityOrdered: 1, unitCost: '0.42' }],
    });
    expect(deniedCreate.status).toBe(403);

    const lineId = created.body.lines[0].id;
    const deniedReceive = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/receive`)
      .set(auth(staff.token))
      .send({ lines: [{ lineId, quantity: 2 }] });
    expect(deniedReceive.status).toBe(403);
    expect((await Product.findByPk(product.body.id)).quantityOnHand).toBe(0);
  });

  test('lists filter by supplier, paginate, and export one row per line', async () => {
    const manager = await loginAs('manager');
    const alpha = await supplier(manager.token, 'Alpha Supply');
    const beta = await supplier(manager.token, 'Beta Goods');
    const product = await createProduct(manager.token, { sku: 'WRAP-P', name: 'Pallet wrap' });

    for (let i = 0; i < 3; i += 1) {
      const created = await draftOrder(manager.token, {
        supplierId: i === 0 ? beta.id : alpha.id,
        lines: [{ productId: product.body.id, quantityOrdered: i + 1, unitCost: '11.20' }],
      });
      expect(created.status).toBe(201);
    }

    const filtered = await request(app)
      .get('/api/purchase-orders?q=beta')
      .set(auth(manager.token));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].supplier.name).toBe('Beta Goods');
    expect(filtered.body.data[0].lineCount).toBe(1);

    const page = await request(app)
      .get('/api/purchase-orders?limit=2&page=2')
      .set(auth(manager.token));
    expect(page.body.pagination.total).toBe(3);
    expect(page.body.data).toHaveLength(1);

    const csv = await request(app).get('/api/purchase-orders/export?q=alpha').set(auth(manager.token));
    expect(csv.status).toBe(200);
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toContain('po_number,supplier');
    expect(lines.slice(1)).toHaveLength(2);
    expect(csv.text).toContain('WRAP-P');
    expect(csv.text).not.toContain('Beta Goods');
  });

  test('a submitted order can be cancelled until something is received', async () => {
    const manager = await loginAs('manager');
    const vendor = await supplier(manager.token);
    const product = await createProduct(manager.token, { sku: 'BUB-12' });
    const created = await draftOrder(manager.token, {
      supplierId: vendor.id,
      lines: [{ productId: product.body.id, quantityOrdered: 5, unitCost: '14.00' }],
    });
    const submitted = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/submit`)
      .set(auth(manager.token));
    const cancelled = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/cancel`)
      .set(auth(manager.token));
    expect(cancelled.body.status).toBe('cancelled');

    const receive = await request(app)
      .post(`/api/purchase-orders/${created.body.id}/receive`)
      .set(auth(manager.token))
      .send({ lines: [{ lineId: submitted.body.lines[0].id, quantity: 1 }] });
    expect(receive.status).toBe(409);
  });
});
