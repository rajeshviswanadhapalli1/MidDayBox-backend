const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const { authenticateUser, requireParent, requireSchool } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary and Multer for school registration uploads
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const registrationStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'delivery-app/schools',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf']
  }
});

const registrationUpload = multer({
  storage: registrationStorage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Cloudinary and Multer for school profile picture uploads
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'delivery-app/school-profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif'],
    transformation: [
      { width: 400, height: 400, crop: 'fill' },
      { quality: 'auto' }
    ]
  }
});

const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Public: School registration (no auth)
router.post(
  '/register',
  registrationUpload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'schoolIdImage', maxCount: 1 }
  ]),
  schoolController.registerSchool
);

// All routes require authentication after registration endpoint
router.use(authenticateUser);
router.get('/registrations/approved', schoolController.getApprovedSchoolRegistrations);
router.get('/search', schoolController.searchSchools);
router.post('/distance', schoolController.getDistanceToSchool);
router.use(requireSchool);

// Public routes (for searching schools)


// Authenticated school registration profile (SchoolRegistration)
router.get('/me', requireSchool, schoolController.getMySchoolRegistration);
router.patch('/profile', profileUpload.single('profilePicture'), (err, req, res, next) => {
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
}, requireSchool, schoolController.updateSchoolRegistrationProfile);

// Delivery boys by school (requires auth; school can omit schoolUniqueId to use their own)
router.get('/delivery-boys/by-school', schoolController.getDeliveryBoysBySchool);

// Get school by ID (must be after specific routes like /me and /delivery-boys/by-school)
// router.get('/:schoolId', schoolController.getSchoolById);

// School actions on delivery boys and orders
router.post('/orders/:orderId/assign-delivery-boy', requireSchool, schoolController.assignDeliveryBoyToOrder);
router.patch('/delivery-boys/:deliveryBoyId/approval', requireSchool, schoolController.updateDeliveryBoyApprovalStatus);

// School management routes (accessible to all authenticated users)
router.post('/add', schoolController.addSchool);
router.get('/all', schoolController.getSchools);
router.put('/:schoolId', schoolController.updateSchool);
router.delete('/:schoolId', schoolController.deleteSchool);
router.get('/profile', requireSchool, schoolController.getSchoolRegistrationProfile);

// Parent-scoped school routes
router.get('/mine', requireParent, schoolController.getParentSchools);
router.put('/mine/:schoolId', requireParent, schoolController.updateParentSchool);
router.delete('/mine/:schoolId', requireParent, schoolController.deleteParentSchool);

module.exports = router; 