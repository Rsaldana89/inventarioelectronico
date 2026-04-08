const db = require('../db');

async function getAll() {
  const [rows] = await db.query(
    'SELECT id, nombre FROM sucursales ORDER BY nombre ASC'
  );

  return rows;
}

async function getById(id) {
  const [rows] = await db.execute(
    'SELECT id, nombre FROM sucursales WHERE id = ? LIMIT 1',
    [id]
  );

  return rows[0] || null;
}

module.exports = {
  getAll,
  getById
};
