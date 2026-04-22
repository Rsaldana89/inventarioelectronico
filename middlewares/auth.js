function setFlash(req, type, text) {
  if (req && req.session) {
    req.session.flash = { type, text };
  }
}

function injectLocals(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  res.locals.currentPath = req.path || '/';

  if (req.session.flash) {
    delete req.session.flash;
  }

  next();
}

function ensureAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }

  setFlash(req, 'error', 'Debes iniciar sesion para continuar.');
  return res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  // Permitir tanto a administradores como a managers acceder a secciones de administración.
  if (req.session.user && isAdmin(req.session.user)) {
    return next();
  }

  setFlash(req, 'error', 'No tienes permiso para entrar a esa seccion.');
  return res.redirect('/dashboard');
}

function isAdmin(user) {
  // Considerar a los roles 'admin' y 'manager' como administradores para efectos de autorización.
  return Boolean(user && (user.rol === 'admin' || user.rol === 'manager'));
}

function canAccessSucursal(user, sucursalId) {
  if (!user) {
    return false;
  }

  if (isAdmin(user)) {
    return true;
  }

  return Number(user.sucursal_id) === Number(sucursalId);
}

module.exports = {
  setFlash,
  injectLocals,
  ensureAuthenticated,
  ensureAdmin,
  isAdmin,
  canAccessSucursal
};
