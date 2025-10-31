const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const SchoolRegistration = require('../models/SchoolRegistration');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ParentAddress = require('../models/ParentAddress');
const School = require('../models/School');
// const sendOTP = require('../middleware/otpService');
// const verifyOTP = require('../middleware/otpService');
const { sendOTP, verifyOTP } = require('../middleware/otpService');
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';



exports.verifyOtpController = async (req, res) => {
  const { phone, otp, purpose } = req.body;
  if (!phone || !otp) return res.status(400).json({ success: false, message: "Phone and OTP required" });

  const result = await verifyOTP(phone, otp, purpose || "register");
  return res.status(result.success ? 200 : 400).json(result);
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
  // Check mobile
  if (mobile) {
    const mobileExists =
      (await Parent.findOne({ mobile })) ||
      (await DeliveryBoy.findOne({ mobile })) ||
      (await SchoolRegistration.findOne({ mobile }));
    if (mobileExists) return 'Mobile number already registered';
  }

  // Check altMobile
  if (altMobile !== '') {
    const altMobileExists =
      (await Parent.findOne({ altMobile })) ||
      (await DeliveryBoy.findOne({ altMobile })) ||
      (await SchoolRegistration.findOne({ altMobile }));
    if (altMobileExists) return 'Alternative mobile number already registered';
  }

  // Check email
  if (email) {
    const emailExists =
      (await Parent.findOne({ email })) ||
      (await DeliveryBoy.findOne({ email })) ||
      (await SchoolRegistration.findOne({ email }));
    if (emailExists) return 'Email already registered';
  }

  return null; // No duplicates
};
exports.sendOtpController = async (req, res) => {
  const { mobile,altMobile, purpose,email } = req.body;
  if (!mobile) return res.status(400).json({ success: false, message: "Phone is required" });
const duplicateMessage = await checkDuplicateAcrossAllUsers({ mobile, altMobile, email });
if (duplicateMessage) {
  return res.status(409).json({
    success: false,
    message: duplicateMessage
  });
}else{
  if(purpose==="forgot_password"){
    const result = await sendOTP(mobile, purpose || "forgot_password");
  }else{
    const result = await sendOTP(mobile, purpose || "register");
    return res.status(result.success ? 200 : 500).json(result);
  }
}
  // const result = await sendOTP(mobile, purpose || "register");
  // return res.status(result.success ? 200 : 500).json(result);
};
// Register Parent
exports.registerParent = async (req, res) => {
  try {
    const { name, email, mobile, altMobile, password } = req.body;

    const requiredFields = { name, email, mobile, password };
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

const duplicateMessage = await checkDuplicateAcrossAllUsers({ mobile, altMobile, email });
if (duplicateMessage) {
  return res.status(409).json({
    success: false,
    message: duplicateMessage
  });
}
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create parent object
    const parentData = {
      name,
      email,
      mobile,
      // altMobile,
      password: hashedPassword
    };

    // Add altMobile only if provided
    if (altMobile) {
      parentData.altMobile = altMobile;
    }

    //  const result = await verifyOTP(mobile,otp, purpose || "register");
    //  if(result.success){
    //   // Save to database
    const parent = new Parent(parentData);
    await parent.save();

    const token = jwt.sign(
      { id: parent._id, role: 'parent' }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

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
      token,
      user: userResponse
    });
  // }else{
  //   return res.status(400).json({success:false,message:"OTP verification failed"});
  // }
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

    // Validate required fields (altMobile is optional)
    const requiredFields = {
      name, email, mobile, password, 
      vehicleType, vehicleNo, drivingLicenceNumber, adharNumber,schoolUniqueId
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: 'Missing required fields', 
        missingFields 
      });
    }

    // Validate vehicle type
    if (!['2 wheeler', '3 wheeler'].includes(vehicleType)) {
      return res.status(400).json({ 
        message: 'Vehicle type must be either "2 wheeler" or "3 wheeler"' 
      });
    }

    // Process uploaded files
    const uploadedFiles = req.files || [];
    const fileMap = {};
    
    uploadedFiles.forEach(file => {
      fileMap[file.fieldname] = file;
    });

    // Define expected file fields and their variations (including frontend field names)
    const fileFields = {
      adharFront: ['adharFront', 'adhar_front', 'aadharFront', 'aadhar_front', 'adharFrontUrl'],
      adharBack: ['adharBack', 'adhar_back', 'aadharBack', 'aadhar_back', 'adharBackUrl'],
      drivingLicenceFront: ['drivingLicenceFront', 'driving_licence_front', 'drivingLicenseFront', 'licenseFront', 'drivingLicenceFrontUrl'],
      drivingLicenceBack: ['drivingLicenceBack', 'driving_licence_back', 'drivingLicenseBack', 'licenseBack', 'drivingLicenceBackUrl']
    };

    // Map files to expected field names
    const fileUrls = {};
    const missingFiles = [];

    for (const [expectedField, variations] of Object.entries(fileFields)) {
      const foundFile = variations.find(variation => fileMap[variation]);
      
      if (foundFile) {
        fileUrls[expectedField] = fileMap[foundFile].path;
      } else {
        missingFiles.push(expectedField);
      }
    }

    if (missingFiles.length > 0) {
      return res.status(400).json({
        message: 'Missing required document images',
        missingFiles,
        receivedFiles: Object.keys(fileMap)
      });
    }
