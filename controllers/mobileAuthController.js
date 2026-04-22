const UserModel = require('../models/UserModel')
const SucursalModel = require('../models/SucursalModel')
const { signToken } = require('../utils/jwt')

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

    if (!sucursalId && branch) {
      const resolvedSucursal = await SucursalModel.findByName(branch)
      if (resolvedSucursal) {
        sucursalId = Number(resolvedSucursal.id)
        sucursalNombre = resolvedSucursal.nombre
      }
    }

    const token = signToken({
      sub: String(user.id),
      id: Number(user.id),
      username: user.username,
      rol: user.rol,
      sucursal_id: sucursalId,
      sucursal_nombre: sucursalNombre
    })

    return res.status(200).json({
      token,
      userId: String(user.id),
      displayName: user.username,
      branch: sucursalNombre || branch || null
    })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  login
}
