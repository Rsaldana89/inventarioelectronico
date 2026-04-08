const db = require('../db');

async function findByUsername(username) {
  const [rows] = await db.execute(
    'SELECT id, username, password, rol, sucursal_id FROM usuarios WHERE username = ? LIMIT 1',
    [username]
  );

  return rows[0] || null;
}

module.exports = {
  findByUsername
};