const duplicateMessage = await checkDuplicateAcrossAllUsers({ mobile, altMobile:'', email });
if (duplicateMessage) {
  return res.status(409).json({
    success: false,
    message: duplicateMessage
  });
}
    // Check for existing records (skip altMobile if not provided)
    const existingChecks = [
      // { field: 'mobile', value: mobile, message: 'Mobile number already registered' },
      // { field: 'email', value: email, message: 'Email already registered' },
      { field: 'drivingLicenceNumber', value: drivingLicenceNumber, message: 'Driving licence number already registered' },
      { field: 'adharNumber', value: adharNumber, message: 'Adhar number already registered' }
    ];

    // Add altMobile check only if it's provided
    if (altMobile) {
      existingChecks.push({ field: 'altMobile', value: altMobile, message: 'Alternative mobile number already registered' });
    }

    for (const check of existingChecks) {
      const existing = await DeliveryBoy.findOne({ [check.field]: check.value });
     
      if (existing) {
        
        return res.status(409).json({ message: check.message });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create delivery boy object
    const deliveryBoyData = {
      name,
      email,
      mobile,
      altMobile,
      password: hashedPassword,
      vehicleType,
      vehicleNo,
      drivingLicenceNumber,
      adharNumber,
      schoolUniqueId,
      adharFrontUrl: fileUrls.adharFront,
      adharBackUrl: fileUrls.adharBack,
      drivingLicenceFrontUrl: fileUrls.drivingLicenceFront,
      drivingLicenceBackUrl: fileUrls.drivingLicenceBack
    };

    // Add altMobile only if provided
    if (altMobile) {
      deliveryBoyData.altMobile = altMobile;
    }

    // If schoolUniqueId provided, resolve and link to school registration
    if (schoolUniqueId) {
      const reg = await SchoolRegistration.findOne({ schoolUniqueId });
      if (!reg) {
        return res.status(400).json({ success: false, message: 'Invalid schoolUniqueId' });
      }
      deliveryBoyData.schoolUniqueId = schoolUniqueId;
      deliveryBoyData.schoolRegistrationId = reg._id;
    }

    // Save to database
    const deliveryBoy = new DeliveryBoy(deliveryBoyData);
    await deliveryBoy.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: deliveryBoy._id, role: 'deliveryboy' }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    // Prepare response
    const userResponse = {
      id: deliveryBoy._id,
      name,
      email,
      mobile,
      altMobile: altMobile || null,
      vehicleType,
      vehicleNo,
      drivingLicenceNumber,
      adharNumber,
      adharFrontUrl: fileUrls.adharFront,
      adharBackUrl: fileUrls.adharBack,
      drivingLicenceFrontUrl: fileUrls.drivingLicenceFront,
      drivingLicenceBackUrl: fileUrls.drivingLicenceBack,
      schoolUniqueId: deliveryBoy.schoolUniqueId || null,
      schoolRegistrationId: deliveryBoy.schoolRegistrationId || null
    };

    // Add altMobile to response if provided
    if (altMobile) {
      userResponse.altMobile = altMobile;
    }

    res.status(201).json({
      success: true,
      message: 'Delivery boy registered successfully',
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Delivery boy registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register delivery boy. Please check your input and try again.',
      error: error.message
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

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

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
      token,
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

    // Validate unique fields if they are changing
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

    // Handle profile picture if uploaded via multer-cloudinary
    if (req.file) {
      parent.profilePicture = req.file.path; // Cloudinary gives the URL in path
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
        profilePicture: parent.profilePicture || null
      }
    });
  } catch (error) {
    console.error('Update parent profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating profile', error: error.message });
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