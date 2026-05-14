const localPool = require('../db');
const remotePool = require('../remoteDb');

/*
 * Rango de códigos para sucursales. Cualquier usuario cuyo nombre de
 * usuario comience con tres dígitos entre 001 y 200 se considera de
 * sucursal y se le asignará automáticamente al registro de sucursal
 * correspondiente. Los usuarios fuera de este rango se crean como
 * usuarios generales (rol "user").
 */
const SUCURSAL_CODE_MIN = 1;
const SUCURSAL_CODE_MAX = 200;

/**
 * Dada una cadena de usuario, detecta si corresponde a una sucursal.
 * Si coincide, devuelve un objeto con código y nombre de sucursal.
 * De lo contrario, devuelve null.
 *
 * @param {string} username
 * @returns {{codigo:string,nombre:string}|null}
 */
function getSucursalFromUsername(username) {
  const value = String(username || '').trim();
  const match = value.match(/^([0-9]{3})(?:[_-]?(.*))?$/);
  if (!match) return null;
  const codigo = match[1];
  const numericCode = Number(codigo);
  if (numericCode < SUCURSAL_CODE_MIN || numericCode > SUCURSAL_CODE_MAX) return null;
  const rawName = String(match[2] || '').trim();
  const cleanName = rawName
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    codigo,
    nombre: cleanName ? `${codigo} - ${cleanName}` : `Sucursal ${codigo}`
  };
}

/**
 * Asegura que la tabla sucursales tenga las columnas y claves necesarias.
 * Crea la columna codigo si no existe, rellena codigo a partir del nombre
 * para sucursales antiguas (ej. "001_abastos" -> codigo "001") y
 * crea el índice único uk_sucursales_codigo.  Si aún existen duplicados,
 * el índice no se crea pero no se lanza un error fatal.  Después de
 * corregir duplicados, se puede volver a ejecutar manualmente.
 */
async function ensureSucursalSchema() {
  // Agregar columna codigo si no existe
  try {
    await localPool.execute(
      'ALTER TABLE sucursales ADD COLUMN codigo VARCHAR(10) NULL AFTER id'
    );
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      throw err;
    }
  }

  // Agregar columna tipo si no existe
  try {
    await localPool.execute(
      "ALTER TABLE sucursales ADD COLUMN tipo ENUM('sucursal','almacen') NOT NULL DEFAULT 'sucursal' AFTER codigo"
    );
  } catch (err) {
    if (err && err.code !== 'ER_DUP_FIELDNAME') {
      throw err;
    }
  }

  // Rellenar codigo de sucursales antiguas cuyos nombres comiencen con 3 dígitos
  await localPool.execute(`
    UPDATE sucursales
    SET codigo = LEFT(nombre, 3)
    WHERE (codigo IS NULL OR codigo = '')
      AND nombre REGEXP '^[0-9]{3}'
  `);

  // Marcar como almacén los registros auxiliares creados por proforma.
  await localPool.execute(`
    UPDATE sucursales
    SET tipo = 'almacen'
    WHERE nombre LIKE 'Almacen %'
       OR (codigo REGEXP '^[0-9]+$' AND CAST(codigo AS UNSIGNED) > 200)
  `);

  // Crear clave única en codigo; ignorar errores por duplicados existentes
  try {
    await localPool.execute(
      'ALTER TABLE sucursales ADD UNIQUE KEY uk_sucursales_codigo (codigo)'
    );
  } catch (err) {
    if (
      err &&
      err.code !== 'ER_DUP_KEYNAME' &&
      err.code !== 'ER_DUP_ENTRY'
    ) {
      throw err;
    }
  }
}

/**
 * Busca o crea la sucursal identificada por un código.  Si ya existe,
 * actualiza su nombre.  Devuelve el ID local de la sucursal.
 *
 * @param {{codigo:string,nombre:string}} sucursalInfo
 * @returns {Promise<number|null>}
 */
