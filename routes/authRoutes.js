const express = require("express");
const router = express.Router();
const { createUpload } = require("../middleware/uploadS3");
const { authenticateUser, requireParent } = require("../middleware/auth");
const authController = require("../controllers/authController");
const tokenController = require("../controllers/tokenController");

// File Uploaders
const uploadDeliveryBoy = createUpload("deliveryboy");
const uploadParentProfile = createUpload("parent-profile");

// ✅ Parent Registration and Login
router.post("/register/parent", authController.registerParent);
router.post("/sendOtp", authController.sendOtpController);
router.post("/verify-mobile", authController.verifyMobileForForgotPassword);
router.post("/forgot-password", authController.forgotPassword);
router.post("/login", authController.loginUser);
router.post("/refresh", tokenController.refreshAccessToken);
router.post("/logout", tokenController.logout);
router.post("/logout-all", authenticateUser, tokenController.logoutAll);
router.post("/changePassword", authenticateUser, authController.changePassword);
router.get("/check-user/:mobile", authController.checkUser);

// ✅ Delivery Boy Registration (Multiple Images)
router.post(
  "/register/deliveryboy",
  uploadDeliveryBoy.fields([
    { name: "adharFrontUrl", maxCount: 1 },
    { name: "adharBackUrl", maxCount: 1 },
    { name: "drivingLicenceFrontUrl", maxCount: 1 },
    { name: "drivingLicenceBackUrl", maxCount: 1 },
  ]),
  authController.registerDeliveryBoy
);

// ✅ Parent Profile Update (Single Image)
router.patch(
  "/parent/profile",
  authenticateUser,
  requireParent,
  uploadParentProfile.single("profilePicture"),
  authController.updateParentProfile
);

router.get(
  "/parent/profile",
  authenticateUser,
  requireParent,
  authController.getParentProfile
);
router.get(
  "/parent/addresses-schools",
  authenticateUser,
  requireParent,
  authController.getParentAddressesAndSchools
);

module.exports = router;
