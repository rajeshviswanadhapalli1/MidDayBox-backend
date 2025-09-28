const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateUser, requireParent, requireDeliveryBoy, requireSchool } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateUser);

// Parent routes
router.use('/parent', requireParent);
router.post('/parent/create', orderController.createOrder);
router.get('/parent/orders', orderController.getParentOrders);
router.get('/parent/orders/:orderId', orderController.getOrderById);

// Delivery boy routes
router.use('/delivery', requireDeliveryBoy);
router.get('/delivery/today', orderController.getTodayDeliveries);
router.patch('/delivery/:orderId/daily', orderController.updateDailyDelivery);

// School/admin routes: get orders by school identifier (supports assigned filter)
router.get('/by-school', orderController.getOrdersBySchool);

module.exports = router; 