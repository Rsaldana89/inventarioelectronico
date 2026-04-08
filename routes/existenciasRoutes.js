const express = require('express');
const upload = require('../middlewares/upload');
const existenciasController = require('../controllers/existenciasController');
const {
  ensureAuthenticated,
  ensureAdmin
} = require('../middlewares/auth');

const router = express.Router();

router.get('/existencias', ensureAuthenticated, existenciasController.showExistencias);
router.post(
  '/upload-existencias',
  ensureAuthenticated,
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
