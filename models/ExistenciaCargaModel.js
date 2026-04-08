const db = require('../db');

async function create(sucursalId, fechaExistencia, createdBy) {
  const [result] = await db.execute(
    `
      INSERT INTO existencias_cargas (sucursal_id, fecha_existencia, created_by)
      VALUES (?, ?, ?)
    `,
    [sucursalId, fechaExistencia, createdBy || null]
  );
  return result.insertId;
}

async function listBySucursal(sucursalId) {
  const [rows] = await db.execute(
    `
      SELECT id, sucursal_id, fecha_existencia, created_at
      FROM existencias_cargas
      WHERE sucursal_id = ?
      ORDER BY fecha_existencia DESC, id DESC
    `,
    [sucursalId]
  );
  return rows;
}

async function getById(id) {
  const [rows] = await db.execute(
    `SELECT id, sucursal_id, fecha_existencia, created_at FROM existencias_cargas WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  create,
  listBySucursal,
  getById
};
