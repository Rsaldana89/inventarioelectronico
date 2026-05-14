const db = require('../db')

function normalizeCodigo(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^[0-9]+$/.test(raw)) return raw.padStart(3, '0')
  return raw
}

function getTipoByCodigo(codigo, fallback = 'sucursal') {
  const normalized = normalizeCodigo(codigo)
  if (/^[0-9]+$/.test(normalized)) {
    const numeric = Number(normalized)
    return numeric >= 1 && numeric <= 200 ? fallback : 'almacen'
  }
  return fallback
}

async function getAll() {
  const [rows] = await db.query(
    `
      SELECT id, codigo, tipo, nombre
      FROM sucursales
      ORDER BY
        CASE WHEN tipo = 'sucursal' THEN 0 ELSE 1 END,
        CASE
          WHEN codigo REGEXP '^[0-9]+$' THEN CAST(codigo AS UNSIGNED)
          ELSE id
        END,
        nombre ASC
    `
  )

  return rows
}

async function getById(id) {
  const [rows] = await db.execute(
    'SELECT id, codigo, tipo, nombre FROM sucursales WHERE id = ? LIMIT 1',
    [id]
  )

  return rows[0] || null
}

async function getByCodigo(codigo) {
  const normalizedCodigo = normalizeCodigo(codigo)
  if (!normalizedCodigo) return null

  const [rows] = await db.execute(
    'SELECT id, codigo, tipo, nombre FROM sucursales WHERE codigo = ? ORDER BY id ASC LIMIT 1',
    [normalizedCodigo]
  )

  return rows[0] || null
}

async function ensureById(id, name, tipo = 'almacen') {
  const numericId = Number(id)
  if (!numericId || Number.isNaN(numericId)) {
    return null
  }

  const existing = await getById(numericId)
  if (existing) {
    return existing
  }

  const codigo = normalizeCodigo(numericId)
  const safeName = String(name || '').trim() || ('Almacen ' + numericId)
  const safeTipo = tipo || getTipoByCodigo(codigo, 'almacen')

  await db.execute(
    `
      INSERT INTO sucursales (id, codigo, tipo, nombre)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        codigo = VALUES(codigo),
        tipo = VALUES(tipo),
        nombre = VALUES(nombre)
    `,
    [numericId, codigo, safeTipo, safeName]
  )

  return getById(numericId)
}

async function ensureByCodigo(codigo, fallbackName, tipo = 'almacen') {
  const normalizedCodigo = normalizeCodigo(codigo)
  if (!normalizedCodigo || !/^[0-9]+$/.test(normalizedCodigo)) {
    return null
  }

  const existing = await getByCodigo(normalizedCodigo)
  if (existing) {
    return existing
  }

  const numericId = Number(normalizedCodigo)
  const safeTipo = tipo || getTipoByCodigo(normalizedCodigo, 'almacen')
  const safeName = String(fallbackName || '').trim() || `${normalizedCodigo} - Almacen ${numericId}`

  await db.execute(
    `
      INSERT INTO sucursales (id, codigo, tipo, nombre)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        codigo = VALUES(codigo),
        tipo = VALUES(tipo),
        nombre = VALUES(nombre)
    `,
    [numericId, normalizedCodigo, safeTipo, safeName]
  )

  return getById(numericId)
}

async function findByName(name) {
  const normalizedName = String(name || '').trim()

  if (!normalizedName) {
    return null
  }

  const [exactRows] = await db.execute(
    `
      SELECT id, codigo, tipo, nombre
      FROM sucursales
      WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?))
      LIMIT 1
    `,
    [normalizedName]
  )

  if (exactRows[0]) {
    return exactRows[0]
  }

  const [likeRows] = await db.execute(
    `
      SELECT id, codigo, tipo, nombre
      FROM sucursales
      WHERE nombre LIKE ?
      ORDER BY nombre ASC
      LIMIT 1
    `,
    ['%' + normalizedName + '%']
  )

  return likeRows[0] || null
}

async function findByIdCodigoOrName(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d+$/.test(raw)) {
    const normalizedCodigo = normalizeCodigo(raw)

    const [rows] = await db.execute(
      `
        SELECT id, codigo, tipo, nombre
        FROM sucursales
        WHERE id = ? OR codigo = ? OR codigo = ?
        ORDER BY
          CASE WHEN codigo = ? THEN 0 WHEN id = ? THEN 1 ELSE 2 END,
          id ASC
        LIMIT 1
      `,
      [Number(raw), raw, normalizedCodigo, normalizedCodigo, Number(raw)]
    )

    if (rows[0]) return rows[0]
  }

  const byName = await findByName(raw)
  return byName || null
}

module.exports = {
  getAll,
  getById,
  getByCodigo,
  ensureById,
  ensureByCodigo,
  findByName,
  findByIdCodigoOrName,
  normalizeCodigo
}
