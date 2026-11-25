const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { origins } = require('./config');
const { sequelize } = require('./db');
const { asyncHandler, errorHandler } = require('./middleware');
const routes = require('./routes');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: origins() }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', asyncHandler(async (_req, res) => {
  await sequelize.query('SELECT 1');
  res.json({ ok: true });
}));

app.use('/api', routes);
app.use(errorHandler);

module.exports = { app };
