const express = require('express');
const upload = require('../middlewares/upload');
const existenciasController = require('../controllers/existenciasController');
const {
  ensureAuthenticated,
  ensureAdmin
} = require('../middlewares/auth');

const router = express.Router();

// Only admin/manager users should access the old existencias page.  The page
// remains available for backward compatibility but is hidden from branch users.
router.get('/existencias', ensureAuthenticated, ensureAdmin, existenciasController.showExistencias);
router.post(
  '/upload-existencias',
  ensureAuthenticated,
  ensureAdmin,
  upload.single('archivo'),
  existenciasController.uploadExistencias
);
router.post(
  '/upload-productos',
  ensureAuthenticated,
  ensureAdmin,
  upload.single('archivo'),
  existenciasController.uploadCatalogo
);

router.post(
  '/delete-productos',
  ensureAuthenticated,
  ensureAdmin,
  existenciasController.deleteCatalogo
);

module.exports = router;