async function ensureSucursal(sucursalInfo) {
  if (!sucursalInfo) return null;
  await ensureSucursalSchema();
  const [existing] = await localPool.execute(
    'SELECT id, nombre, tipo FROM sucursales WHERE codigo = ? ORDER BY id ASC LIMIT 1',
    [sucursalInfo.codigo]
  );
  if (existing.length > 0) {
    const row = existing[0];
    if (row.nombre !== sucursalInfo.nombre || row.tipo !== 'sucursal') {
      await localPool.execute(
        "UPDATE sucursales SET nombre = ?, tipo = 'sucursal' WHERE id = ?",
        [sucursalInfo.nombre, row.id]
      );
    }
    return row.id;
  }
  const sucursalId = Number(sucursalInfo.codigo);
  await localPool.execute(
    `
      INSERT INTO sucursales (id, codigo, tipo, nombre)
      VALUES (?, ?, 'sucursal', ?)
      ON DUPLICATE KEY UPDATE
        codigo = VALUES(codigo),
        tipo = 'sucursal',
        nombre = VALUES(nombre)
    `,
    [sucursalId, sucursalInfo.codigo, sucursalInfo.nombre]
  );
  return sucursalId;
}

/**
 * Obtiene todos los usuarios activos de la base remota Soporte 360.
 * Utiliza la tabla users y el campo password_plain como contraseña.
 *
 * @returns {Promise<Array<{username:string,password:string}>>}
 */
async function getRemoteUsers() {
  const [rows] = await remotePool.execute(`
    SELECT
      username,
      password_plain AS password
    FROM users
    WHERE username IS NOT NULL
      AND username <> ''
      AND password_plain IS NOT NULL
      AND password_plain <> ''
      AND is_active = 1
  `);
  return rows;
}

/**
 * Sincroniza usuarios desde la base remota hacia la base local.
 * Reglas:
 *   - Si no existe el usuario local, se crea con rol "sucursal" si su
 *     username comienza con 001–200; de lo contrario se crea con rol "user".
 *   - Si la contraseña cambió en la remota, se actualiza localmente.
 *   - Nunca se sobreescribe el rol local existente.
 *   - Si un usuario pertenece a una sucursal, se asocia a sucursal_id.
 *
 * Devuelve un objeto con contadores {inserted, updated, branchesCreatedOrLinked}.
 */
async function syncUsers() {
  await ensureSucursalSchema();
  const remoteRows = await getRemoteUsers();
  let inserted = 0;
  let updated = 0;
  let branchesCreatedOrLinked = 0;
  for (const row of remoteRows) {
    const username = String(row.username || '').trim();
    const password = String(row.password || '');
    if (!username || !password) continue;
    // ¿Es usuario de sucursal?
    const sucursalInfo = getSucursalFromUsername(username);
    const sucursalId = sucursalInfo ? await ensureSucursal(sucursalInfo) : null;
    const defaultRole = sucursalInfo ? 'sucursal' : 'user';
    // Buscar usuario local
    const [localRows] = await localPool.execute(
      'SELECT id, password, sucursal_id FROM usuarios WHERE username = ? LIMIT 1',
      [username]
    );
    if (localRows.length === 0) {
      await localPool.execute(
        'INSERT INTO usuarios (username, password, rol, sucursal_id) VALUES (?, ?, ?, ?)',
        [username, password, defaultRole, sucursalId]
      );
      inserted++;
      if (sucursalId) branchesCreatedOrLinked++;
      continue;
    }
    const localUser = localRows[0];
    if (localUser.password !== password) {
      await localPool.execute(
        'UPDATE usuarios SET password = ? WHERE id = ?',
        [password, localUser.id]
      );
      updated++;
    }
    if (sucursalId && Number(localUser.sucursal_id || 0) !== Number(sucursalId)) {
      await localPool.execute(
        'UPDATE usuarios SET sucursal_id = ? WHERE id = ?',
        [sucursalId, localUser.id]
      );
      branchesCreatedOrLinked++;
    }
  }
  return { inserted, updated, branchesCreatedOrLinked };
}

module.exports = {
  syncUsers,
  getSucursalFromUsername
};