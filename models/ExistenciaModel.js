const db = require('../db');
const { chunkArray } = require('../utils/common');

const VALID_SKU_SQL = "codigo REGEXP '^[0-9]+$' AND CAST(codigo AS UNSIGNED) BETWEEN 1100000 AND 2200000";

async function replaceForSucursal(sucursalId, rows, options) {
  const connection = await db.getConnection();
  const settings = options || {};
  const cargaId = settings.cargaId || null;

  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM existencias WHERE sucursal_id = ?', [sucursalId]);

    if (rows.length) {
      const sqlActual = `
        INSERT INTO existencias (
          sucursal_id,
          codigo,
          barcode,
          descripcion,
          cantidad
        ) VALUES ?
      `;

      const chunks = chunkArray(rows, 500);

      for (const chunk of chunks) {
        const values = chunk.map((row) => [
          sucursalId,
          row.codigo || null,
          row.barcode,
          row.descripcion || null,
          row.cantidad
        ]);
        await connection.query(sqlActual, [values]);
      }

      if (cargaId) {
        const sqlHist = `
          INSERT INTO existencias_detalle (
            carga_id,
            sucursal_id,
            codigo,
            barcode,
            descripcion,
            cantidad
          ) VALUES ?
        `;

        for (const chunk of chunks) {
          const values = chunk.map((row) => [
            cargaId,
            sucursalId,
            row.codigo || null,
            row.barcode,
            row.descripcion || null,
            row.cantidad
          ]);
          await connection.query(sqlHist, [values]);
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getSummaryBySucursal(sucursalId) {
  const [rows] = await db.execute(
    `
      SELECT COUNT(*) AS items, COALESCE(SUM(cantidad), 0) AS unidades
      FROM existencias
      WHERE sucursal_id = ?
        AND ${VALID_SKU_SQL}
    `,
    [sucursalId]
  );
  return rows[0] || { items: 0, unidades: 0 };
}

async function listPagedBySucursal(sucursalId, options) {
  const search = (options && options.search) || '';
  const limit = (options && options.limit) || 100;
  const offset = (options && options.offset) || 0;

  const conditions = ['sucursal_id = ?', VALID_SKU_SQL];
  const params = [sucursalId];

  if (search) {
    conditions.push('(barcode LIKE ? OR codigo LIKE ? OR descripcion LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM existencias ${where}`, params);
  const [rows] = await db.query(
    `
      SELECT id, codigo, barcode, descripcion, cantidad
      FROM existencias
      ${where}
      ORDER BY CAST(codigo AS UNSIGNED) ASC, descripcion ASC, barcode ASC
      LIMIT ? OFFSET ?
    `,
    params.concat([limit, offset])
  );

  return {
    total: countRows[0] ? Number(countRows[0].total || 0) : 0,
    rows
  };
}

async function getBlindSummary(inventarioId, sucursalId, cargaId) {
  const table = cargaId ? 'existencias_detalle' : 'existencias';
  const cargaFilter = cargaId ? 'AND e.carga_id = ?' : '';
  const params = cargaId ? [inventarioId, sucursalId, cargaId] : [inventarioId, sucursalId];

  const [rows] = await db.execute(
    `
      SELECT
        COUNT(*) AS total_esperados,
        SUM(CASE WHEN d.id IS NOT NULL THEN 1 ELSE 0 END) AS contados,
        SUM(CASE WHEN d.id IS NULL THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN e.cantidad = 0 THEN 1 ELSE 0 END) AS con_existencia_cero,
        SUM(CASE WHEN e.cantidad <> 0 THEN 1 ELSE 0 END) AS con_existencia_distinta_cero
      FROM ${table} e
      LEFT JOIN inventario_detalle d ON d.barcode = e.barcode AND d.inventario_id = ?
      WHERE e.sucursal_id = ?
        ${cargaFilter}
        AND ${VALID_SKU_SQL.replace(/codigo/g, 'e.codigo')}
    `,
    params
  );

  return rows[0] || {
    total_esperados: 0,
    contados: 0,
    pendientes: 0,
    con_existencia_cero: 0,
    con_existencia_distinta_cero: 0
  };
}

async function getBlindRowsPaged(inventarioId, sucursalId, options) {
  const search = (options && options.search) || '';
  const limit = (options && options.limit) || 100;
  const offset = (options && options.offset) || 0;
  const showZero = Boolean(options && options.showZero);
  const cargaId = options && options.cargaId ? Number(options.cargaId) : null;
  const table = cargaId ? 'existencias_detalle' : 'existencias';

  const conditions = ['e.sucursal_id = ?', VALID_SKU_SQL.replace(/codigo/g, 'e.codigo')];
  const params = [sucursalId];

  if (cargaId) {
    conditions.push('e.carga_id = ?');
    params.push(cargaId);
  }
  if (search) {
    conditions.push('(e.barcode LIKE ? OR e.codigo LIKE ? OR e.descripcion LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }
  if (!showZero) {
    conditions.push('e.cantidad <> 0');
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM ${table} e LEFT JOIN inventario_detalle d ON d.inventario_id = ? AND d.barcode = e.barcode ${where}`,
    [inventarioId].concat(params)
  );

  const [rows] = await db.query(
    `
      SELECT
        e.codigo,
        e.barcode,
        e.descripcion,
        e.cantidad AS cantidad_esperada,
        COALESCE(d.cantidad, 0) AS cantidad_contada,
        CASE WHEN d.id IS NULL THEN 'pendiente' ELSE 'contado' END AS estado
      FROM ${table} e
      LEFT JOIN inventario_detalle d ON d.inventario_id = ? AND d.barcode = e.barcode
      ${where}
      ORDER BY CAST(e.codigo AS UNSIGNED) ASC, e.descripcion ASC, e.barcode ASC
      LIMIT ? OFFSET ?
    `,
    [inventarioId].concat(params, [limit, offset])
  );

  return {
    total: countRows[0] ? Number(countRows[0].total || 0) : 0,
    rows
  };
}

module.exports = {
  replaceForSucursal,
  getSummaryBySucursal,
  listPagedBySucursal,
  getBlindSummary,
  getBlindRowsPaged
};
