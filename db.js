require('dotenv').config();

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventario_retail_one',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
  // Forzar la zona horaria a UTC-6 (Ciudad de México) para que las
  // fechas y horas se guarden y se lean con el horario local.  Si se
  // establece DB_TIMEZONE en el .env, se usa ese valor.
  timezone: process.env.DB_TIMEZONE || '-06:00',
  dateStrings: true
});

module.exports = pool;
