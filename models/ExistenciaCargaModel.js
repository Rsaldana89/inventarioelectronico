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
  deleteById
};
