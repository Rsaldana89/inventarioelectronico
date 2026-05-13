const express = require('express');
const upload = require('../middlewares/upload');
const proformaController = require('../controllers/proformaController');
const { ensureAuthenticated, ensureAdmin } = require('../middlewares/auth');

const router = express.Router();

// Display a list of proforma uploads and allow import.  Restricted to admin/manager.
router.get('/proforma', ensureAuthenticated, ensureAdmin, proformaController.showProformas);

// Display the current product catalog as an HTML table.  Only admin/manager can view.
router.get('/proforma/catalogo', ensureAuthenticated, ensureAdmin, proformaController.showCatalogo);

// Download the current product catalog as an Excel file.  Only admin/manager can download.
router.get('/proforma/catalogo/download', ensureAuthenticated, ensureAdmin, proformaController.downloadCatalogo);

// Handle uploading a proforma file.  Only admin/manager can upload.
router.post(
  '/upload-proforma',
  ensureAuthenticated,
  ensureAdmin,
  upload.single('archivo'),
  proformaController.uploadProforma
);

// Download a proforma by carga ID.  Only admin/manager can download arbitrary loads.
router.get('/proforma/download/:id', ensureAuthenticated, ensureAdmin, proformaController.downloadProforma);

// Branch users (or admin specifying ?sucursal_id) can download their latest proforma without quantities.
router.get('/proforma/mi-descarga', ensureAuthenticated, proformaController.downloadMyProforma);


// Print proforma: branch users can print their latest proforma (empty mode by default).
router.get('/proforma/imprimir', ensureAuthenticated, proformaController.printProforma);
// Admin/manager can print any proforma by id. Use mode=filled for quantities.
router.get('/proforma/imprimir/:id', ensureAuthenticated, ensureAdmin, proformaController.printProforma);

// Delete a proforma by ID.  Restricted to administrators and managers.
router.post('/proforma/delete/:id', ensureAuthenticated, ensureAdmin, proformaController.deleteProforma);

module.exports = router;