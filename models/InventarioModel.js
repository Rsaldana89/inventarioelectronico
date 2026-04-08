const db = require('../db');

function applyFilters(user, filters) {
  const conditions = ['1 = 1'];
  const params = [];

  if (user.rol !== 'admin') {
    conditions.push('i.sucursal_id = ?');
    params.push(user.sucursal_id);
  } else if (filters.sucursalId) {
    conditions.push('i.sucursal_id = ?');
    params.push(filters.sucursalId);
  }

  if (filters.fechaInicio) {
    conditions.push('i.fecha >= ?');
    params.push(filters.fechaInicio);
  }

  if (filters.fechaFin) {
    conditions.push('i.fecha <= ?');
    params.push(filters.fechaFin);
  }

  return { where: 'WHERE ' + conditions.join(' AND '), params };
}

async function create(data) {
  const [result] = await db.execute(
    `
      INSERT INTO inventarios (sucursal_id, fecha, estado, created_by, origen_existencias, existencia_carga_id)
      VALUES (?, ?, 'abierto', ?, ?, ?)
    `,
    [data.sucursalId, data.fecha, data.createdBy || null, data.origenExistencias || 'sin_existencias', data.existenciaCargaId || null]
  );
  return result.insertId;
}

async function getById(id) {
  const [rows] = await db.execute(
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
        s.nombre AS sucursal_nombre,
        ec.fecha_existencia
      FROM inventarios i
      INNER JOIN sucursales s ON s.id = i.sucursal_id
      LEFT JOIN existencias_cargas ec ON ec.id = i.existencia_carga_id
      WHERE i.id = ?
      LIMIT 1
    `,
    [id]
  );
  return rows[0] || null;
}

async function close(id) {
  await db.execute("UPDATE inventarios SET estado = 'cerrado' WHERE id = ?", [id]);
}

async function listForDashboard(user, filters) {
  const scoped = applyFilters(user, filters);
  const [rows] = await db.query(
    `
      SELECT
        i.id,
        i.fecha,
        i.estado,
        i.origen_existencias,
        i.existencia_carga_id,
        ec.fecha_existencia,
        s.nombre AS sucursal_nombre,
        COUNT(DISTINCT d.id) AS registros_capturados,
        COALESCE(SUM(d.cantidad), 0) AS unidades_capturadas
      FROM inventarios i
      INNER JOIN sucursales s ON s.id = i.sucursal_id
      LEFT JOIN existencias_cargas ec ON ec.id = i.existencia_carga_id
      LEFT JOIN inventario_detalle d ON d.inventario_id = i.id
      ${scoped.where}
      GROUP BY i.id, i.fecha, i.estado, i.origen_existencias, i.existencia_carga_id, ec.fecha_existencia, s.nombre
      ORDER BY i.fecha DESC, i.id DESC
    `,
    scoped.params
  );
  return rows;
}

async function getDashboardSummary(user, filters) {
  const scoped = applyFilters(user, filters);
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
  );
  return rows[0] || { total: 0, abiertos: 0, cerrados: 0 };
}

module.exports = {
  create,
  getById,
  close,
  listForDashboard,
  getDashboardSummary
};
