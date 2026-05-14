const UserModel = require('../models/UserModel')
const SucursalModel = require('../models/SucursalModel')
const { signToken } = require('../utils/jwt')

function isControlRole(role) {
  return ['admin', 'manager'].includes(String(role || '').toLowerCase())
}

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '').trim()
    const branch = String(req.body.branch || '').trim()

    if (!username || !password) {
      return res.status(400).json({ error: 'Debes enviar username y password.' })
    }

    const user = await UserModel.findByUsername(username)

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' })
    }

    let sucursalId = user.sucursal_id == null ? null : Number(user.sucursal_id)
    let sucursalNombre = user.sucursal_nombre || null
    let sucursalCodigo = user.sucursal_codigo || null

    // Branch users are always bound to their assigned branch. Control users
    // (admin/manager) may optionally send a branch code/id/name to start with a
    // selected branch, but they can also choose it later through GET /branches.
    if (!sucursalId && branch) {
      const resolvedSucursal = await SucursalModel.findByIdCodigoOrName(branch)
      if (resolvedSucursal) {
        sucursalId = Number(resolvedSucursal.id)
        sucursalNombre = resolvedSucursal.nombre
        sucursalCodigo = resolvedSucursal.codigo || null
      }
    }

    const token = signToken({
      sub: String(user.id),
      id: Number(user.id),
      username: user.username,
      rol: user.rol,
      sucursal_id: sucursalId,
      sucursal_nombre: sucursalNombre,
      sucursal_codigo: sucursalCodigo
    })

    return res.status(200).json({
      token,
      userId: String(user.id),
      displayName: user.username,
      branch: sucursalNombre || branch || null,
      branchId: sucursalId,
      branchCode: sucursalCodigo,
      role: user.rol,
      isControlUser: isControlRole(user.rol)
    })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  login
}
