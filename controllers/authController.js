const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const SchoolRegistration = require('../models/SchoolRegistration');
const bcrypt = require('bcryptjs');
const { issueTokenPair } = require('../utils/tokenService');
const ParentAddress = require('../models/ParentAddress');
const School = require('../models/School');
// const sendOTP = require('../middleware/otpService');
// const verifyOTP = require('../middleware/otpService');
const { sendOTP, verifyOTP } = require('../middleware/otpService');
const fs = require('fs');
const { s3 } = require('../config/aws-s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');



exports.verifyOtpController = async (req, res) => {
  const { phone, mobile, otp, purpose } = req.body;
  const targetMobile = mobile || phone;
  if (!targetMobile || !otp) return res.status(400).json({ success: false, message: "Mobile and OTP required" });

  const result = await verifyOTP(targetMobile, otp, purpose || "register");
  return res.status(result.success ? 200 : 400).json(result);
};

exports.verifyMobileForForgotPassword = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ success: false, message: 'Mobile is required' });
    }

    const userData = await findUserByMobile(mobile);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'User not found for provided mobile' });
    }

    return res.json({
      success: true,
      message: 'Mobile verified successfully',
      role: userData.role
    });
  } catch (error) {
    console.error('Verify mobile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying mobile',
      error: error.message
    });
  }
};
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword} = req.body;
    const userId = req.user.id;
    const role = req.user.role; // 'parent', 'deliveryboy', 'school'

    // Validate required fields
    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Old password, new password are required'
      });
    }


    // Fetch user based on role
    let UserModel;
    if (role === 'parent') UserModel = Parent;
    else if (role === 'deliveryboy') UserModel = DeliveryBoy;
    else if (role === 'school') UserModel = SchoolRegistration;
    else return res.status(400).json({ success: false, message: 'Invalid user role' });

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while changing password',
      error: error.message
    });
  }
};
const checkDuplicateAcrossAllUsers = async ({ mobile, altMobile, email }) => {
  if (mobile) {
    const mobileExists =
      (await Parent.findOne({ mobile })) ||
      (await DeliveryBoy.findOne({ mobile })) ||
      (await SchoolRegistration.findOne({ mobile }));
    console.log(mobileExists,'mobileExists');
    if (mobileExists) return 'Mobile number already registered';
  }

  if (altMobile !== '') {
    const altMobileExists =
      (await Parent.findOne({ altMobile })) ||
      (await DeliveryBoy.findOne({ altMobile })) ||
      (await SchoolRegistration.findOne({ altMobile }));
    if (altMobileExists) return 'Alternative mobile number already registered';
  }

  if (email) {
    const emailExists =
      (await Parent.findOne({ email })) ||
      (await DeliveryBoy.findOne({ email })) ||
      (await SchoolRegistration.findOne({ email }));
    if (emailExists) return 'Email already registered';
  }

  return null;
};

const findUserByMobile = async (mobile) => {
  let user = await Parent.findOne({ mobile });
  if (user) return { user, role: 'parent' };
  user = await DeliveryBoy.findOne({ mobile });
  if (user) return { user, role: 'deliveryboy' };
  user = await SchoolRegistration.findOne({ mobile });
  if (user) return { user, role: 'school' };
  return null;
};

exports.sendOtpController = async (req, res) => {
  const { mobile, altMobile, purpose, email } = req.body;
  console.log(mobile,altMobile, purpose,email );

  if (!mobile) return res.status(400).json({ success: false, message: "Mobile is required" });

  const otpPurpose = purpose === 'forgot_password' ? 'forgot_password' : 'register';

  if (otpPurpose === 'register') {
    const duplicateMessage = await checkDuplicateAcrossAllUsers({ mobile, altMobile, email });
    if (duplicateMessage) {
      return res.status(409).json({
        success: false,
        message: duplicateMessage
      });
    }
  } else {
    const existingUser = await findUserByMobile(mobile);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: 'User not found for provided mobile' });
    }
  }

  const result = await sendOTP(mobile, otpPurpose);
  return res.status(result.success ? 200 : 500).json(result);
};

