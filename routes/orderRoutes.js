const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateUser, requireParent, requireDeliveryBoy, requireSchool } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateUser);

// School routes FIRST
router.get('/by-school', requireSchool, orderController.getOrdersBySchool);

// Parent routes
router.use('/parent', requireParent);
router.post('/parent/create', orderController.createOrder);
router.get('/parent/orders', orderController.getParentOrders);
router.get('/parent/orders/:orderId', orderController.getOrderById);

// Delivery Boy routes
router.use('/delivery', requireDeliveryBoy);
router.get('/delivery/today', orderController.getTodayDeliveries);
router.patch('/delivery/:orderId/daily', orderController.updateDailyDelivery);


// School/admin routes: get orders by school identifier (supports assigned filter)


module.exports = router; 