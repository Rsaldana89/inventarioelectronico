const express = require('express')
const mobileAuthController = require('../controllers/mobileAuthController')
const mobileCatalogController = require('../controllers/mobileCatalogController')
const mobileSyncController = require('../controllers/mobileSyncController')
const mobileInventoryController = require('../controllers/mobileInventoryController')
const mobileBranchController = require('../controllers/mobileBranchController')
const { ensureApiAuthenticated } = require('../middlewares/apiAuth')

// Additional controllers for extended mobile API features

// Inventory summary and proforma views are served by the inventory controller.
// A search endpoint is exposed from the catalog controller.

const router = express.Router()

router.post('/auth/login', mobileAuthController.login)
router.get('/catalog', ensureApiAuthenticated, mobileCatalogController.getCatalog)
// Search product by identifier (barcode or SKU)
router.get('/product/:identifier', ensureApiAuthenticated, mobileCatalogController.searchProduct)
router.get('/branches', ensureApiAuthenticated, mobileBranchController.listBranches)
router.get('/branches/:branchId/catalog', ensureApiAuthenticated, mobileBranchController.getBranchCatalog)
router.get('/inventories/open', ensureApiAuthenticated, mobileInventoryController.listOpenInventories)
router.get('/inventories/:id', ensureApiAuthenticated, mobileInventoryController.getInventoryDetails)
// Inventory summary (expected vs counted counts)
router.get('/inventories/:id/summary', ensureApiAuthenticated, mobileInventoryController.getInventorySummary)
// Inventory proforma rows
router.get('/inventories/:id/proforma', ensureApiAuthenticated, mobileInventoryController.getInventoryProforma)
router.delete('/inventories/:id', ensureApiAuthenticated, mobileInventoryController.deleteInventory)
router.post('/inventories/sync', ensureApiAuthenticated, mobileSyncController.syncInventory)

module.exports = router