exports.forgotPassword = async (req, res) => {
  try {
    const { mobile, newPassword } = req.body;

    if (!mobile || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mobile,  and new password are required' });
    }

    const userData = await findUserByMobile(mobile);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // const otpResult = await verifyOTP(mobile, otp, 'forgot_password');
    // if (!otpResult.success) {
    //   return res.status(400).json({ success: false, message: otpResult.message });
    // }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    userData.user.password = hashedPassword;
    await userData.user.save();

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Server error while resetting password', error: error.message });
  }
};
// Register Parent
exports.registerParent = async (req, res) => {
  try {
    const { name, email, mobile, altMobile, password, otp } = req.body;

    const requiredFields = { name, email, mobile, password, otp };
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields', 
        missingFields 
      });
    }

    // Validate mobile number format
    if (mobile.length !== 10 || !/^\d+$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be exactly 10 digits'
      });
    }

    // Validate altMobile if provided
    if (altMobile && (altMobile.length !== 10 || !/^\d+$/.test(altMobile))) {
      return res.status(400).json({
        success: false,
        message: 'Alternative mobile number must be exactly 10 digits'
      });
    }

    // Verify OTP before proceeding
    const otpResult = await verifyOTP(mobile, otp, "register");
    if (!otpResult.success) {
      return res.status(400).json({
        success: false,
        message: otpResult.message
      });
    }

    // const duplicateMessage = await checkDuplicateAcrossAllUsers({ mobile, altMobile, email });
    // if (duplicateMessage) {
    //   return res.status(409).json({
    //     success: false,
    //     message: duplicateMessage
    //   });
    // }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create parent object
    const parentData = {
      name,
      email,
      mobile,
      password: hashedPassword
    };

    // Add altMobile only if provided
    if (altMobile) {
      parentData.altMobile = altMobile;
    }

    // Save to database only after OTP verification
    const parent = new Parent(parentData);
    await parent.save();

    const tokens = await issueTokenPair({
      userId: parent._id,
      role: 'parent',
      req
    });

    // Prepare response
    const userResponse = {
      id: parent._id,
      name,
      email,
      mobile
    };

    // Add altMobile to response if provided
    if (altMobile) {
      userResponse.altMobile = altMobile;
    }

    res.status(201).json({
      success: true,
      message: 'Parent registered successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: userResponse
    });
  } catch (error) {
    console.error('Parent registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register parent. Please check your input and try again.',
      error: error.message
    });
  }
};

// Register DeliveryBoy
exports.registerDeliveryBoy = async (req, res) => {
  try {
    // Extract form data
    const { 
      name, 
      email, 
      mobile, 
      altMobile, 
      password, 
      vehicleType, 
      vehicleNo, 
      drivingLicenceNumber, 
      adharNumber,
      schoolUniqueId
    } = req.body;

    // Required fields
    const requiredFields = {
      name, mobile, password,
      vehicleType, vehicleNo, drivingLicenceNumber, adharNumber, schoolUniqueId
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([k, v]) => !v)
      .map(([k]) => k);

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields",
        missingFields
      });
    }

    // Validate vehicle type
    if (!["2 wheeler", "3 wheeler"].includes(vehicleType)) {
      return res.status(400).json({
        message: 'Vehicle type must be either "2 wheeler" or "3 wheeler"'
      });
    }

    console.log("Received file fields:", Object.keys(req.files || {}));

    // ------------------------------------------------------
    // ✅ Correct way to access multer fields
    // ------------------------------------------------------
    const adharFront = req.files?.adharFrontUrl?.[0] || null;
    const adharBack = req.files?.adharBackUrl?.[0] || null;
    const dlFront = req.files?.drivingLicenceFrontUrl?.[0] || null;
    const dlBack = req.files?.drivingLicenceBackUrl?.[0] || null;

    const missingFiles = [];
    if (!adharFront) missingFiles.push("adharFrontUrl");
    if (!adharBack) missingFiles.push("adharBackUrl");
    if (!dlFront) missingFiles.push("drivingLicenceFrontUrl");
    if (!dlBack) missingFiles.push("drivingLicenceBackUrl");

    if (missingFiles.length > 0) {
      return res.status(400).json({
        message: "Missing required document images",
        missingFiles,
        receivedFiles: Object.keys(req.files || {})
      });
    }

    // Determine final file URLs (S3 = location, local = path)
    const fileUrls = {
      adharFrontUrl: adharFront.location || adharFront.path,
      adharBackUrl: adharBack.location || adharBack.path,
      drivingLicenceFrontUrl: dlFront.location || dlFront.path,
      drivingLicenceBackUrl: dlBack.location || dlBack.path,
    };

    // ------------------------------------------------------
    // Duplicate checking across all users
    // ------------------------------------------------------
    const duplicateMessage = await checkDuplicateAcrossAllUsers({
      mobile, altMobile: '', email
    });

    if (duplicateMessage) {
      return res.status(409).json({
        success: false,
        message: duplicateMessage
      });
    }

    // Checks for existing values
    const existingChecks = [
      { field: "drivingLicenceNumber", value: drivingLicenceNumber, message: "Driving licence number already registered" },
      { field: "adharNumber", value: adharNumber, message: "Aadhar number already registered" }
    ];

    if (altMobile) {
      existingChecks.push({
        field: "altMobile",
        value: altMobile,
        message: "Alternative mobile number already registered"
      });
    }

    for (const check of existingChecks) {
      const existing = await DeliveryBoy.findOne({ [check.field]: check.value });
      if (existing) {
        return res.status(409).json({ message: check.message });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // SCHOOL CONNECTION
    let schoolRegistrationId = null;

    const school = await SchoolRegistration.findOne({ schoolUniqueId });
    if (!school) {
      return res.status(400).json({ success: false, message: "Invalid schoolUniqueId" });
    }
    schoolRegistrationId = school._id;

    // ------------------------------------------------------
    // Create DeliveryBoy object
    // ------------------------------------------------------
    const deliveryBoyData = {
      name,
      email,
      mobile,
      vehicleType,
      vehicleNo,
      drivingLicenceNumber,
      adharNumber,
      password: hashedPassword,
      schoolUniqueId,
      schoolRegistrationId,
      ...fileUrls,
    };

    if (altMobile) deliveryBoyData.altMobile = altMobile;

    // Save to DB
    const deliveryBoy = new DeliveryBoy(deliveryBoyData);
    await deliveryBoy.save();

    const tokens = await issueTokenPair({
      userId: deliveryBoy._id,
      role: 'deliveryboy',
      req
    });

    res.status(201).json({
      success: true,
      message: "Delivery boy registered successfully",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: {
        id: deliveryBoy._id,
        ...deliveryBoyData,
      }
    });

  } catch (error) {
    console.error("Delivery boy registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register delivery boy",
      error: error.message,
    });
  }
};

