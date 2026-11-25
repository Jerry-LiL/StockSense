const { Sequelize } = require('sequelize');
const { config } = require('./config');

const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: process.env.SQL_LOG === '1' ? (sql) => console.log(sql) : false,
  define: {
    underscored: true,
    freezeTableName: true,
  },
});

module.exports = { sequelize };
