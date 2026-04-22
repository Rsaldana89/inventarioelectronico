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
  findByName
}