// Check if user exists (for debugging)
exports.checkUser = async (req, res) => {
  try {
    const { mobile } = req.params;
   
    const parent = await Parent.findOne({ mobile });
    const deliveryBoy = await DeliveryBoy.findOne({ mobile });
    const school = await SchoolRegistration.findOne({ mobile });
    
    res.json({
      success: true,
      parent: parent ? { id: parent._id, name: parent.name, email: parent.email } : null,
      deliveryBoy: deliveryBoy ? { id: deliveryBoy._id, name: deliveryBoy.name, email: deliveryBoy.email } : null,
      school: school ? { id: school._id, contactName: school.contactName, schoolName: school.schoolName, email: school.email, status: school.status } : null
    });
    
  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
};

// Single login for Parent, DeliveryBoy and School (approved)
exports.loginUser = async (req, res) => {
  try {
    const { mobile, password } = req.body;
console.log(mobile, password);
    if (!mobile || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Mobile and password are required' 
      });
    }

    let user = await Parent.findOne({ mobile });
    let role = 'parent';
    
    if (!user) {

      user = await DeliveryBoy.findOne({ mobile });
      role = 'deliveryboy';
    }

    if (!user) {
     
      user = await SchoolRegistration.findOne({ mobile });
      role = 'school';
    }

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials - User not found' 
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials - Wrong password' 
      });
    }

    const tokens = await issueTokenPair({
      userId: user._id,
      role,
      req
    });

    // Prepare user info
    const userInfo = {
      id: user._id,
      name: user.name || user.contactName || user.schoolName,
      email: user.email,
      mobile: user.mobile,
      role
    };

    // Add altMobile if available (for both parent and delivery boy)
    if (user.altMobile) {
      userInfo.altMobile = user.altMobile;
    }

    // Add delivery boy specific fields
    if (role === 'deliveryboy') {
      Object.assign(userInfo, {
        vehicleType: user.vehicleType,
        vehicleNo: user.vehicleNo,
        drivingLicenceNumber: user.drivingLicenceNumber,
        adharNumber: user.adharNumber,
        adharFrontUrl: user.adharFrontUrl,
        adharBackUrl: user.adharBackUrl,
        drivingLicenceFrontUrl: user.drivingLicenceFrontUrl,
        drivingLicenceBackUrl: user.drivingLicenceBackUrl,
        status: user.status
      });

      // Include the school details who added/approved this delivery boy (if available)
      const addedBySchoolId = user.schoolRegistrationId || user.approvedBy || null;
      if (addedBySchoolId) {
        const addedBySchool = await SchoolRegistration.findById(addedBySchoolId).select(
          'schoolName schoolUniqueId contactName mobile email recogniseId branchNumber status'
        );
        if (addedBySchool) {
          userInfo.addedBySchool = {
            id: addedBySchool._id,
            schoolName: addedBySchool.schoolName,
            schoolUniqueId: addedBySchool.schoolUniqueId,
            contactName: addedBySchool.contactName,
            mobile: addedBySchool.mobile,
            email: addedBySchool.email,
            recogniseId: addedBySchool.recogniseId,
            branchNumber: addedBySchool.branchNumber,
            status: addedBySchool.status
          };
        }
      }
    }

    // Add school specific fields
    if (role === 'school') {
      Object.assign(userInfo, {
        schoolName: user.schoolName,
        recogniseId: user.recogniseId,
        branchNumber: user.branchNumber,
        address: user.address,
        schoolIdImageUrl: user.schoolIdImageUrl,
        schoolUniqueId: user.schoolUniqueId,
        status: user.status
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: userInfo
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login',
      error: error.message 
    });
  }
}; 

