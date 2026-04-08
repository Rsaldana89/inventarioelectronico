const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { ensureAuthenticated } = require('../middlewares/auth');

const router = express.Router();

router.get('/dashboard', ensureAuthenticated, dashboardController.showDashboard);
router.get('/inventarios', ensureAuthenticated, dashboardController.showDashboard);

module.exports = router;
