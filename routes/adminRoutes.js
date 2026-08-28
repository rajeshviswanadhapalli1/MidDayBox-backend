const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const paymentController = require('../controllers/paymentController');
const demoVideoController = require('../controllers/demoVideoController');
const festivalWishController = require('../controllers/festivalWishController');
const { demoUpload } = require('../middleware/uploadDemoS3');
const { festivalUpload } = require('../middleware/uploadFestivalS3');
const { authenticateUser, requireAdminOrSubAdmin, requirePermission } = require('../middleware/auth');

// Admin authentication
router.post('/login', adminController.adminLogin);

const tokenController = require('../controllers/tokenController');
router.post('/refresh', tokenController.refreshAccessToken);
router.post('/logout', tokenController.logout);

// Public pricing
router.get('/pricing', adminController.getPricing);

// All other routes require admin authentication
router.use(authenticateUser);
router.use(requireAdminOrSubAdmin);

router.post('/logout-all', tokenController.logoutAll);

// Sub admin management (admin only)
router.post('/sub-admins', requirePermission('sub_admins'), adminController.createSubAdmin);
router.get('/sub-admins', requirePermission('sub_admins'), adminController.getSubAdmins);
router.patch('/sub-admins/:id', requirePermission('sub_admins'), adminController.updateSubAdmin);
router.delete('/sub-admins/:id', requirePermission('sub_admins'), adminController.deleteSubAdmin);

// Dashboard
router.get('/dashboard', requirePermission('dashboard'), adminController.getDashboardStats);

// User management
router.get('/users', requirePermission('users'), adminController.getAllUsers);

// Delivery boy approval management
router.get('/delivery-boys/pending', requirePermission('users'), adminController.getPendingDeliveryBoys);
router.get('/delivery-boys', requirePermission('users'), adminController.getAllDeliveryBoysWithStatus);
router.patch('/delivery-boys/:deliveryBoyId/status', requirePermission('users'), adminController.updateDeliveryBoyStatus);

// Order management
router.get('/orders', requirePermission('orders'), adminController.getAllOrders);
router.get('/orders/:orderId', requirePermission('orders'), adminController.getOrderDetails);
router.patch('/orders/:orderId/status', requirePermission('orders'), adminController.updateOrderStatus);

// Delivery boy assignment
router.get('/orders/:orderId/available-delivery-boys', requirePermission('orders'), adminController.getAvailableDeliveryBoys);
router.post('/orders/:orderId/assign-delivery-boy', requirePermission('orders'), adminController.assignDeliveryBoy);

// Pricing management
router.patch('/pricing', requirePermission('prices'), adminController.updatePricing);
router.patch('/pricing/distance', requirePermission('prices'), adminController.updateDistancePricing);

// School registrations
router.get('/school-registrations', requirePermission('schools'), adminController.getSchoolRegistrations);
router.get('/school-registrations/:id', requirePermission('schools'), adminController.getSchoolRegistrationById);
router.patch('/school-registrations/:id/status', requirePermission('schools'), adminController.updateSchoolRegistrationStatus);

// Payment management
router.get('/transactions', requirePermission('transactions'), paymentController.getAllTransactionsForAdmin);
router.get('/transactions/parent', requirePermission('transactions'), paymentController.getAdminParentTransactions);
router.get('/transactions/school', requirePermission('transactions'), paymentController.getAdminSchoolTransactions);
router.post('/upi-transfer', requirePermission('transactions'), paymentController.createUpiTransfer);

// School 2% payments (admin records after manual UPI/bank transfer)
router.get('/pending-school-payments', requirePermission('transactions'), paymentController.getPendingSchoolPayments);
router.post('/record-school-payment', requirePermission('transactions'), paymentController.recordSchoolPayment);

// Demo videos (admin upload — stored in S3 + MongoDB)
router.post(
  '/demo-videos',
  demoUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  demoVideoController.createDemoVideo
);
router.get('/demo-videos', demoVideoController.getAdminDemoVideos);
router.get('/demo-videos/:id', demoVideoController.getAdminDemoVideoById);
router.patch(
  '/demo-videos/:id',
  demoUpload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  demoVideoController.updateDemoVideo
);
router.delete('/demo-videos/:id', demoVideoController.deleteDemoVideo);

// Festival / scheduled wishes (image or video popup on app open)
router.post(
  '/festival-wishes',
  festivalUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  festivalWishController.createFestivalWish
);
router.get('/festival-wishes', festivalWishController.getAdminFestivalWishes);
router.get('/festival-wishes/:id', festivalWishController.getAdminFestivalWishById);
router.patch(
  '/festival-wishes/:id',
  festivalUpload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]),
  festivalWishController.updateFestivalWish
);
router.delete('/festival-wishes/:id', festivalWishController.deleteFestivalWish);

module.exports = router; 