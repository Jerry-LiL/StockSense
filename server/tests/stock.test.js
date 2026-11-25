const { app, request, sequelize, auth, loginAs, createProduct, expectLedgerBalanced, Product } = require('./helpers');

async function onHand(id) {
  const product = await Product.findByPk(id);
  return product.quantityOnHand;
}

describe('stock movements', () => {
  test('a receipt and an issue update the balance inside the ledger', async () => {
    const manager = await loginAs('manager');
    const product = await createProduct(manager.token, { sku: 'BUB-12', reorderLevel: 5 });

    const receipt = await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'receipt', quantity: 10, notes: 'Opening balance' });
    expect(receipt.status).toBe(201);
    expect(receipt.body.product.quantityOnHand).toBe(10);
    expect(receipt.body.actor.name).toBe('manager');

    const issue = await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'issue', quantity: 4, notes: 'Order 441' });
    expect(issue.status).toBe(201);
    expect(issue.body.product.quantityOnHand).toBe(6);
    await expectLedgerBalanced();
  });

  test('an issue that would go negative rolls back and leaves the balance unchanged', async () => {
    const manager = await loginAs('manager');
    const product = await createProduct(manager.token, { sku: 'WRAP-P' });
    await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'receipt', quantity: 3 });

    const issue = await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'issue', quantity: 4 });
    expect(issue.status).toBe(409);
    expect(issue.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await onHand(product.body.id)).toBe(3);

    const movements = await request(app).get('/api/stock-movements').set(auth(manager.token));
    expect(movements.body.data).toHaveLength(1);
    expect(movements.body.data[0].movementType).toBe('receipt');
    await expectLedgerBalanced();
  });

  test('the database check constraint rejects a negative balance', async () => {
    const manager = await loginAs('manager');
    const product = await createProduct(manager.token, { sku: 'NEG-1' });
    await expect(sequelize.query(
      'UPDATE products SET quantity_on_hand = -1 WHERE id = :id',
      { replacements: { id: product.body.id } }
    )).rejects.toMatchObject({
      parent: { code: '23514', constraint: 'products_quantity_non_negative' },
    });
    expect(await onHand(product.body.id)).toBe(0);
  });

  test('staff may issue stock but may not receipt it', async () => {
    const manager = await loginAs('manager');
    const staff = await loginAs('staff');
    const product = await createProduct(manager.token, { sku: 'GLV-L' });
    await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'receipt', quantity: 5 });

    const denied = await request(app)
      .post('/api/stock-movements')
      .set(auth(staff.token))
      .send({ productId: product.body.id, movementType: 'receipt', quantity: 1 });
    expect(denied.status).toBe(403);

    const issued = await request(app)
      .post('/api/stock-movements')
      .set(auth(staff.token))
      .send({ productId: product.body.id, movementType: 'issue', quantity: 2, notes: 'Shift kits' });
    expect(issued.status).toBe(201);
    expect(await onHand(product.body.id)).toBe(3);
  });

  test('two overlapping issues cannot overdraw the same row', async () => {
    const manager = await loginAs('manager');
    const product = await createProduct(manager.token, { sku: 'SCN-BAT' });
    await request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'receipt', quantity: 5 });

    const sendIssue = () => request(app)
      .post('/api/stock-movements')
      .set(auth(manager.token))
      .send({ productId: product.body.id, movementType: 'issue', quantity: 3 });

    const [first, second] = await Promise.all([sendIssue(), sendIssue()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await onHand(product.body.id)).toBe(2);
    await expectLedgerBalanced();
  });

  test('the low-stock query returns products at or under the reorder level', async () => {
    const manager = await loginAs('manager');
    const rows = [
      ['LOW-1', 'Short tape', 4, 10, true],
      ['EQ-1', 'Equal labels', 10, 10, true],
      ['OK-1', 'Plenty of wrap', 11, 10, true],
      ['OFF-1', 'Retired sku', 0, 5, false],
    ];
    for (const [sku, name, quantityOnHand, reorderLevel, active] of rows) {
      await Product.create({
        sku,
        name,
        unit: 'each',
        unitCost: '2.00',
        quantityOnHand,
        reorderLevel,
        active,
      });
    }

    const report = await request(app).get('/api/reports/low-stock').set(auth(manager.token));
    expect(report.status).toBe(200);
    expect(report.body.data.map((row) => [row.sku, row.shortfall])).toEqual([
      ['LOW-1', 6],
      ['EQ-1', 0],
    ]);

    const filtered = await request(app).get('/api/reports/low-stock?q=label').set(auth(manager.token));
    expect(filtered.body.data.map((row) => row.sku)).toEqual(['EQ-1']);

    const page = await request(app).get('/api/reports/low-stock?limit=1&page=2').set(auth(manager.token));
    expect(page.body.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2 });
    expect(page.body.data[0].sku).toBe('EQ-1');

    const csv = await request(app).get('/api/reports/low-stock/export').set(auth(manager.token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('shortfall');
    expect(csv.text).toContain('LOW-1');
    expect(csv.text).not.toContain('OFF-1');

    const summary = await request(app).get('/api/reports/summary').set(auth(manager.token));
    expect(summary.body.productCount).toBe(3);
    expect(summary.body.lowStockCount).toBe(2);
    expect(summary.body.unitsOnHand).toBe(25);
  });
});
