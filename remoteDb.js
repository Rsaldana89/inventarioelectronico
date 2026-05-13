require('dotenv').config();
const mysql = require('mysql2/promise');

/**
 * Pool de conexión para la base de datos externa (Soporte 360).
 * La configuración se toma de las variables de entorno:
 * REMOTE_DB_HOST, REMOTE_DB_PORT, REMOTE_DB_USER, REMOTE_DB_PASSWORD, REMOTE_DB_NAME.
 *
 * Este pool se usa para leer los usuarios que existen en la base remota.
 */
const remotePool = mysql.createPool({
  host: process.env.REMOTE_DB_HOST,
  port: Number(process.env.REMOTE_DB_PORT || 3306),
  user: process.env.REMOTE_DB_USER,
  password: process.env.REMOTE_DB_PASSWORD,
  database: process.env.REMOTE_DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.REMOTE_DB_CONNECTION_LIMIT || 5),
  queueLimit: 0,
  charset: 'utf8mb4',
  decimalNumbers: true,
  // Forzar el mismo huso horario para la base remota.  Esto evita que
  // las fechas de sincronización varíen.  Se puede ajustar en
  // REMOTE_DB_TIMEZONE en el .env si es necesario.
  timezone: process.env.REMOTE_DB_TIMEZONE || '-06:00',
  dateStrings: true
});

module.exports = remotePool;