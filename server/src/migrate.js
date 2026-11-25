const { sequelize } = require('./db');
const init = require('./migrations/001_init');

const migrations = [init];

async function migrate() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const [rows] = await sequelize.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((row) => row.name));

  for (const migration of migrations) {
    if (done.has(migration.name)) continue;
    await sequelize.transaction(async (transaction) => {
      await migration.up(sequelize, transaction);
      await sequelize.query(
        'INSERT INTO schema_migrations (name) VALUES (:name)',
        { replacements: { name: migration.name }, transaction }
      );
    });
  }
}

if (require.main === module) {
  migrate()
    .then(() => sequelize.close())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { migrate };
