const UserModel = require('../models/UserModel');
const { setFlash } = require('../middlewares/auth');

async function showLogin(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('login', {
    title: 'Iniciar sesión'
  });
}

async function login(req, res, next) {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();

    if (!username || !password) {
      setFlash(req, 'error', 'Captura usuario y contrasena.');
      return res.redirect('/login');
    }

    const user = await UserModel.findByUsername(username);

    if (!user || user.password !== password) {
      setFlash(req, 'error', 'Credenciales incorrectas.');
      return res.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      rol: user.rol,
      sucursal_id: user.sucursal_id
    };

    setFlash(req, 'success', 'Sesion iniciada correctamente.');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  req.session.destroy(function onDestroyed() {
    res.redirect('/login');
  });
}

function redirectRoot(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/login');
}

module.exports = {
  showLogin,
  login,
  logout,
  redirectRoot
};
