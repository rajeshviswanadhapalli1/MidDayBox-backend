const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const paymentController = require('../controllers/paymentController');
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

// Payment routes for parent
router.post('/parent/payment/verify', paymentController.verifyPayment);
router.get('/parent/transactions', paymentController.getTransactionHistory);
router.get('/parent/transactions/:transactionId', paymentController.getTransactionDetails);
router.post('/parent/transactions/:transactionId/refund', paymentController.refundPayment);

// Delivery Boy routes
router.use('/delivery', requireDeliveryBoy);
router.get('/delivery/today', orderController.getTodayDeliveries);
router.patch('/delivery/:orderId/daily', orderController.updateDailyDelivery);


// School/admin routes: get orders by school identifier (supports assigned filter)


module.exports = router; 