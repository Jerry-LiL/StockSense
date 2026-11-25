const {
  sequelize,
  Supplier,
  Product,
  PurchaseOrder,
  PurchaseOrderLine,
  User,
} = require('./models');
const { AppError } = require('./errors');
const { recordMovement } = require('./stock');

const detailInclude = [
  { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'email', 'phone'] },
  { model: User, as: 'creator', attributes: ['id', 'name'] },
  {
    model: PurchaseOrderLine,
    as: 'lines',
    include: [{ model: Product, as: 'product', attributes: ['id', 'sku', 'name', 'unit'] }],
  },
];

async function getPurchaseOrder(id) {
  const po = await PurchaseOrder.findByPk(id, { include: detailInclude });
  if (!po) throw new AppError(404, 'Purchase order not found');
  const json = po.toJSON();
  json.lines.sort((a, b) => a.product.sku.localeCompare(b.product.sku));
  return json;
}

async function createPurchaseOrder({ supplierId, expectedOn, notes, lines, userId }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }
  if (lines.length > 100) {
    throw new AppError(400, 'A purchase order can have at most 100 lines');
  }

  const id = await sequelize.transaction(async (transaction) => {
    const supplier = await Supplier.findByPk(supplierId, { transaction });
    if (!supplier || !supplier.active) throw new AppError(400, 'Supplier is not available');

    const productIds = lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new AppError(400, 'Each product can appear only once on a purchase order');
    }

    const products = await Product.findAll({
      where: { id: productIds },
      transaction,
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const [seqRows] = await sequelize.query(
      `SELECT 'PO-' || nextval('purchase_order_number_seq') AS po_number`,
      { transaction }
    );

    const po = await PurchaseOrder.create({
      poNumber: seqRows[0].po_number,
      supplierId,
      status: 'draft',
      expectedOn,
      notes,
      createdBy: userId,
    }, { transaction });

    for (const line of lines) {
      const product = byId.get(line.productId);
      if (!product || !product.active) {
        throw new AppError(400, 'A selected product is not available');
      }
      await PurchaseOrderLine.create({
        purchaseOrderId: po.id,
        productId: product.id,
        quantityOrdered: line.quantityOrdered,
        quantityReceived: 0,
        unitCost: line.unitCost,
      }, { transaction });
    }

    return po.id;
  });

  return getPurchaseOrder(id);
}

async function submitPurchaseOrder(id) {
  await sequelize.transaction(async (transaction) => {
    const po = await PurchaseOrder.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (po.status !== 'draft') {
      throw new AppError(409, 'Only a draft purchase order can be submitted');
    }
    const count = await PurchaseOrderLine.count({
      where: { purchaseOrderId: id },
      transaction,
    });
    if (count === 0) throw new AppError(400, 'Cannot submit an empty purchase order');
    po.status = 'submitted';
    await po.save({ transaction });
  });
  return getPurchaseOrder(id);
}

async function cancelPurchaseOrder(id) {
  await sequelize.transaction(async (transaction) => {
    const po = await PurchaseOrder.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (!['draft', 'submitted'].includes(po.status)) {
      throw new AppError(409, 'This purchase order can no longer be cancelled');
    }
    po.status = 'cancelled';
    await po.save({ transaction });
  });
  return getPurchaseOrder(id);
}

async function receivePurchaseOrder(id, { lines, notes, userId }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new AppError(400, 'At least one line is required');
  }

  await sequelize.transaction(async (transaction) => {
    const po = await PurchaseOrder.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (!['submitted', 'partial'].includes(po.status)) {
      throw new AppError(409, 'Only submitted purchase orders can be received');
    }

    const dbLines = await PurchaseOrderLine.findAll({
      where: { purchaseOrderId: id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const byId = new Map(dbLines.map((line) => [line.id, line]));
    const seen = new Set();
    const ordered = [...lines].sort((a, b) => {
      const left = byId.get(a.lineId)?.productId || '';
      const right = byId.get(b.lineId)?.productId || '';
      return left < right ? -1 : left > right ? 1 : 0;
    });

    for (const input of ordered) {
      if (seen.has(input.lineId)) throw new AppError(400, 'Duplicate line in receipt');
      seen.add(input.lineId);
      const line = byId.get(input.lineId);
      if (!line) throw new AppError(400, 'Line does not belong to this purchase order');
      if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
        throw new AppError(400, 'Quantity must be a positive integer');
      }
      const remaining = line.quantityOrdered - line.quantityReceived;
      if (input.quantity > remaining) {
        throw new AppError(409, 'Receipt exceeds the quantity still open on a line');
      }
      line.quantityReceived += input.quantity;
      await line.save({ transaction });
      await recordMovement({
        productId: line.productId,
        movementType: 'receipt',
        quantity: input.quantity,
        referenceType: 'purchase_order',
        referenceId: po.id,
        notes: notes || `Receipt for ${po.poNumber}`,
        userId,
      }, transaction);
    }

    const refreshed = await PurchaseOrderLine.findAll({
      where: { purchaseOrderId: id },
      transaction,
    });
    const fullyReceived = refreshed.every((line) => line.quantityReceived === line.quantityOrdered);
    po.status = fullyReceived ? 'received' : 'partial';
    await po.save({ transaction });
  });

  return getPurchaseOrder(id);
}

module.exports = {
  detailInclude,
  getPurchaseOrder,
  createPurchaseOrder,
  submitPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrder,
};
