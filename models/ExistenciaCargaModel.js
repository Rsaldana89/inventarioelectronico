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

async function getCurrentMonthBySucursal(sucursalId) {
  const [rows] = await db.execute(
    `
      SELECT id, sucursal_id, fecha_existencia, created_at
      FROM existencias_cargas
      WHERE sucursal_id = ?
        AND fecha_existencia >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND fecha_existencia < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      ORDER BY fecha_existencia DESC, id DESC
      LIMIT 1
    `,
    [sucursalId]
  );
  return rows[0] || null;
}

async function getCurrentMonthMap(sucursalIds) {
  const ids = (sucursalIds || []).map((id) => Number(id)).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;

  const [rows] = await db.query(
    `
      SELECT id, sucursal_id, fecha_existencia, created_at
      FROM existencias_cargas
      WHERE sucursal_id IN (?)
        AND fecha_existencia >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND fecha_existencia < DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)
      ORDER BY sucursal_id ASC, fecha_existencia DESC, id DESC
    `,
    [ids]
  );

  for (const row of rows || []) {
    const key = Number(row.sucursal_id);
    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return map;
}

function isSameYearMonth(value, referenceDate = new Date()) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
}

/**
 * Delete a proforma (existencia carga) by its ID.  When a proforma is
 * deleted the database will cascade-delete associated rows in
 * `existencias_detalle` and nullify any references from
 * `inventarios.existencia_carga_id` via foreign key constraints.  This
 * helper wraps the deletion in a transaction to ensure the operation
 * completes atomically.
 *
 * @param {number} id The ID of the proforma to delete.
 * @returns {Promise<number>} Number of rows removed from existencias_cargas.
 */
async function deleteById(id) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute('DELETE FROM existencias_cargas WHERE id = ?', [id]);
    await connection.commit();
    return result.affectedRows || 0;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminación de la proforma:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  create,
  listBySucursal,
  getById,
  getCurrentMonthBySucursal,
  getCurrentMonthMap,
  isSameYearMonth,
  deleteById
};
