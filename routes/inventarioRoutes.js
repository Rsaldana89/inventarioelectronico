const express = require('express');
const upload = require('../middlewares/upload');
const inventarioController = require('../controllers/inventarioController');
const { ensureAuthenticated, ensureAdmin } = require('../middlewares/auth');

const router = express.Router();

router.post('/inventarios', ensureAuthenticated, inventarioController.createInventario);
router.get('/inventarios/:id', ensureAuthenticated, inventarioController.showInventario);
router.post('/inventario/detalle', ensureAuthenticated, inventarioController.addDetalle);
router.post(
  '/inventario/detalle/:detalleId/update',
  ensureAuthenticated,
  inventarioController.updateDetalle
);
router.post(
  '/inventario/detalle/:detalleId/delete',
  ensureAuthenticated,
  inventarioController.deleteDetalle
);
// Close an inventory. Any authenticated user may close an inventory they can access.
router.post('/inventarios/:id/cerrar', ensureAuthenticated, inventarioController.closeInventario);
router.post(
  '/inventarios/:id/upload',
  ensureAuthenticated,
  upload.single('archivo'),
  inventarioController.uploadInventarioArchivo
);
router.get('/inventarios/:id/imprimir', ensureAuthenticated, inventarioController.printInventario);
router.get('/export/:inventario_id', ensureAuthenticated, inventarioController.exportInventario);

// Delete an inventory (admin/manager only)
router.post('/inventarios/:id/delete', ensureAuthenticated, ensureAdmin, inventarioController.deleteInventario);

module.exports = router;
