const express = require('express');
const upload = require('../middlewares/upload');
const inventarioController = require('../controllers/inventarioController');
const { ensureAuthenticated } = require('../middlewares/auth');

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
router.post('/inventarios/:id/cerrar', ensureAuthenticated, inventarioController.closeInventario);
router.post(
  '/inventarios/:id/upload',
  ensureAuthenticated,
  upload.single('archivo'),
  inventarioController.uploadInventarioArchivo
);
router.get('/export/:inventario_id', ensureAuthenticated, inventarioController.exportInventario);

module.exports = router;
