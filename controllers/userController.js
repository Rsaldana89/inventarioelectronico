const UserModel = require('../models/UserModel');
const { setFlash } = require('../middlewares/auth');
const { syncUsers } = require('../services/userSync');

/**
 * Muestra la lista de usuarios para administración.
 * Solo accesible para roles admin/manager.
 */
async function listUsers(req, res, next) {
  try {
    const users = await UserModel.findAll();
    return res.render('users', {
      title: 'Administrar usuarios',
      users
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Actualiza el rol de un usuario. Recibe el ID como parámetro y el rol en el body.
 */
async function updateRole(req, res, next) {
  const id = Number(req.params.id);
  const role = String(req.body.role || '').trim();
  try {
    await UserModel.updateRole(id, role);
    setFlash(req, 'success', 'Rol actualizado correctamente.');
    return res.redirect('/admin/users');
  } catch (err) {
    setFlash(req, 'error', err.message);
    return res.redirect('/admin/users');
  }
}

/**
 * Maneja la sincronización manual de usuarios desde la base remota.
 */
async function handleSync(req, res, next) {
  try {
    const result = await syncUsers();
    // Construir mensaje dinámico con los contadores
    const parts = [];
    if (result.inserted > 0) parts.push(`${result.inserted} nuevos usuarios`);
    if (result.updated > 0) parts.push(`${result.updated} contraseñas actualizadas`);
    if (result.branchesCreatedOrLinked > 0) parts.push(`${result.branchesCreatedOrLinked} sucursales asociadas`);
    if (parts.length === 0) {
      parts.push('no se detectaron cambios');
    }
    setFlash(
      req,
      'success',
      `Sincronización completada: ${parts.join(', ')}.`
    );
    return res.redirect('/admin/users');
  } catch (err) {
    setFlash(req, 'error', err.message);
    return res.redirect('/admin/users');
  }
}

module.exports = {
  listUsers,
  updateRole,
  handleSync
};