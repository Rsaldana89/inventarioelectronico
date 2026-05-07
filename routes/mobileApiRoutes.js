const express = require('express')
const mobileAuthController = require('../controllers/mobileAuthController')
const mobileCatalogController = require('../controllers/mobileCatalogController')
const mobileSyncController = require('../controllers/mobileSyncController')
const mobileInventoryController = require('../controllers/mobileInventoryController')
const { ensureApiAuthenticated } = require('../middlewares/apiAuth')

const router = express.Router()

router.post('/auth/login', mobileAuthController.login)
router.get('/catalog', ensureApiAuthenticated, mobileCatalogController.getCatalog)
router.get('/inventories/open', ensureApiAuthenticated, mobileInventoryController.listOpenInventories)
router.get('/inventories/:id', ensureApiAuthenticated, mobileInventoryController.getInventoryDetails)
router.delete('/inventories/:id', ensureApiAuthenticated, mobileInventoryController.deleteInventory)
router.post('/inventories/sync', ensureApiAuthenticated, mobileSyncController.syncInventory)

module.exports = router
