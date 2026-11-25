const statements = [
  `CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'staff'))
  )`,
  `CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    unit TEXT NOT NULL DEFAULT 'each',
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_sku_key UNIQUE (sku),
    CONSTRAINT products_quantity_non_negative CHECK (quantity_on_hand >= 0),
    CONSTRAINT products_reorder_non_negative CHECK (reorder_level >= 0),
    CONSTRAINT products_unit_cost_non_negative CHECK (unit_cost >= 0)
  )`,
  `CREATE SEQUENCE purchase_order_number_seq START WITH 1001`,
  `CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft',
    expected_on DATE,
    notes TEXT,
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number),
    CONSTRAINT purchase_orders_status_check CHECK (
      status IN ('draft', 'submitted', 'partial', 'received', 'cancelled')
    )
  )`,
  `CREATE TABLE purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER NOT NULL DEFAULT 0,
    unit_cost NUMERIC(12, 2) NOT NULL,
    CONSTRAINT po_lines_unique_product UNIQUE (purchase_order_id, product_id),
    CONSTRAINT po_lines_quantity_ordered_positive CHECK (quantity_ordered > 0),
    CONSTRAINT po_lines_quantity_received_non_negative CHECK (quantity_received >= 0),
    CONSTRAINT po_lines_received_within_ordered CHECK (quantity_received <= quantity_ordered),
    CONSTRAINT po_lines_unit_cost_non_negative CHECK (unit_cost >= 0)
  )`,
  `CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reference_type TEXT NOT NULL DEFAULT 'manual',
    reference_id UUID,
    notes TEXT,
    created_by UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_type_check CHECK (movement_type IN ('receipt', 'issue')),
    CONSTRAINT stock_movements_reference_check CHECK (reference_type IN ('manual', 'purchase_order')),
    CONSTRAINT stock_movements_quantity_positive CHECK (quantity > 0)
  )`,
  `CREATE INDEX products_category_idx ON products (category)`,
  `CREATE INDEX purchase_orders_supplier_idx ON purchase_orders (supplier_id)`,
  `CREATE INDEX purchase_orders_status_idx ON purchase_orders (status)`,
  `CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at DESC)`,
  `CREATE INDEX stock_movements_created_idx ON stock_movements (created_at DESC)`,
];

async function up(sequelize, transaction) {
  for (const statement of statements) {
    await sequelize.query(statement, { transaction });
  }
}

module.exports = { name: '001_init', up };
