const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateUser, requireAdmin } = require('../middleware/auth');

// Admin authentication
router.post('/login', adminController.adminLogin);

// Public pricing
router.get('/pricing', adminController.getPricing);

// All other routes require admin authentication
router.use(authenticateUser);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getAllUsers);

// Delivery boy approval management
router.get('/delivery-boys/pending', adminController.getPendingDeliveryBoys);
router.get('/delivery-boys', adminController.getAllDeliveryBoysWithStatus);
router.patch('/delivery-boys/:deliveryBoyId/status', adminController.updateDeliveryBoyStatus);

// Order management
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:orderId', adminController.getOrderDetails);
router.patch('/orders/:orderId/status', adminController.updateOrderStatus);

// Delivery boy assignment
router.get('/orders/:orderId/available-delivery-boys', adminController.getAvailableDeliveryBoys);
router.post('/orders/:orderId/assign-delivery-boy', adminController.assignDeliveryBoy);

// Pricing management
router.patch('/pricing', adminController.updatePricing);
router.patch('/pricing/distance', adminController.updateDistancePricing);

// School registrations
router.get('/school-registrations', adminController.getSchoolRegistrations);
router.get('/school-registrations/:id', adminController.getSchoolRegistrationById);
router.patch('/school-registrations/:id/status', adminController.updateSchoolRegistrationStatus);

module.exports = router; 