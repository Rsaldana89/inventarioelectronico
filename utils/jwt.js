const crypto = require('crypto')

function getSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'jwt_secret_cambiar'
}

function base64UrlEncode(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value))
  return input
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
  return Buffer.from(padded, 'base64').toString('utf8')
}

function signToken(payload, options) {
  const now = Math.floor(Date.now() / 1000)
  const expiresInSec = Number((options && options.expiresInSec) || process.env.JWT_EXPIRES_IN_SECONDS || 60 * 60 * 24 * 30)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSec
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(body))
  const data = encodedHeader + '.' + encodedPayload
  const signature = crypto.createHmac('sha256', getSecret()).update(data).digest()

  return data + '.' + base64UrlEncode(signature)
}

function verifyToken(token) {
  const rawToken = String(token || '').trim()
  const parts = rawToken.split('.')

  if (parts.length !== 3) {
    throw new Error('Token invalido')
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const data = encodedHeader + '.' + encodedPayload
  const expectedSignature = crypto.createHmac('sha256', getSecret()).update(data).digest()
  const receivedSignature = Buffer.from(
    base64UrlDecodeToBinary(encodedSignature),
    'binary'
  )

  if (
    expectedSignature.length !== receivedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    throw new Error('Firma invalida')
  }

  let payload
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload))
  } catch (error) {
    throw new Error('Payload invalido')
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && now >= Number(payload.exp)) {
    throw new Error('Token expirado')
  }

  return payload
}

function base64UrlDecodeToBinary(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
  return Buffer.from(padded, 'base64').toString('binary')
}

module.exports = {
  signToken,
  verifyToken
}
