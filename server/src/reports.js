const { sequelize } = require('./db');
const { likePattern } = require('./pagination');

// On-hand at or under the reorder point. Shortfall is how many units
// it would take to climb back to the reorder level.
const LOW_STOCK_FROM = `
  FROM products p
  WHERE p.active = true
    AND p.quantity_on_hand <= p.reorder_level
`;

function mapLowStock(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantityOnHand: Number(row.quantity_on_hand),
    reorderLevel: Number(row.reorder_level),
    shortfall: Number(row.shortfall),
    unitCost: row.unit_cost,
  };
}

function searchClause(search) {
  if (!search) return { sql: '', replacements: {} };
  return {
    sql: `AND (
      p.sku ILIKE :term
      OR p.name ILIKE :term
      OR COALESCE(p.category, '') ILIKE :term
    )`,
    replacements: { term: likePattern(search) },
  };
}

async function lowStock({ search = '', limit, offset }) {
  const filter = searchClause(search);
  const [countRows] = await sequelize.query(
    `SELECT COUNT(*)::int AS count ${LOW_STOCK_FROM} ${filter.sql}`,
    { replacements: filter.replacements }
  );
  const [rows] = await sequelize.query(
    `SELECT
       p.id,
       p.sku,
       p.name,
       p.category,
       p.unit,
       p.quantity_on_hand,
       p.reorder_level,
       (p.reorder_level - p.quantity_on_hand) AS shortfall,
       p.unit_cost
     ${LOW_STOCK_FROM}
     ${filter.sql}
     ORDER BY (p.reorder_level - p.quantity_on_hand) DESC, p.sku ASC
     LIMIT :limit OFFSET :offset`,
    { replacements: { ...filter.replacements, limit, offset } }
  );
  return { count: Number(countRows[0].count), rows: rows.map(mapLowStock) };
}

async function summary() {
  const [[products]] = await sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE active)::int AS product_count,
      COALESCE(SUM(quantity_on_hand) FILTER (WHERE active), 0)::int AS units_on_hand,
      COUNT(*) FILTER (
        WHERE active AND quantity_on_hand <= reorder_level
      )::int AS low_stock_count
    FROM products
  `);
  const [[orders]] = await sequelize.query(`
    SELECT COUNT(*)::int AS open_purchase_orders
    FROM purchase_orders
    WHERE status IN ('draft', 'submitted', 'partial')
  `);
  const [[moves]] = await sequelize.query(`
    SELECT COUNT(*)::int AS movements_today
    FROM stock_movements
    WHERE created_at >= date_trunc('day', now())
  `);
  return {
    productCount: Number(products.product_count),
    unitsOnHand: Number(products.units_on_hand),
    lowStockCount: Number(products.low_stock_count),
    openPurchaseOrders: Number(orders.open_purchase_orders),
    movementsToday: Number(moves.movements_today),
  };
}

module.exports = { lowStock, summary };
