const db = require('../db')

async function getAll() {
  const [rows] = await db.query(
    'SELECT id, nombre FROM sucursales ORDER BY nombre ASC'
  )

  return rows
}

async function getById(id) {
  const [rows] = await db.execute(
    'SELECT id, nombre FROM sucursales WHERE id = ? LIMIT 1',
    [id]
  )

  return rows[0] || null
}

async function ensureById(id, name) {
  const numericId = Number(id)
  if (!numericId || Number.isNaN(numericId)) {
    return null
  }

  const existing = await getById(numericId)
  if (existing) {
    return existing
  }

  const safeName = String(name || '').trim() || ('Almacen ' + numericId)
  await db.execute(
    `
      INSERT INTO sucursales (id, nombre)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE nombre = nombre
    `,
    [numericId, safeName]
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
      SELECT id, nombre
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
      SELECT id, nombre
      FROM sucursales
      WHERE nombre LIKE ?
      ORDER BY nombre ASC
      LIMIT 1
    `,
    ['%' + normalizedName + '%']
  )

  return likeRows[0] || null
}

module.exports = {
  getAll,
  getById,
  ensureById,
  findByName
}
