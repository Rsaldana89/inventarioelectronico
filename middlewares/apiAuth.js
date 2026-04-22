const { verifyToken } = require('../utils/jwt')

function ensureApiAuthenticated(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || '')
    const match = authHeader.match(/^Bearer\s+(.+)$/i)

    if (!match) {
      return res.status(401).json({ error: 'Token Bearer requerido.' })
    }

    const payload = verifyToken(match[1])

    req.apiUser = {
      id: Number(payload.sub || payload.id || 0),
      username: String(payload.username || ''),
      rol: String(payload.rol || ''),
      sucursal_id: payload.sucursal_id == null ? null : Number(payload.sucursal_id),
      sucursal_nombre: payload.sucursal_nombre || null
    }

    if (!req.apiUser.id || !req.apiUser.username) {
      return res.status(401).json({ error: 'Token invalido.' })
    }

    return next()
  } catch (error) {
    const message = error.message === 'Token expirado' ? 'Token expirado.' : 'Token invalido.'
    return res.status(401).json({ error: message })
  }
}

module.exports = {
  ensureApiAuthenticated
}
