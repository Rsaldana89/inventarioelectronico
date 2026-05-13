const db = require('../db')
const { chunkArray } = require('../utils/common')

async function upsert(inventarioId, barcode, cantidad, modo) {
  return upsertWithExecutor(db, inventarioId, barcode, cantidad, modo)
}

async function upsertWithExecutor(executor, inventarioId, barcode, cantidad, modo) {
  const updateClause =
    modo === 'sumar'
      ? 'inventario_detalle.cantidad + VALUES(cantidad)'
      : 'VALUES(cantidad)'

  await executor.execute(
    `
      INSERT INTO inventario_detalle (inventario_id, barcode, cantidad)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        cantidad = ` + updateClause + `,
        updated_at = CURRENT_TIMESTAMP
    `,
    [inventarioId, barcode, cantidad]
  )
}

async function bulkUpsert(inventarioId, rows, modo) {
  return bulkUpsertWithExecutor(db, inventarioId, rows, modo)
}

async function bulkUpsertWithExecutor(executor, inventarioId, rows, modo) {
  if (!rows.length) {
    return
  }

  const clause =
    modo === 'sumar'
      ? 'inventario_detalle.cantidad + VALUES(cantidad)'
      : 'VALUES(cantidad)'

  const sql = `
    INSERT INTO inventario_detalle (inventario_id, barcode, cantidad)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      cantidad = ` + clause + `,
      updated_at = CURRENT_TIMESTAMP
  `

  const chunks = chunkArray(rows, 500)

  for (const chunk of chunks) {
    const values = chunk.map(function mapRow(row) {
      return [inventarioId, row.barcode, row.cantidad]
    })

    await executor.query(sql, [values])
  }
}

async function getSummary(inventarioId) {
  const [rows] = await db.execute(
    `
      SELECT
        COUNT(*) AS registros,
        COALESCE(SUM(cantidad), 0) AS unidades
      FROM inventario_detalle
      WHERE inventario_id = ?
    `,
    [inventarioId]
  )

  return rows[0] || { registros: 0, unidades: 0 }
}

async function listByInventario(inventarioId, sucursalId) {
  const [rows] = await db.execute(
    `
      SELECT
        d.id,
        d.barcode,
        d.cantidad,
        COALESCE(e.codigo, p.codigo, d.barcode) AS codigo,
        COALESCE(e.descripcion, p.descripcion, 'Desconocido') AS descripcion
      FROM inventario_detalle d
      LEFT JOIN existencias e
        ON e.sucursal_id = ? AND e.barcode = d.barcode
      LEFT JOIN productos p
        ON p.id = (
          SELECT p2.id
          FROM productos p2
          WHERE p2.barcode = d.barcode OR p2.codigo = d.barcode
          LIMIT 1
        )
      WHERE d.inventario_id = ?
        AND (COALESCE(e.codigo, p.codigo, NULL) IS NULL OR (COALESCE(e.codigo, p.codigo, NULL) REGEXP '^[0-9]+$' AND CAST(COALESCE(e.codigo, p.codigo, NULL) AS UNSIGNED) BETWEEN 1101001 AND 9905007))
      ORDER BY CAST(COALESCE(e.codigo, p.codigo, '999999999') AS UNSIGNED) ASC, descripcion ASC, d.barcode ASC
    `,
    [sucursalId, inventarioId]
  )

  return rows
}


async function listForMobileByInventario(inventarioId, sucursalId) {
  const [rows] = await db.execute(
    `
      SELECT
        d.id,
        d.barcode,
        d.cantidad,
        d.updated_at,
        COALESCE(e.codigo, p.codigo, d.barcode) AS codigo,
        COALESCE(e.descripcion, p.descripcion, 'Desconocido') AS descripcion
      FROM inventario_detalle d
      LEFT JOIN existencias e
        ON e.sucursal_id = ? AND e.barcode = d.barcode
      LEFT JOIN productos p
        ON p.id = (
          SELECT p2.id
          FROM productos p2
          WHERE p2.barcode = d.barcode OR p2.codigo = d.barcode
          LIMIT 1
        )
      WHERE d.inventario_id = ?
        AND (COALESCE(e.codigo, p.codigo, NULL) IS NULL OR (COALESCE(e.codigo, p.codigo, NULL) REGEXP '^[0-9]+$' AND CAST(COALESCE(e.codigo, p.codigo, NULL) AS UNSIGNED) BETWEEN 1101001 AND 9905007))
      ORDER BY CAST(COALESCE(e.codigo, p.codigo, '999999999') AS UNSIGNED) ASC, descripcion ASC, d.barcode ASC
    `,
    [sucursalId, inventarioId]
  )

  return rows
}

async function updateCantidadById(detalleId, inventarioId, cantidad) {
  await db.execute(
    `
      UPDATE inventario_detalle
      SET cantidad = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND inventario_id = ?
    `,
    [cantidad, detalleId, inventarioId]
  )
}

async function deleteById(detalleId, inventarioId) {
  await db.execute(
    `
      DELETE FROM inventario_detalle
      WHERE id = ? AND inventario_id = ?
    `,
    [detalleId, inventarioId]
  )
}

async function getExportRows(inventarioId) {
  const [rows] = await db.execute(
    `
      SELECT
        d.barcode,
        d.cantidad,
        COALESCE(e.codigo, p.codigo, d.barcode) AS codigo,
        COALESCE(e.descripcion, p.descripcion, 'Desconocido') AS descripcion
      FROM inventario_detalle d
      LEFT JOIN inventarios i ON i.id = d.inventario_id
      LEFT JOIN existencias e
        ON e.sucursal_id = i.sucursal_id AND e.barcode = d.barcode
      LEFT JOIN productos p
        ON p.id = (
          SELECT p2.id
          FROM productos p2
          WHERE p2.barcode = d.barcode OR p2.codigo = d.barcode
          LIMIT 1
        )
      WHERE d.inventario_id = ?
      ORDER BY CAST(COALESCE(e.codigo, p.codigo, '999999999') AS UNSIGNED) ASC, descripcion ASC, d.barcode ASC
    `,
    [inventarioId]
  )

  return rows
}

module.exports = {
  upsert,
  upsertWithExecutor,
  bulkUpsert,
  bulkUpsertWithExecutor,
  getSummary,
  listByInventario,
  listForMobileByInventario,
  updateCantidadById,
  deleteById,
  getExportRows
}
