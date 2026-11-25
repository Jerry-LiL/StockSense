const { config } = require('./config');
const { app } = require('./app');
const { migrate } = require('./migrate');
const { seedIfEmpty } = require('./seed');

async function main() {
  await migrate();
  if (process.env.SEED_ON_BOOT === 'true') {
    await seedIfEmpty();
  }
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`StockSense API listening on ${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
