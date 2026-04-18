const pg = require('pg');
const { Pool } = pg;
require('dotenv').config();

const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (value) => value);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT
});

module.exports = pool;
