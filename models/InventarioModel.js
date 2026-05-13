const db = require('../db')

function applyFilters(user, filters) {
  const conditions = ['1 = 1']
  const params = []

  if (user.rol !== 'admin') {
    conditions.push('i.sucursal_id = ?')
    params.push(user.sucursal_id)
  } else if (filters.sucursalId) {
    conditions.push('i.sucursal_id = ?')
    params.push(filters.sucursalId)
  }

  if (filters.fechaInicio) {
    conditions.push('i.fecha >= ?')
    params.push(filters.fechaInicio)
  }

  if (filters.fechaFin) {
    conditions.push('i.fecha <= ?')
    params.push(filters.fechaFin)
  }

  return { where: 'WHERE ' + conditions.join(' AND '), params }
}

async function create(data) {
  const [result] = await db.execute(
    `
      INSERT INTO inventarios (
        sucursal_id,
        fecha,
        estado,
        created_by,
        origen_existencias,
        existencia_carga_id,
        nombre,
        origen
      )
      VALUES (?, ?, 'abierto', ?, ?, ?, ?, ?)
    `,
    [
      data.sucursalId,
      data.fecha,
      data.createdBy || null,
      data.origenExistencias || 'sin_existencias',
      data.existenciaCargaId || null,
      data.nombre || null,
      data.origen || 'web'
    ]
  )
  return result.insertId
}

async function getById(id, executor) {
  const runner = executor || db
  const [rows] = await runner.execute(
    `
      SELECT
        i.id,
        i.sucursal_id,
        i.fecha,
        i.estado,
        i.created_by,
        i.created_at,
        i.updated_at,
        i.origen_existencias,
        i.existencia_carga_id,
        i.external_id,
        i.nombre,
        i.origen,
        s.codigo AS sucursal_codigo,
        s.nombre AS sucursal_nombre,
        ec.fecha_existencia
      FROM inventarios i
      INNER JOIN sucursales s ON s.id = i.sucursal_id
      LEFT JOIN existencias_cargas ec ON ec.id = i.existencia_carga_id
      WHERE i.id = ?
      LIMIT 1
    `,
    [id]
  )
  return rows[0] || null
}

async function getByExternalId(externalId, executor) {
  const runner = executor || db
  const [rows] = await runner.execute(
    `
      SELECT
        i.id,
        i.sucursal_id,
        i.fecha,
        i.estado,
        i.created_by,
        i.created_at,
        i.updated_at,
        i.origen_existencias,
        i.existencia_carga_id,
        i.external_id,
        i.nombre,
        i.origen
      FROM inventarios i
      WHERE i.external_id = ?
      LIMIT 1
    `,
    [externalId]
  )

  return rows[0] || null
}

async function createFromMobile(data, executor) {
  const runner = executor || db
  const [result] = await runner.execute(
    `
      INSERT INTO inventarios (
        sucursal_id,
        fecha,
        estado,
        created_by,
        origen_existencias,
        existencia_carga_id,
        external_id,
        nombre,
        origen
      )
      VALUES (?, ?, 'abierto', ?, 'sin_existencias', NULL, ?, ?, ?)
    `,
    [
      data.sucursalId,
      data.fecha,
      data.createdBy || null,
      data.externalId,
      data.nombre || null,
      data.origen || 'mobile'
    ]
  )

  return result.insertId
}

