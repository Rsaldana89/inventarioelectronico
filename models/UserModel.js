const db = require('../db')

async function findByUsername(username) {
  const [rows] = await db.execute(
    `
      SELECT
        u.id,
        u.username,
        u.password,
        u.rol,
        u.sucursal_id,
        s.nombre AS sucursal_nombre
      FROM usuarios u
      LEFT JOIN sucursales s ON s.id = u.sucursal_id
      WHERE u.username = ?
      LIMIT 1
    `,
    [username]
  )

  return rows[0] || null
}

module.exports = {
  findByUsername
}
