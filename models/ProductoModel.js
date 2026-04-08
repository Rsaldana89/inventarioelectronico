const db = require('../db');
const { chunkArray, isValidInventorySku } = require('../utils/common');

async function count() {
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM productos');
  return rows[0] ? Number(rows[0].total || 0) : 0;
}

async function replaceAll(products) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM productos');

    if (products.length) {
      const insertSql = `
        INSERT INTO productos (
          codigo,
          barcode,
          descripcion,
          familia,
          precio_menudeo,
          precio_mayoreo,
          precio_residencial
        ) VALUES ?
      `;

      const chunks = chunkArray(products.filter((p) => isValidInventorySku(p.codigo)), 500);

      for (const chunk of chunks) {
        const values = chunk.map(function mapProduct(product) {
          return [
            product.codigo,
            product.barcode || null,
            product.descripcion,
            product.familia || null,
            product.precio_menudeo,
            product.precio_mayoreo,
            product.precio_residencial
          ];
        });

        if (values.length) {
          await connection.query(insertSql, [values]);
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

async function truncateAll() {
  await db.query('DELETE FROM productos');
}

async function getLookupMaps() {
  const [rows] = await db.query(
    'SELECT codigo, barcode, descripcion, familia FROM productos WHERE codigo REGEXP "^[0-9]+$" AND CAST(codigo AS UNSIGNED) BETWEEN 1100000 AND 2200000'
  );

  const byCodigo = new Map();
  const byBarcode = new Map();

  rows.forEach(function eachRow(row) {
    const normalized = {
      codigo: row.codigo,
      barcode: row.barcode,
      descripcion: row.descripcion,
      familia: row.familia
    };

    if (row.codigo) {
      byCodigo.set(row.codigo, normalized);
    }

    if (row.barcode) {
      byBarcode.set(row.barcode, normalized);
    }
  });

  return { byCodigo, byBarcode };
}

async function findByScan(value) {
  const [rows] = await db.execute(
    `
      SELECT codigo, barcode, descripcion, familia
      FROM productos
      WHERE (codigo = ? OR barcode = ?)
        AND codigo REGEXP '^[0-9]+$'
        AND CAST(codigo AS UNSIGNED) BETWEEN 1100000 AND 2200000
      LIMIT 1
    `,
    [value, value]
  );

  return rows[0] || null;
}

async function getLastUpdatedAt() {
  const [rows] = await db.query('SELECT MAX(updated_at) AS last FROM productos');
  const result = rows && rows[0] ? rows[0].last : null;
  return result || null;
}

module.exports = {
  count,
  replaceAll,
  truncateAll,
  getLookupMaps,
  findByScan,
  getLastUpdatedAt
};
