const express = require('express');
const { ensureAuthenticated, ensureAdmin } = require('../middlewares/auth');
const userController = require('../controllers/userController');

const router = express.Router();

// Listado de usuarios
router.get('/admin/users', ensureAuthenticated, ensureAdmin, userController.listUsers);

// Actualizar rol de un usuario
router.post('/admin/users/:id/role', ensureAuthenticated, ensureAdmin, userController.updateRole);

// Sincronizar usuarios manualmente
router.post('/admin/users/sync', ensureAuthenticated, ensureAdmin, userController.handleSync);

module.exports = router;