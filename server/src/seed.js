const bcrypt = require('bcryptjs');
const { config } = require('./config');
const { sequelize, User, Supplier, Product } = require('./models');
const { migrate } = require('./migrate');
const { recordMovement, ledgerMismatches } = require('./stock');
const { createPurchaseOrder, submitPurchaseOrder } = require('./purchaseOrders');

function seedPassword() {
  const value = process.env.SEED_PASSWORD || 'changeme';
  if (config.env === 'production' && value === 'changeme') {
    throw new Error('Set SEED_PASSWORD before seeding production');
  }
  return value;
}

function daysFromNow(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function clearData() {
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
}

async function seedIfEmpty() {
  const existing = await User.findOne();
  if (existing) {
    console.log('Seed skipped; users already exist');
    return false;
  }

  try {
    await loadDemo();
  } catch (err) {
    await clearData();
    throw err;
  }
  console.log('Seeded demo warehouse');
  return true;
}

async function loadDemo() {
  const passwordHash = await bcrypt.hash(seedPassword(), config.bcryptRounds);
  const [admin, manager, staff] = await User.bulkCreate([
    { name: 'Asha Menon', email: 'admin@stocksense.local', role: 'admin', passwordHash },
    { name: 'Devon Clark', email: 'manager@stocksense.local', role: 'manager', passwordHash },
    { name: 'Luis Ortega', email: 'staff@stocksense.local', role: 'staff', passwordHash },
  ]);

  const northwind = await Supplier.create({
    name: 'Northwind Packaging',
    contactName: 'Priya Shah',
    email: 'orders@northwind.example',
    phone: '555-0148',
    address: '400 Dock Street, Oakland, CA',
  });
  await Supplier.create({
    name: 'Harbor Safety Supply',
    contactName: 'Marcus Hale',
    email: 'sales@harborsafety.example',
    phone: '555-0190',
    address: '18 Pier Avenue, Tacoma, WA',
  });

  const catalog = [
    ['MAIL-10', 'Mailer box 10x8', 'Packaging', 'each', '0.42', 50, 120],
    ['TAPE-48', 'Packing tape 48mm', 'Packaging', 'each', '1.85', 40, 24],
    ['LBL-4X6', 'Thermal label 4x6', 'Labels', 'roll', '6.40', 20, 20],
    ['BUB-12', 'Bubble wrap 12mm', 'Packaging', 'roll', '14.00', 10, 18],
    ['GLV-L', 'Nitrile gloves, large', 'Safety', 'box', '8.75', 15, 8],
    ['WRAP-P', 'Pallet wrap', 'Packaging', 'roll', '11.20', 12, 30],
    ['SCN-BAT', 'Scanner battery', 'Equipment', 'each', '22.00', 8, 9],
  ];

  const products = {};
  for (const [sku, name, category, unit, unitCost, reorderLevel, opening] of catalog) {
    const product = await Product.create({
      sku,
      name,
      category,
      unit,
      unitCost,
      reorderLevel,
      quantityOnHand: 0,
    });
    products[sku] = product;
    if (opening > 0) {
      await recordMovement({
        productId: product.id,
        movementType: 'receipt',
        quantity: opening,
        notes: 'Opening balance',
        userId: admin.id,
      });
    }
  }

  await recordMovement({
    productId: products['GLV-L'].id,
    movementType: 'issue',
    quantity: 2,
    notes: 'Shift kits',
    userId: staff.id,
  });

  const po = await createPurchaseOrder({
    supplierId: northwind.id,
    expectedOn: daysFromNow(10),
    notes: 'Restock tape and labels',
    userId: manager.id,
    lines: [
      { productId: products['TAPE-48'].id, quantityOrdered: 40, unitCost: '1.85' },
      { productId: products['LBL-4X6'].id, quantityOrdered: 10, unitCost: '6.40' },
    ],
  });
  await submitPurchaseOrder(po.id);

  const mismatches = await ledgerMismatches();
  if (mismatches.length) {
    throw new Error(`Stock ledger out of balance for ${mismatches.map((row) => row.sku).join(', ')}`);
  }
}

if (require.main === module) {
  migrate()
    .then(() => seedIfEmpty())
    .then(() => sequelize.close())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedIfEmpty };
