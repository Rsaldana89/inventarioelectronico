require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const db = require('./db');
const { injectLocals } = require('./middlewares/auth');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const existenciasRoutes = require('./routes/existenciasRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');

const app = express();
const uploadDir = path.join(__dirname, 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.formatQty = function formatQty(value) {
  const number = Number(value || 0);

  if (Number.isInteger(number)) {
    return String(number);
  }

  return number.toFixed(2).replace(/\.?0+$/, '');
};

app.locals.formatDate = function formatDate(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return new Date(value).toISOString().slice(0, 10);
};

app.locals.formatDateTime = function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  // Solo mostrar hasta minutos; los segundos no son relevantes para identificar registros recientes.
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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
);
app.use(injectLocals);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', function health(req, res) {
  res.status(200).json({ ok: true });
});

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', existenciasRoutes);
app.use('/', inventarioRoutes);

app.use(function notFound(req, res) {
  res.status(404).render('404', {
    title: 'No encontrado'
  });
});

app.use(function onError(error, req, res, next) {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).render('500', {
    title: 'Error'
  });

  return undefined;
});

const port = Number(process.env.PORT || 3000);

async function bootstrap() {
  try {
    const connection = await db.getConnection();
    console.log('MySQL conectado correctamente.');
    connection.release();
  } catch (error) {
    console.error('No se pudo validar la conexion a MySQL al iniciar:', error.message);
  }

  app.listen(port, function onListening() {
    console.log('Servidor escuchando en http://localhost:' + port);
  });
}

bootstrap();
