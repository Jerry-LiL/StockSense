const { app, request, auth, loginAs, createProduct, Product } = require('./helpers');

describe('products and suppliers', () => {
  test('staff can read products but cannot create or edit them', async () => {
    const manager = await loginAs('manager');
    const staff = await loginAs('staff');

    const created = await createProduct(manager.token, {
      sku: 'TAPE-48',
      name: 'Packing tape',
      category: 'Packaging',
      reorderLevel: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.quantityOnHand).toBe(0);
    expect(created.body.sku).toBe('TAPE-48');

    const denied = await createProduct(staff.token, { sku: 'NOPE-1' });
    expect(denied.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set(auth(staff.token))
      .send({ name: 'Changed' });
    expect(edited.status).toBe(403);

    const list = await request(app).get('/api/products').set(auth(staff.token));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
  });

  test('quantity cannot be patched; stock only moves through the ledger', async () => {
    const manager = await loginAs('manager');
    const created = await createProduct(manager.token, { sku: 'BOX-1' });
    const res = await request(app)
      .patch(`/api/products/${created.body.id}`)
      .set(auth(manager.token))
      .send({ quantityOnHand: 5 });
    expect(res.status).toBe(400);
    const stored = await Product.findByPk(created.body.id);
    expect(stored.quantityOnHand).toBe(0);
  });

  test('duplicate SKUs conflict, and search is case-insensitive', async () => {
    const manager = await loginAs('manager');
    await createProduct(manager.token, { sku: 'LBL-4X6', name: 'Thermal labels', category: 'Labels' });
    const dup = await createProduct(manager.token, { sku: 'lbl-4x6', name: 'Other' });
    expect(dup.status).toBe(409);

    const found = await request(app).get('/api/products?q=thermal').set(auth(manager.token));
    expect(found.body.data.map((row) => row.sku)).toEqual(['LBL-4X6']);
  });

  test('lists are paginated on the server', async () => {
    const manager = await loginAs('manager');
    await Product.bulkCreate(Array.from({ length: 25 }, (_, index) => ({
      sku: `SKU-${String(index + 1).padStart(3, '0')}`,
      name: `Item ${index + 1}`,
      unit: 'each',
      unitCost: '1.00',
      quantityOnHand: 0,
      reorderLevel: 0,
      active: true,
    })));

    const page = await request(app)
      .get('/api/products?page=2&limit=10')
      .set(auth(manager.token));
    expect(page.status).toBe(200);
    expect(page.body.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(page.body.data.map((row) => row.sku)).toEqual([
      'SKU-011', 'SKU-012', 'SKU-013', 'SKU-014', 'SKU-015',
      'SKU-016', 'SKU-017', 'SKU-018', 'SKU-019', 'SKU-020',
    ]);

    const clamped = await request(app)
      .get('/api/products?limit=500')
      .set(auth(manager.token));
    expect(clamped.body.pagination.limit).toBe(100);
    expect(clamped.body.data).toHaveLength(25);
  });

  test('csv export follows the same filters and escapes commas', async () => {
    const manager = await loginAs('manager');
    await createProduct(manager.token, {
      sku: 'GLV-L',
      name: 'Gloves, large "nitrile"',
      category: 'Safety',
    });
    await createProduct(manager.token, { sku: 'TAPE-48', name: 'Tape', category: 'Packaging' });

    const csv = await request(app)
      .get('/api/products/export?q=glove')
      .set(auth(manager.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toContain('products.csv');
    const text = csv.text.replace(/^\uFEFF/, '');
    expect(text.split('\r\n')[0]).toBe(
      'sku,name,description,category,unit,quantity_on_hand,reorder_level,unit_cost,active'
    );
    expect(text).toContain('"Gloves, large ""nitrile"""');
    expect(text).not.toContain('TAPE-48');

    const anon = await request(app).get('/api/products/export');
    expect(anon.status).toBe(401);
  });

  test('export stops when the row cap is exceeded', async () => {
    const manager = await loginAs('manager');
    await Product.bulkCreate([1, 2, 3].map((n) => ({
      sku: `CAP-${n}`,
      name: `Cap ${n}`,
      unit: 'each',
      unitCost: '1.00',
      quantityOnHand: 0,
      reorderLevel: 0,
    })));
    process.env.EXPORT_MAX_ROWS = '2';
    try {
      const res = await request(app).get('/api/products/export').set(auth(manager.token));
      expect(res.status).toBe(400);
    } finally {
      delete process.env.EXPORT_MAX_ROWS;
    }
  });

  test('managers maintain suppliers and staff do not', async () => {
    const manager = await loginAs('manager');
    const staff = await loginAs('staff');
    const created = await request(app)
      .post('/api/suppliers')
      .set(auth(manager.token))
      .send({
        name: 'Northwind Packaging',
        contactName: 'Priya Shah',
        email: 'orders@northwind.example',
        phone: '555-0148',
        address: '400 Dock Street',
      });
    expect(created.status).toBe(201);

    const denied = await request(app)
      .post('/api/suppliers')
      .set(auth(staff.token))
      .send({ name: 'Nope' });
    expect(denied.status).toBe(403);

    const list = await request(app).get('/api/suppliers?q=north').set(auth(staff.token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination.total).toBe(1);
  });
});
