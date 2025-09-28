const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { authenticateUser, requireParent } = require('../middleware/auth');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ddgvpgr1v',
  api_key: process.env.CLOUDINARY_API_KEY || '784931183392173',
  api_secret: process.env.CLOUDINARY_API_SECRET || '2HUuKWEOhJNBYcvB7FUeQqPIpk0',
});

// Multer storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'delivery-app',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
  },
});

// Multer upload configuration
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      success: false,
      message: 'File upload error', 
      error: err.message
    });
  }
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next(err);
};

// Routes
router.post('/register/parent', authController.registerParent);

router.post('/register/deliveryboy', 
  upload.any(),
  handleMulterError,
  authController.registerDeliveryBoy
);

router.post('/login', authController.loginUser);

// Debug route to check if user exists
router.get('/check-user/:mobile', authController.checkUser);
router.post('/changePassword', authenticateUser, authController.changePassword)
// Get parent addresses and schools (requires parent authentication)
router.get('/parent/addresses-schools', 
  authenticateUser, 
  requireParent, 
  authController.getParentAddressesAndSchools
);

// Update parent profile (multipart/form-data with optional image field "profilePicture")
router.patch('/parent/profile', 
  authenticateUser,
  requireParent,
  upload.single('profilePicture'),
  handleMulterError,
  authController.updateParentProfile
);

// Get parent profile
router.get('/parent/profile', 
  authenticateUser,
  requireParent,
  authController.getParentProfile
);

module.exports = router;  