// Get parent addresses and schools
exports.getParentAddressesAndSchools = async (req, res) => {
  try {
    const parentId = req.user.id;

    // Get parent addresses
    const parentAddresses = await ParentAddress.find({ parentId })
      .sort({ isDefault: -1, createdAt: -1 }); // Default address first, then by creation date

    // Get all active schools
    const schools = await School.find({ isActive: true })
      .sort({ schoolName: 1 }); // Sort by school name alphabetically

    res.json({
      success: true,
      data: {
        parentAddresses: parentAddresses.map(address => ({
          id: address._id,
          parentName: address.parentName,
          studentName: address.studentName,
          houseNo: address.houseNo,
          apartmentName: address.apartmentName,
          areaName: address.areaName,
          landMark: address.landMark,
          cityName: address.cityName,
          pincode: address.pincode,
          isDefault: address.isDefault,
          createdAt: address.createdAt,
          updatedAt: address.updatedAt
        })),
        schools: schools.map(school => ({
          id: school._id,
          schoolName: school.schoolName,
          recognisedNumber: school.recognisedNumber,
          branchNumber: school.branchNumber,
          address: {
            houseNo: school.houseNo,
            apartmentName: school.apartmentName,
            areaName: school.areaName,
            landMark: school.landMark,
            cityName: school.cityName,
            pincode: school.pincode
          },
          contactNumber: school.contactNumber,
          email: school.email,
          isActive: school.isActive,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Get parent addresses and schools error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching addresses and schools',
      error: error.message
    });
  }
};

// Update Parent profile (with optional image)
exports.updateParentProfile = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { name, email, mobile, altMobile } = req.body;

    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent not found' });
    }

    if (email && email !== parent.email) {
      const exists = await Parent.findOne({ email, _id: { $ne: parentId } });
      if (exists) return res.status(409).json({ success: false, message: 'Email already in use' });
      parent.email = email;
    }

    if (mobile && mobile !== parent.mobile) {
      const exists = await Parent.findOne({ mobile, _id: { $ne: parentId } });
      if (exists) return res.status(409).json({ success: false, message: 'Mobile already in use' });
      parent.mobile = mobile;
    }

    if (altMobile && altMobile !== parent.altMobile) {
      const exists = await Parent.findOne({ altMobile, _id: { $ne: parentId } });
      if (exists) return res.status(409).json({ success: false, message: 'Alternative mobile already in use' });
      parent.altMobile = altMobile;
    }

    if (name) parent.name = name;

    // ✅ multer-s3 provides `req.file.location`
    if (req.file && req.file.location) {
      parent.profilePicture = req.file.location;
    }

    await parent.save();

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      parent: {
        id: parent._id,
        name: parent.name,
        email: parent.email,
        mobile: parent.mobile,
        altMobile: parent.altMobile || null,
        profilePicture: parent.profilePicture || null,
      },
    });
  } catch (error) {
    console.error('Update parent profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: error.message,
    });
  }
};

// Get Parent profile
exports.getParentProfile = async (req, res) => {
  try {
    const parentId = req.user.id;
    const parent = await Parent.findById(parentId).select('-password');
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Parent not found' });
    }

    return res.json({
      success: true,
      parent: {
        id: parent._id,
        name: parent.name,
        email: parent.email,
        mobile: parent.mobile,
        altMobile: parent.altMobile || null,
        profilePicture: parent.profilePicture || null
      }
    });
  } catch (error) {
    console.error('Get parent profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching profile', error: error.message });
  }
};