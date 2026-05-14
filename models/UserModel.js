const db = require('../db');

/**
 * Fetch a user by username.
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
async function findByUsername(username) {
  const [rows] = await db.execute(
    `
      SELECT
        u.id,
        u.username,
        u.password,
        u.rol,
        u.sucursal_id,
        s.nombre AS sucursal_nombre,
        s.codigo AS sucursal_codigo
      FROM usuarios u
      LEFT JOIN sucursales s ON s.id = u.sucursal_id
      WHERE u.username = ?
      LIMIT 1
    `,
    [username]
  );

  return rows[0] || null;
}

/**
 * Fetch all users.
 * Returns an array of objects containing id, username, rol and sucursal.
 * Used by the admin dashboard to list existing users.
 * @returns {Promise<Array<Object>>}
 */
async function findAll() {
  const [rows] = await db.execute(
    `
      SELECT
        u.id,
        u.username,
        u.rol,
        u.sucursal_id,
        s.nombre AS sucursal_nombre,
        s.codigo AS sucursal_codigo
      FROM usuarios u
      LEFT JOIN sucursales s ON s.id = u.sucursal_id
      ORDER BY u.username ASC
    `
  );
  return rows;
}

/**
 * Fetch a user by id.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function findById(id) {
  const [rows] = await db.execute(
    `
      SELECT
        u.id,
        u.username,
        u.password,
        u.rol,
        u.sucursal_id,
        s.nombre AS sucursal_nombre,
        s.codigo AS sucursal_codigo
      FROM usuarios u
      LEFT JOIN sucursales s ON s.id = u.sucursal_id
      WHERE u.id = ?
      LIMIT 1
    `,
    [id]
  );
  return rows[0] || null;
}

/**
 * Update the role of a user.
 * Only accepts allowed roles ('admin','manager','user').
 * @param {number} id
 * @param {string} role
 */
async function updateRole(id, role) {
  // Admitimos roles admin, manager, sucursal y user.  Roles antiguos
  // como "sucursal" siguen siendo válidos porque representan
  // usuarios de sucursal.
  const allowed = ['admin', 'manager', 'sucursal', 'user'];
  if (!allowed.includes(role)) {
    throw new Error(`Rol inválido: ${role}`);
  }
  await db.execute(
    `
      UPDATE usuarios
      SET rol = ?
      WHERE id = ?
    `,
    [role, id]
  );
}

/**
 * Insert a new user.
 * @param {string} username
 * @param {string} password
 * @param {string} role
 * @returns {Promise<number>} Inserted user id
 */
async function createUser(username, password, role = 'user') {
  const [result] = await db.execute(
    `
      INSERT INTO usuarios (username, password, rol, sucursal_id)
      VALUES (?, ?, ?, NULL)
    `,
    [username, password, role]
  );
  return result.insertId;
}

/**
 * Update password for a user.
 * @param {number} id
 * @param {string} password
 */
async function updatePassword(id, password) {
  await db.execute(
    `
      UPDATE usuarios
      SET password = ?
      WHERE id = ?
    `,
    [password, id]
  );
}

module.exports = {
  findByUsername,
  findAll,
  findById,
  updateRole,
  createUser,
  updatePassword
};
