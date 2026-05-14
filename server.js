require('dotenv').config()

// Establecer huso horario para todo el proceso Node.  Con esto,
// Date.now() y new Date() utilizarán la zona especificada.  Por
// defecto usamos America/Mexico_City (UTC-6), pero se puede
// sobreescribir con la variable APP_TIMEZONE en .env.
process.env.TZ = process.env.APP_TIMEZONE || 'America/Mexico_City';

const fs = require('fs')
const path = require('path')
const express = require('express')
const session = require('express-session')
const db = require('./db')
const { injectLocals } = require('./middlewares/auth')

const mobileApiRoutes = require('./routes/mobileApiRoutes')
const userRoutes = require('./routes/userRoutes')
const { syncUsers } = require('./services/userSync')
const authRoutes = require('./routes/authRoutes')
const dashboardRoutes = require('./routes/dashboardRoutes')
const existenciasRoutes = require('./routes/existenciasRoutes')
const proformaRoutes = require('./routes/proformaRoutes')
const inventarioRoutes = require('./routes/inventarioRoutes')

const app = express()
const uploadDir = path.join(__dirname, 'uploads')

fs.mkdirSync(uploadDir, { recursive: true })

app.set('trust proxy', 1)
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.locals.formatQty = function formatQty(value) {
  const number = Number(value || 0)

  if (Number.isInteger(number)) {
    return String(number)
  }

  return number.toFixed(2).replace(/\.?0+$/, '')
}

app.locals.formatDate = function formatDate(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.slice(0, 10)
  }

  return new Date(value).toISOString().slice(0, 10)
}

app.locals.formatDateTime = function formatDateTime(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(express.json({ limit: '5mb' }))
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'session_secret_cambiar',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
)
app.use(injectLocals)
app.use(express.static(path.join(__dirname, 'public')))

app.get('/health', function health(req, res) {
  res.status(200).json({ ok: true, status: 'ok' })
})
app.get('/api/health', function apiHealth(req, res) {
  res.status(200).json({ ok: true, status: 'ok' })
})

app.use('/', mobileApiRoutes)
app.use('/api', mobileApiRoutes)
app.use('/', authRoutes)
app.use('/', dashboardRoutes)
app.use('/', existenciasRoutes)
app.use('/', proformaRoutes)
app.use('/', inventarioRoutes)
app.use('/', userRoutes)

app.use(function notFound(req, res) {
  if (isApiRequest(req)) {
    return res.status(404).json({ error: 'Ruta no encontrada.' })
  }

  return res.status(404).render('404', {
    title: 'No encontrado'
  })
})

app.use(function onError(error, req, res, next) {
  console.error(error)

  if (res.headersSent) {
    return next(error)
  }

  if (isApiRequest(req)) {
    return res.status(error.statusCode || 500).json({
      error: error.publicMessage || 'Error interno del servidor.'
    })
  }

  return res.status(500).render('500', {
    title: 'Error'
  })
})

function isApiRequest(req) {
  const pathName = req.path || ''
  return (
    pathName.startsWith('/api/') ||
    pathName === '/catalog' ||
    pathName === '/inventories/sync' ||
    pathName === '/inventories/open' ||
    pathName.startsWith('/inventories/') ||
    pathName === '/branches' ||
    pathName.startsWith('/branches/') ||
    pathName.startsWith('/auth/') ||
    String(req.headers.accept || '').includes('application/json')
  )
}

const port = Number(process.env.PORT || 3000)

async function bootstrap() {
  try {
    const connection = await db.getConnection()
    console.log('MySQL conectado correctamente.')
    connection.release()
  } catch (error) {
    console.error('No se pudo validar la conexion a MySQL al iniciar:', error.message)
  }

  // Ejecutar sincronización inicial y programar sincronizaciones cada 3 días (259200000 ms).
  try {
    await syncUsers();
    console.log('Sincronización inicial de usuarios completada.');
  } catch (err) {
    console.error('Error durante la sincronización inicial de usuarios:', err.message);
  }
  // Intervalo de 3 días en milisegundos.
  const intervalMs = 3 * 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const result = await syncUsers();
      console.log(`Sincronización periódica completada: ${result.inserted} nuevos usuarios, ${result.updated} contraseñas actualizadas.`);
    } catch (err) {
      console.error('Error durante la sincronización periódica de usuarios:', err.message);
    }
  }, intervalMs);

  app.listen(port, function onListening() {
    console.log('Servidor escuchando en http://localhost:' + port)
  })
}

bootstrap()
