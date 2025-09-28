const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticateUser, requireParent } = require('../middleware/auth');

// All routes require authentication and parent role
router.use(authenticateUser);
router.use(requireParent);

// Dashboard routes
router.get('/', dashboardController.getParentDashboard);
router.get('/date/:date', dashboardController.getDateDeliveries);

module.exports = router; 