async function updateFromMobile(data, executor) {
  const runner = executor || db
  await runner.execute(
    `
      UPDATE inventarios
      SET
        external_id = ?,
        nombre = ?,
        fecha = ?,
        created_by = COALESCE(created_by, ?),
        origen = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      data.externalId,
      data.nombre || null,
      data.fecha,
      data.createdBy || null,
      data.origen || 'mobile',
      data.id
    ]
  )
}

async function close(id) {
  await db.execute("UPDATE inventarios SET estado = 'cerrado' WHERE id = ?", [id])
}

async function listForDashboard(user, filters) {
  const scoped = applyFilters(user, filters)
  const [rows] = await db.query(
    `
      SELECT
        i.id,
        i.fecha,
        i.created_at,
        i.estado,
        i.origen_existencias,
        i.existencia_carga_id,
        i.external_id,
        i.nombre,
        i.origen,
        ec.fecha_existencia,
        s.nombre AS sucursal_nombre,
        COUNT(DISTINCT d.id) AS registros_capturados,
        COALESCE(SUM(d.cantidad), 0) AS unidades_capturadas
      FROM inventarios i
      INNER JOIN sucursales s ON s.id = i.sucursal_id
      LEFT JOIN existencias_cargas ec ON ec.id = i.existencia_carga_id
      LEFT JOIN inventario_detalle d ON d.inventario_id = i.id
      ${scoped.where}
      GROUP BY i.id, i.fecha, i.created_at, i.estado, i.origen_existencias, i.existencia_carga_id, i.external_id, i.nombre, i.origen, ec.fecha_existencia, s.nombre
      ORDER BY i.fecha DESC, i.id DESC
    `,
    scoped.params
  )
  return rows
}


async function listOpenBySucursal(sucursalId) {
  const [rows] = await db.query(
    `
      SELECT
        i.id,
        i.sucursal_id,
        i.fecha,
        i.created_at,
        i.updated_at,
        i.estado,
        i.external_id,
        i.nombre,
        i.origen,
        s.nombre AS sucursal_nombre,
        COUNT(DISTINCT d.id) AS registros_capturados,
        COALESCE(SUM(d.cantidad), 0) AS unidades_capturadas
      FROM inventarios i
      INNER JOIN sucursales s ON s.id = i.sucursal_id
      LEFT JOIN inventario_detalle d ON d.inventario_id = i.id
      WHERE i.sucursal_id = ? AND i.estado = 'abierto'
      GROUP BY i.id, i.sucursal_id, i.fecha, i.created_at, i.updated_at, i.estado, i.external_id, i.nombre, i.origen, s.nombre
      ORDER BY i.created_at DESC, i.id DESC
    `,
    [sucursalId]
  )
  return rows
}

async function deleteOpenById(inventarioId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('DELETE FROM inventario_detalle WHERE inventario_id = ?', [inventarioId])
    const [result] = await connection.execute("DELETE FROM inventarios WHERE id = ? AND estado <> 'cerrado'", [inventarioId])
    await connection.commit()
    return result.affectedRows || 0
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminacion del inventario:', rollbackError.message)
    }
    throw error
  } finally {
    connection.release()
  }
}

/**
 * Delete an inventory regardless of its status.  This helper removes
 * captured records in `inventario_detalle` and then deletes the
 * inventory row itself.  Administrators and managers should use this
 * when they need to purge an inventory completely (either open or
 * closed).
 *
 * @param {number} inventarioId The ID of the inventory to delete.
 * @returns {Promise<number>} Number of inventory rows removed.
 */
async function deleteById(inventarioId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('DELETE FROM inventario_detalle WHERE inventario_id = ?', [inventarioId])
    const [result] = await connection.execute('DELETE FROM inventarios WHERE id = ?', [inventarioId])
    await connection.commit()
    return result.affectedRows || 0
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminacion del inventario:', rollbackError.message)
    }
    throw error
  } finally {
    connection.release()
  }
}

async function getDashboardSummary(user, filters) {
  const scoped = applyFilters(user, filters)
  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN i.estado = 'abierto' THEN 1 ELSE 0 END) AS abiertos,
        SUM(CASE WHEN i.estado = 'cerrado' THEN 1 ELSE 0 END) AS cerrados
      FROM inventarios i
      ${scoped.where}
    `,
    scoped.params
  )
  return rows[0] || { total: 0, abiertos: 0, cerrados: 0 }
}

module.exports = {
  create,
  getById,
  getByExternalId,
  createFromMobile,
  updateFromMobile,
  close,
  listOpenBySucursal,
  deleteOpenById,
  listForDashboard,
  getDashboardSummary,
  deleteById
}
