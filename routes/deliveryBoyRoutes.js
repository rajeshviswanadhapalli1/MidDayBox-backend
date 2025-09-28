const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const deliveryBoyController = require('../controllers/deliveryBoyController');
const { authenticateUser, requireDeliveryBoy } = require('../middleware/auth');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer with Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'delivery-app/profile-pictures',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { width: 400, height: 400, crop: 'fill' },
      { quality: 'auto' }
    ]
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// All routes require authentication and delivery boy role
router.use(authenticateUser);
router.use(requireDeliveryBoy);

// Status management
router.patch('/status', deliveryBoyController.updateDeliveryBoyStatus);

// Profile management
router.get('/profile', deliveryBoyController.getDeliveryBoyProfile);
router.patch('/profile', upload.single('profilePicture'), (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
}, deliveryBoyController.updateDeliveryBoyProfile);

// Dashboard and earnings
router.get('/dashboard', deliveryBoyController.getDeliveryBoyDashboard);
router.get('/earnings', deliveryBoyController.getDeliveryBoyEarnings);

// Orders management
router.get('/orders', deliveryBoyController.getDeliveryBoyOrders);
router.get('/deliveries/current', deliveryBoyController.getCurrentDateDeliveries);
router.patch('/orders/:orderId/status', deliveryBoyController.updateOrderStatus);

// Monthly delivery statistics
router.get('/deliveries/monthly', deliveryBoyController.getLastSixMonthsDeliveries);
router.get('/deliveries/monthly/:year/:month', deliveryBoyController.getMonthlyDailyDeliveries);

module.exports = router; 