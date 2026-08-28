const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const paymentController = require('../controllers/paymentController');
const { authenticateUser, requireParent, requireSchool } = require('../middleware/auth');
const multer = require('multer');
const { createUpload } = require('../middleware/uploadS3');

// ✅ AWS Uploaders
const registrationUpload = createUpload('delivery-app/schools');
const profileUpload = createUpload('delivery-app/school-profiles');
const bankDocumentUpload = createUpload('delivery-app/bank-documents');

// ---------------- PUBLIC ROUTES ----------------

// ✅ School registration (upload Aadhar + school ID images)
router.post(
  '/register',
  registrationUpload.fields([
    { name: 'aadharFront', maxCount: 1 },
    { name: 'aadharBack', maxCount: 1 },
    { name: 'schoolIdImage', maxCount: 1 }
  ]),
  schoolController.registerSchool
);
router.post("/sendOtp", schoolController.schoolSendOtpController);
// ---------------- AUTHENTICATED ROUTES ----------------
router.use(authenticateUser);

router.get('/registrations/approved', schoolController.getApprovedSchoolRegistrations);
router.get('/search', schoolController.searchSchools);
router.post('/distance', schoolController.getDistanceToSchool);

// ---------------- SCHOOL ROUTES ----------------
router.use(requireSchool);

// ✅ Update school profile picture via AWS
router.patch(
  '/profile',
  profileUpload.single('profilePicture'),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum 5MB.'
        });
      }
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  },
  schoolController.updateSchoolRegistrationProfile
);

// ✅ CRUD operations
router.post('/add', schoolController.addSchool);
router.get('/all', schoolController.getSchools);
router.put('/:schoolId', schoolController.updateSchool);
router.delete('/:schoolId', schoolController.deleteSchool);

router.get('/profile', requireSchool, schoolController.getSchoolRegistrationProfile);
router.get('/delivery-boys/by-school', schoolController.getDeliveryBoysBySchool);
router.post('/orders/:orderId/assign-delivery-boy', requireSchool, schoolController.assignDeliveryBoyToOrder);
router.patch('/delivery-boys/:deliveryBoyId/approval', requireSchool, schoolController.updateDeliveryBoyApprovalStatus);

// ✅ Transaction history for schools
router.get('/transactions', requireSchool, paymentController.getSchoolTransactionHistory);

// ✅ Update payment details for schools
router.patch(
  '/payment-details/:schoolId',
  requireSchool,
  bankDocumentUpload.single('documentImage'),
  (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum 5MB.'
        });
      }
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  },
  schoolController.updateSchoolPaymentDetails
);

router.get('/mine', requireParent, schoolController.getParentSchools);
router.put('/mine/:schoolId', requireParent, schoolController.updateParentSchool);
router.delete('/mine/:schoolId', requireParent, schoolController.deleteParentSchool);

module.exports = router;
