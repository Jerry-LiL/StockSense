const { sequelize, Product, StockMovement, User } = require('./models');
const { AppError } = require('./errors');

const movementInclude = [
  { model: Product, as: 'product', attributes: ['id', 'sku', 'name', 'unit', 'quantityOnHand'] },
  { model: User, as: 'actor', attributes: ['id', 'name'] },
];

async function presentMovement(id, transaction) {
  return StockMovement.findByPk(id, { transaction, include: movementInclude });
}

// Lock the product row, then write the ledger row and the balance together.
// The CHECK constraint on quantity_on_hand rejects a negative balance if a
// writer bypasses this function.
async function applyMovement(input, transaction) {
  const quantity = input.quantity;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer');
  }
  if (!['receipt', 'issue'].includes(input.movementType)) {
    throw new AppError(400, 'Unknown movement type');
  }

  const product = await Product.findByPk(input.productId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!product) throw new AppError(404, 'Product not found');
  if (!product.active) throw new AppError(409, 'This product is inactive');

  const delta = input.movementType === 'issue' ? -quantity : quantity;
  const next = product.quantityOnHand + delta;
  if (next < 0) {
    throw new AppError(
      409,
      `Insufficient stock: ${product.quantityOnHand} on hand`,
      'INSUFFICIENT_STOCK'
    );
  }

  product.quantityOnHand = next;
  await product.save({ transaction });

  const movement = await StockMovement.create({
    productId: product.id,
    movementType: input.movementType,
    quantity,
    referenceType: input.referenceType || 'manual',
    referenceId: input.referenceId || null,
    notes: input.notes || null,
    createdBy: input.userId || null,
  }, { transaction });

  return movement.id;
}

async function recordMovement(input, outerTransaction) {
  if (outerTransaction) {
    const id = await applyMovement(input, outerTransaction);
    return presentMovement(id, outerTransaction);
  }

  const id = await sequelize.transaction((transaction) => applyMovement(input, transaction));
  return presentMovement(id);
}

async function ledgerMismatches() {
  const [rows] = await sequelize.query(`
    SELECT p.sku, p.quantity_on_hand, COALESCE(m.net, 0) AS net
    FROM products p
    LEFT JOIN (
      SELECT product_id,
             SUM(CASE WHEN movement_type = 'receipt' THEN quantity ELSE -quantity END)::int AS net
      FROM stock_movements
      GROUP BY product_id
    ) m ON m.product_id = p.id
    WHERE p.quantity_on_hand <> COALESCE(m.net, 0)
  `);
  return rows;
}

module.exports = {
  recordMovement,
  movementInclude,
  ledgerMismatches,
};
