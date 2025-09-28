const School = require('../models/School');
const mongoose = require('mongoose');
const ParentAddress = require('../models/ParentAddress');
const axios = require('axios');
const SchoolRegistration = require('../models/SchoolRegistration');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');

// Helper function to get coordinates from address using OpenStreetMap Nominatim
const getCoordinates = async (areaName, pincode, cityName) => {
  try {
    // Try multiple query formats for better geocoding success
    const queries = [
      `${areaName}, ${pincode}, ${cityName}, India`,
      `${pincode}, ${cityName}, India`,
      `${areaName}, ${cityName}, India`,
      `${pincode}, India`
    ];

    for (const query of queries) {
      console.log('Trying geocoding query:', query);
      
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: query,
          format: 'json',
          limit: 1,
          countrycodes: 'in'
        },
        headers: {
          'User-Agent': 'DeliveryApp/1.0'
        }
      });

      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        console.log('Geocoding successful for query:', query, 'Result:', result);
        return {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon)
        };
      }
    }

    console.log('No coordinates found for any query format');
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// For parents: Get approved school registrations with optional search by schoolUniqueId
exports.getApprovedSchoolRegistrations = async (req, res) => {
  try {
    const { schoolUniqueId, page = 1, limit = 10 } = req.query;

    const filter = { status: 'approved' };
    if (schoolUniqueId) {
      filter.schoolUniqueId = schoolUniqueId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const registrations = await SchoolRegistration.find(filter)
      .select('-password -aadhar -aadharFrontUrl -aadharBackUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SchoolRegistration.countDocuments(filter);

    res.json({
      success: true,
      registrations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRegistrations: total,
        hasNextPage: skip + registrations.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get approved school registrations error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching registrations', error: error.message });
  }
};

// Helper function to calculate distance between two coordinates using Haversine formula
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
};

// Helper function to calculate distance between two addresses
const calculateDistance = async (address1, address2) => {
  try {
    // Get coordinates for both addresses
    const coords1 = await getCoordinates(address1.areaName, address1.pincode, address1.cityName);
    const coords2 = await getCoordinates(address2.areaName, address2.pincode, address2.cityName);

    if (!coords1 || !coords2) {
      return {
        distance: null,
        unit: 'km',
        message: 'Unable to calculate distance - coordinates not available',
        coordinates: {
          from: coords1,
          to: coords2
        }
      };
    }

    const distance = calculateHaversineDistance(
      coords1.lat, coords1.lon, 
      coords2.lat, coords2.lon
    );

    return {
      distance: distance,
      unit: 'km',
      message: 'Actual distance calculated using coordinates',
      coordinates: {
        from: coords1,
        to: coords2
      }
    };
  } catch (error) {
    console.error('Distance calculation error:', error);
    return {
      distance: null,
      unit: 'km',
      message: 'Error calculating distance',
      error: error.message
    };
  }
};

// Generate unique school ID with DELI prefix
const generateSchoolUniqueId = async () => {
  // Try random 4-digit numbers to avoid sequential guessing
  const prefix = 'DELI';
  for (let attempts = 0; attempts < 10; attempts++) {
    const num = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    const candidate = `${prefix}${num}`;
    const exists = await SchoolRegistration.findOne({ schoolUniqueId: candidate });
    if (!exists) return candidate;
  }
  // Fallback to timestamp-based
  return `${prefix}${Date.now().toString().slice(-4)}`;
};

// Public: Register school
exports.registerSchool = async (req, res) => {
  try {
    const {
      contactName,
      mobile,
      email,
      password,
      aadhar,
      schoolName,
      recogniseId,
      branchNumber,
      address
    } = req.body;

    // Files: aadharFront, aadharBack, schoolIdImage
    let aadharFrontFile = null;
    let aadharBackFile = null;
    let schoolIdImageFile = null;
    if (req.files && !Array.isArray(req.files)) {
      aadharFrontFile = (req.files['aadharFront'] && req.files['aadharFront'][0]) || null;
      aadharBackFile = (req.files['aadharBack'] && req.files['aadharBack'][0]) || null;
      schoolIdImageFile = (req.files['schoolIdImage'] && req.files['schoolIdImage'][0]) || null;
    } else {
      const filesArr = Array.isArray(req.files) ? req.files : [];
      aadharFrontFile = filesArr.find(f => f.fieldname === 'aadharFront') || null;
      aadharBackFile = filesArr.find(f => f.fieldname === 'aadharBack') || null;
      schoolIdImageFile = filesArr.find(f => f.fieldname === 'schoolIdImage') || null;
    }

    // Basic validation
    const missing = [];
    if (!contactName) missing.push('contactName');
    if (!mobile) missing.push('mobile');
    if (!email) missing.push('email');
    if (!aadhar) missing.push('aadhar');
    if (!password) missing.push('password');
    if (!schoolName) missing.push('schoolName');
    if (!recogniseId) missing.push('recogniseId');
    if (!address) missing.push('address');
    if (!aadharFrontFile) missing.push('aadharFront');
    if (!aadharBackFile) missing.push('aadharBack');
    if (!schoolIdImageFile) missing.push('schoolIdImage');

    if (missing.length) {
      return res.status(400).json({ success: false, message: 'Missing required fields', missing });
    }

    // Validate password strength (basic)
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'password must be at least 6 characters' });
    }

    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'mobile must be 10 digits' });
    }
    if (!/^\d{12}$/.test(aadhar)) {
      return res.status(400).json({ success: false, message: 'aadhar must be 12 digits' });
    }

    let parsedAddress = address;
    if (typeof parsedAddress === 'string') {
      try { parsedAddress = JSON.parse(address); } catch (e) {}
    }
    const { houseNo, apartmentName = '', areaName, landmark, city, pincode } = parsedAddress || {};
    const addrMissing = [];
    if (!houseNo) addrMissing.push('address.houseNo');
    if (!areaName) addrMissing.push('address.areaName');
    if (!landmark) addrMissing.push('address.landmark');
    if (!city) addrMissing.push('address.city');
    if (!pincode) addrMissing.push('address.pincode');
    if (addrMissing.length) {
      return res.status(400).json({ success: false, message: 'Missing address fields', missing: addrMissing });
    }
    if (!/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ success: false, message: 'pincode must be 6 digits' });
    }

    // Upload files already handled by multer-cloudinary, URLs present at file.path
    const aadharFrontUrl = aadharFrontFile.path;
    const aadharBackUrl = aadharBackFile.path;
    const schoolIdImageUrl = schoolIdImageFile.path;

    const schoolUniqueId = await generateSchoolUniqueId();

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const registration = new SchoolRegistration({
      contactName,
      mobile,
      email,
      aadhar,
      password: hashedPassword,
      aadharFrontUrl,
      aadharBackUrl,
      schoolName,
      recogniseId,
      branchNumber,
      address: { houseNo, apartmentName, areaName, landmark, city, pincode },
      schoolIdImageUrl,
      schoolUniqueId
    });

    await registration.save();

    res.status(201).json({
      success: true,
      message: 'School registered successfully',
      school: registration
    });
  } catch (error) {
    console.error('Register school error:', error);
    res.status(500).json({ success: false, message: 'Server error while registering school', error: error.message });
  }
};

// Add new school
exports.addSchool = async (req, res) => {
  try {
    const parentId = req.user.id; // From JWT token
    const {
      schoolName,
      recognisedNumber,
      branchNumber,
      houseNo,
      apartmentName,
      areaName,
      landMark,
      cityName,
      pincode,
    
    } = req.body;

    // Validate required fields
    const requiredFields = {
      schoolName, recognisedNumber, houseNo,
      areaName, landMark, cityName, pincode
    };
    
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

    // Validate pincode format
    if (pincode.length !== 6 || !/^\d+$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: 'Pincode must be exactly 6 digits'
      });
    }

    // Check if school with same recognised number exists
    const existingSchool = await School.findOne({ recognisedNumber });
    if (existingSchool) {
      return res.status(409).json({
        success: false,
        message: 'School with this recognised number already exists'
      });
    }

    // Get parent's default address for distance calculation
    const parentDefaultAddress = await ParentAddress.findOne({ 
      parentId, 
      isDefault: true 
    });

    let distanceInfo = null;
    if (parentDefaultAddress) {
      console.log(parentDefaultAddress,"parentDefaultAddress");
      
      distanceInfo = await calculateDistance(parentDefaultAddress, { areaName, pincode, cityName });
    } else {
      // If no default address, try to get any address of the parent
      const anyParentAddress = await ParentAddress.findOne({ parentId });
      if (anyParentAddress) {
        distanceInfo = await calculateDistance(anyParentAddress, { areaName, pincode, cityName });
      } else {
        // If no address at all, provide a message
        distanceInfo = {
          distance: null,
          unit: 'km',
          message: 'Distance calculation not available - no parent address found',
          coordinates: {
            from: null,
            to: null
          }
        };
      }
    }

    // Create school
    const schoolData = {
      schoolName,
      recognisedNumber,
      houseNo,
      apartmentName,
      areaName,
      landMark,
      cityName,
      pincode,
      createdBy: parentId
    };

    if (branchNumber) schoolData.branchNumber = branchNumber;

    const school = new School(schoolData);
    await school.save();

    res.status(201).json({
      success: true,
      message: 'School added successfully',
      school,
      distanceInfo
    });

  } catch (error) {
    console.error('Add school error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding school',
      error: error.message
    });
  }
};

// Get all schools with filtering
exports.getSchools = async (req, res) => {
  try {
    const parentId = req.user.id; // From JWT token
    const { 
      pincode, 
      recognisedNumber, 
      branchNumber, 
      cityName, 
      isActive,
      page = 1, 
      limit = 10 
    } = req.query;

    // Build filter object
    const filter = {};
    if (pincode) filter.pincode = pincode;
    if (recognisedNumber) filter.recognisedNumber = recognisedNumber;
    if (branchNumber) filter.branchNumber = branchNumber;
    if (cityName) filter.cityName = { $regex: cityName, $options: 'i' };
    if (typeof isActive === 'boolean') filter.isActive = isActive;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const schools = await School.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await School.countDocuments(filter);

    // Get parent's default address for distance calculation
    const parentDefaultAddress = await ParentAddress.findOne({ 
      parentId, 
      isDefault: true 
    });

    // Add distance information to each school
    const schoolsWithDistance = await Promise.all(schools.map(async school => {
      const schoolData = school.toObject();
      
      // Try to get distance info
      let distanceInfo = null;
      if (parentDefaultAddress) {
        distanceInfo = await calculateDistance(parentDefaultAddress, schoolData);
      } else {
        // If no default address, try to get any address of the parent
        const anyParentAddress = await ParentAddress.findOne({ parentId });
        if (anyParentAddress) {
          distanceInfo = await calculateDistance(anyParentAddress, schoolData);
        }
      }
      
      if (distanceInfo) {
        schoolData.distanceInfo = distanceInfo;
      }
      
      return schoolData;
    }));

    res.json({
      success: true,
      schools: schoolsWithDistance,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalSchools: total,
        hasNextPage: skip + schools.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get schools error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching schools',
      error: error.message
    });
  }
};

// Get school by ID
exports.getSchoolById = async (req, res) => {
  try {
    const parentId = req.user.id; // From JWT token
    const schoolId = req.params.schoolId;

    // Validate ObjectId to avoid CastError when path params like 'mine' are passed
    if (!mongoose.Types.ObjectId.isValid(schoolId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid schoolId'
      });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Get parent's default address for distance calculation
    const parentDefaultAddress = await ParentAddress.findOne({ 
      parentId, 
      isDefault: true 
    });

    const schoolData = school.toObject();
    
    // Try to get distance info
    let distanceInfo = null;
    if (parentDefaultAddress) {
      distanceInfo = await calculateDistance(parentDefaultAddress, schoolData);
    } else {
      // If no default address, try to get any address of the parent
      const anyParentAddress = await ParentAddress.findOne({ parentId });
      if (anyParentAddress) {
        distanceInfo = await calculateDistance(anyParentAddress, schoolData);
      }
    }
    
    if (distanceInfo) {
      schoolData.distanceInfo = distanceInfo;
    }

    res.json({
      success: true,
      school: schoolData
    });

  } catch (error) {
    console.error('Get school by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching school',
      error: error.message
    });
  }
};

// Update school
exports.updateSchool = async (req, res) => {
  try {
    const schoolId = req.params.schoolId;
    const {
      schoolName,
      recognisedNumber,
      branchNumber,
      houseNo,
      apartmentName,
      areaName,
      landMark,
      cityName,
      pincode,
      contactNumber,
      email,
      isActive
    } = req.body;

    // Check if school exists
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // Check if recognised number is being changed and if it already exists
    if (recognisedNumber && recognisedNumber !== school.recognisedNumber) {
      const existingSchool = await School.findOne({ 
        recognisedNumber, 
        _id: { $ne: schoolId } 
      });
      if (existingSchool) {
        return res.status(409).json({
          success: false,
          message: 'School with this recognised number already exists'
        });
      }
    }

    // Validate pincode if provided
    if (pincode && (pincode.length !== 6 || !/^\d+$/.test(pincode))) {
      return res.status(400).json({
        success: false,
        message: 'Pincode must be exactly 6 digits'
      });
    }

    // Update school
    const updateData = {};
    if (schoolName) updateData.schoolName = schoolName;
    if (recognisedNumber) updateData.recognisedNumber = recognisedNumber;
    if (branchNumber !== undefined) updateData.branchNumber = branchNumber;
    if (houseNo) updateData.houseNo = houseNo;
    if (apartmentName) updateData.apartmentName = apartmentName;
    if (areaName) updateData.areaName = areaName;
    if (landMark) updateData.landMark = landMark;
    if (cityName) updateData.cityName = cityName;
    if (pincode) updateData.pincode = pincode;
    if (contactNumber) updateData.contactNumber = contactNumber;
    if (email !== undefined) updateData.email = email;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;

    const updatedSchool = await School.findByIdAndUpdate(
      schoolId,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      message: 'School updated successfully',
      school: updatedSchool
    });

  } catch (error) {
    console.error('Update school error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating school',
      error: error.message
    });
  }
};

// Delete school
exports.deleteSchool = async (req, res) => {
  try {
    const schoolId = req.params.schoolId;

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    await School.findByIdAndDelete(schoolId);

    res.json({
      success: true,
      message: 'School deleted successfully'
    });

  } catch (error) {
    console.error('Delete school error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting school',
      error: error.message
    });
  }
};

// Search schools by pincode and recognised/branch number
exports.searchSchools = async (req, res) => {
  try {
    const { pincode, recognisedNumber, branchNumber } = req.query;

    if (!pincode && !recognisedNumber && !branchNumber) {
      return res.status(400).json({
        success: false,
        message: 'At least one search parameter is required (pincode, recognisedNumber, or branchNumber)'
      });
    }

    const filter = {};
    if (pincode) filter.pincode = pincode;
    if (recognisedNumber) filter.recognisedNumber = recognisedNumber;
    if (branchNumber) filter.branchNumber = branchNumber;

    const schools = await School.find(filter).sort({ schoolName: 1 });

    res.json({
      success: true,
      schools,
      count: schools.length
    });

  } catch (error) {
    console.error('Search schools error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching schools',
      error: error.message
    });
  }
}; 

// Get schools created by the logged-in parent
exports.getParentSchools = async (req, res) => {
  try {
    const parentId = req.user.id;
    console.log(parentId,"parentId");
    const schools = await School.find({ createdBy: parentId })
      .sort({ createdAt: -1 });
    console.log(schools,"schools");
    res.json({ success: true, schools });
  } catch (error) {
    console.error('Get parent schools error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching parent schools', error: error.message });
  }
};

// Calculate exact distance between a parent's address and a school by schoolUniqueId
exports.getDistanceToSchool = async (req, res) => {
  try {
    const parentId = req.user?.id;
    const { schoolUniqueId } = req.body?.schoolUniqueId ? req.body : req.query;

    if (!schoolUniqueId) {
      return res.status(400).json({ success: false, message: 'schoolUniqueId is required' });
    }
    if (!parentId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const registration = await SchoolRegistration.findOne({ schoolUniqueId });
    if (!registration) {
      return res.status(404).json({ success: false, message: 'School not found for provided schoolUniqueId' });
    }

    // Get parent's default address, fallback to any
    const parentDefaultAddress = await ParentAddress.findOne({ parentId, isDefault: true });
    const parentAnyAddress = parentDefaultAddress || await ParentAddress.findOne({ parentId });

    if (!parentAnyAddress) {
      return res.status(404).json({ success: false, message: 'No address found for the given parentId' });
    }

    // Map registration address to expected shape
    const schoolAddr = {
      areaName: registration.address?.areaName,
      pincode: registration.address?.pincode,
      cityName: registration.address?.city
    };

    if (!schoolAddr.areaName || !schoolAddr.pincode || !schoolAddr.cityName) {
      return res.status(500).json({ success: false, message: 'School address is incomplete for distance calculation' });
    }

    const distanceInfo = await calculateDistance(parentAnyAddress, schoolAddr);

    return res.json({
      success: true,
      input: { schoolUniqueId },
      fromAddress: {
        parentName: parentAnyAddress.parentName,
        studentName: parentAnyAddress.studentName,
        areaName: parentAnyAddress.areaName,
        cityName: parentAnyAddress.cityName,
        pincode: parentAnyAddress.pincode
      },
      toSchool: {
        schoolName: registration.schoolName,
        schoolUniqueId: registration.schoolUniqueId,
        areaName: schoolAddr.areaName,
        cityName: schoolAddr.cityName,
        pincode: schoolAddr.pincode,
        _id: registration._id
      },
      distanceInfo
    });
  } catch (error) {
    console.error('Get distance to school error:', error);
    res.status(500).json({ success: false, message: 'Server error while calculating distance', error: error.message });
  }
};

// Delete school created by the logged-in parent
exports.deleteParentSchool = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { schoolId } = req.params;

    const school = await School.findOne({ _id: schoolId, createdBy: parentId });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found or not created by this parent' });
    }

    await School.findByIdAndDelete(schoolId);

    res.json({ success: true, message: 'School deleted successfully' });
  } catch (error) {
    console.error('Delete parent school error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting school', error: error.message });
  }
}; 

// Update school created by the logged-in parent
exports.updateParentSchool = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { schoolId } = req.params;
    const {
      schoolName,
      recognisedNumber,
      branchNumber,
      houseNo,
      apartmentName,
      areaName,
      landMark,
      cityName,
      pincode,
      contactNumber,
      email,
      isActive
    } = req.body;

    // Check if school exists and belongs to this parent
    const school = await School.findOne({ _id: schoolId, createdBy: parentId });
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found or not created by this parent' });
    }

    // If recognisedNumber changes, ensure uniqueness across others
    if (recognisedNumber && recognisedNumber !== school.recognisedNumber) {
      const exists = await School.findOne({ recognisedNumber, _id: { $ne: schoolId } });
      if (exists) {
        return res.status(409).json({ success: false, message: 'School with this recognised number already exists' });
      }
    }

    // Validate pincode if provided
    if (pincode && (pincode.length !== 6 || !/^\d+$/.test(pincode))) {
      return res.status(400).json({ success: false, message: 'Pincode must be exactly 6 digits' });
    }

    const updateData = {};
    if (schoolName) updateData.schoolName = schoolName;
    if (recognisedNumber) updateData.recognisedNumber = recognisedNumber;
    if (branchNumber !== undefined) updateData.branchNumber = branchNumber;
    if (houseNo) updateData.houseNo = houseNo;
    if (apartmentName !== undefined) updateData.apartmentName = apartmentName;
    if (areaName) updateData.areaName = areaName;
    if (landMark) updateData.landMark = landMark;
    if (cityName) updateData.cityName = cityName;
    if (pincode) updateData.pincode = pincode;
    if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
    if (email !== undefined) updateData.email = email;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;

    const updated = await School.findByIdAndUpdate(schoolId, updateData, { new: true });

    res.json({ success: true, message: 'School updated successfully', school: updated });
  } catch (error) {
    console.error('Update parent school error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating school', error: error.message });
  }
}; 

// Get authenticated school registration (SchoolRegistration) details
exports.getMySchoolRegistration = async (req, res) => {
  try {
    // req.user is set by authenticateUser, for role 'school' id is SchoolRegistration _id
    if (!req.user || req.user.role !== 'school') {
      return res.status(403).json({ success: false, message: 'Access denied. School role required.' });
    }

    const school = await SchoolRegistration.findById(req.user.id)
      .select('-password -aadhar -aadharFrontUrl -aadharBackUrl');

    if (!school) {
      return res.status(404).json({ success: false, message: 'School registration not found' });
    }

    return res.json({ success: true, school });
  } catch (error) {
    console.error('Get my school registration error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching school registration', error: error.message });
  }
};

// Get delivery boys linked to a school by schoolUniqueId (or from authenticated school)
exports.getDeliveryBoysBySchool = async (req, res) => {
  try {
    let { schoolUniqueId, page = 1, limit = 10, approvalStatus, currentStatus } = req.query;

    // Handle cases where client sends an object (e.g., schoolUniqueId[schoolUniqueId])
    if (schoolUniqueId && typeof schoolUniqueId === 'object') {
      schoolUniqueId = schoolUniqueId.schoolUniqueId || schoolUniqueId.value || schoolUniqueId.id || '';
    }
    if (approvalStatus && typeof approvalStatus === 'object') {
      approvalStatus = approvalStatus.value || approvalStatus.status || '';
    }
    if (currentStatus && typeof currentStatus === 'object') {
      currentStatus = currentStatus.value || currentStatus.status || '';
    }
    if (page && typeof page === 'object') { page = page.page || page.value || 1; }
    if (limit && typeof limit === 'object') { limit = limit.limit || limit.value || 10; }

    // Infer from authenticated school if not provided
    if (!schoolUniqueId && req.user?.role === 'school') {
      const reg = await SchoolRegistration.findById(req.user.id).select('schoolUniqueId');
      schoolUniqueId = reg?.schoolUniqueId;
    }

    if (!schoolUniqueId) {
      return res.status(400).json({ success: false, message: 'schoolUniqueId is required' });
    }

    const filter = { schoolUniqueId: String(schoolUniqueId) };
    if (approvalStatus) filter.approvalStatus = approvalStatus;
    if (currentStatus) filter.currentStatus = currentStatus;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [deliveryBoys, total] = await Promise.all([
      DeliveryBoy.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      DeliveryBoy.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      deliveryBoys,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
        hasNextPage: skip + deliveryBoys.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get delivery boys by school error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching delivery boys', error: error.message });
  }
};

// School: Assign delivery boy to an order (only for this school's orders)
exports.assignDeliveryBoyToOrder = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'school') {
      return res.status(403).json({ success: false, message: 'Access denied. School role required.' });
    }

    const { orderId } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({ success: false, message: 'deliveryBoyId is required' });
    }

    // Resolve school registration and uniqueId from token
    const schoolReg = await SchoolRegistration.findById(req.user.id).select('schoolUniqueId');
    if (!schoolReg) {
      return res.status(404).json({ success: false, message: 'School registration not found' });
    }

    // Verify order belongs to this school
    const order = await Order.findOne({
      _id: orderId,
      $or: [
        { schoolRegistrationId: schoolReg._id },
        { schoolUniqueId: schoolReg.schoolUniqueId }
      ]
    });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this school' });
    }

    // Verify delivery boy exists (and optionally belongs to this school)
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: 'Delivery boy not found' });
    }
    // Optional enforcement: delivery boy must belong to same school if linked
    if (deliveryBoy.schoolUniqueId && deliveryBoy.schoolUniqueId !== schoolReg.schoolUniqueId) {
      return res.status(403).json({ success: false, message: 'Delivery boy does not belong to this school' });
    }

    order.deliveryBoyId = deliveryBoyId;
    order.trackingHistory.push({
      action: 'delivery_boy_assigned',
      timestamp: new Date(),
      performedBy: req.user.id,
      notes: `Assigned to delivery boy: ${deliveryBoy.name}`
    });
    await order.save();

    return res.json({ success: true, message: 'Delivery boy assigned successfully', order });
  } catch (error) {
    console.error('School assign delivery boy error:', error);
    res.status(500).json({ success: false, message: 'Server error while assigning delivery boy', error: error.message });
  }
};

// School: Update delivery boy approval status (only for delivery boys linked to this school)
exports.updateDeliveryBoyApprovalStatus = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'school') {
      return res.status(403).json({ success: false, message: 'Access denied. School role required.' });
    }

    const { deliveryBoyId } = req.params;
    const { approvalStatus, reason, isActive } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!approvalStatus || !validStatuses.includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: 'approvalStatus must be one of pending, approved, rejected' });
    }

    const schoolReg = await SchoolRegistration.findById(req.user.id).select('schoolUniqueId');
    if (!schoolReg) {
      return res.status(404).json({ success: false, message: 'School registration not found' });
    }

    const deliveryBoy = await DeliveryBoy.findOne({ _id: deliveryBoyId, schoolUniqueId: schoolReg.schoolUniqueId });
    if (!deliveryBoy) {
      return res.status(404).json({ success: false, message: 'Delivery boy not found for this school' });
    }

    deliveryBoy.approvalStatus = approvalStatus;
    if (approvalStatus === 'approved') {
      deliveryBoy.approvalDate = new Date();
      deliveryBoy.isActive = typeof isActive === 'boolean' ? isActive : true;
      deliveryBoy.rejectionReason = undefined;
    } else if (approvalStatus === 'rejected') {
      deliveryBoy.isActive = false;
      deliveryBoy.rejectionReason = reason || deliveryBoy.rejectionReason || 'Rejected by school';
      deliveryBoy.approvalDate = undefined;
    } else {
      // pending
      deliveryBoy.isActive = false;
      deliveryBoy.approvalDate = undefined;
      deliveryBoy.rejectionReason = undefined;
    }

    await deliveryBoy.save();

    return res.json({ success: true, message: 'Delivery boy approval status updated', deliveryBoy: {
      _id: deliveryBoy._id,
      name: deliveryBoy.name,
      mobile: deliveryBoy.mobile,
      approvalStatus: deliveryBoy.approvalStatus,
      isActive: deliveryBoy.isActive,
      approvalDate: deliveryBoy.approvalDate,
      rejectionReason: deliveryBoy.rejectionReason,
      schoolUniqueId: deliveryBoy.schoolUniqueId,
      schoolRegistrationId: deliveryBoy.schoolRegistrationId
    }});
  } catch (error) {
    console.error('School update delivery boy approval status error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating approval status', error: error.message });
  }
};


// Update school registration profile
exports.updateSchoolRegistrationProfile = async (req, res) => {
  try {
    const schoolRegistrationId = req.user.id;
    const { contactName, mobile, email, schoolName, recogniseId, branchNumber, address } = req.body;

    // Fetch the school registration
    const schoolRegistration = await SchoolRegistration.findById(schoolRegistrationId);
    if (!schoolRegistration) {
      return res.status(404).json({
        success: false,
        message: 'School registration not found'
      });
    }

    // Handle profile picture upload
    let profilePictureUrl = null;
    if (req.file) {
      // Cloudinary returns the URL in req.file.path
      profilePictureUrl = req.file.path;

      // Delete old profile picture from Cloudinary if it exists
      if (schoolRegistration.profilePicture) {
        try {
          // Extract public_id from the old URL
          const oldUrlParts = schoolRegistration.profilePicture.split('/');
          const oldPublicId = oldUrlParts[oldUrlParts.length - 1].split('.')[0];

          // Delete from Cloudinary
          await cloudinary.uploader.destroy(oldPublicId);
          console.log('Old profile picture deleted from Cloudinary');
        } catch (error) {
          console.error('Error deleting old profile picture:', error);
          // Continue with the update even if deletion fails
        }
      }
    }

    // Update allowed fields
    if (contactName) schoolRegistration.contactName = contactName;
    if (schoolName) schoolRegistration.schoolName = schoolName;
    if (recogniseId) {
      // Check if recogniseId is already taken by another school
      const existingSchool = await SchoolRegistration.findOne({
        recogniseId: recogniseId,
        _id: { $ne: schoolRegistrationId }
      });

      if (existingSchool) {
        return res.status(400).json({
          success: false,
          message: 'Recognise ID is already registered with another school'
        });
      }

      schoolRegistration.recogniseId = recogniseId;
    }
    if (branchNumber !== undefined) schoolRegistration.branchNumber = branchNumber; // Allow empty string
    if (profilePictureUrl) schoolRegistration.profilePicture = profilePictureUrl;

    if (mobile) {
      // Check if mobile number is already taken by another school
      const existingSchool = await SchoolRegistration.findOne({
        mobile: mobile,
        _id: { $ne: schoolRegistrationId }
      });

      if (existingSchool) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number is already registered with another school'
        });
      }

      schoolRegistration.mobile = mobile;
    }

    if (email) {
      // Check if email is already taken by another school
      const existingSchool = await SchoolRegistration.findOne({
        email: email,
        _id: { $ne: schoolRegistrationId }
      });

      if (existingSchool) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered with another school'
        });
      }

      schoolRegistration.email = email;
    }

    // Update address fields if provided
    if (address) {
      if (address.houseNo) schoolRegistration.address.houseNo = address.houseNo;
      if (address.apartmentName !== undefined) schoolRegistration.address.apartmentName = address.apartmentName;
      if (address.areaName) schoolRegistration.address.areaName = address.areaName;
      if (address.landmark) schoolRegistration.address.landmark = address.landmark;
      if (address.city) schoolRegistration.address.city = address.city;
      if (address.pincode) {
        if (!/^\d{6}$/.test(address.pincode)) {
          return res.status(400).json({
            success: false,
            message: 'Pincode must be 6 digits'
          });
        }
        schoolRegistration.address.pincode = address.pincode;
      }
    }

    await schoolRegistration.save();

    res.json({
      success: true,
      message: 'School registration profile updated successfully',
      schoolRegistration: {
        id: schoolRegistration._id,
        contactName: schoolRegistration.contactName,
        mobile: schoolRegistration.mobile,
        email: schoolRegistration.email,
        schoolName: schoolRegistration.schoolName,
        recogniseId: schoolRegistration.recogniseId,
        branchNumber: schoolRegistration.branchNumber,
        address: schoolRegistration.address,
        profilePicture: schoolRegistration.profilePicture,
        schoolUniqueId: schoolRegistration.schoolUniqueId,
        status: schoolRegistration.status
      }
    });

  } catch (error) {
    console.error('Update school registration profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: error.message
    });
  }
};

exports.getSchoolRegistrationProfile = async (req, res) => {
  console.log(req.user,'req.user');
  try {
    // Assuming you attach schoolUniqueId or schoolId to req.user in your auth middleware
    const schoolRegistrationId = req.user.id;
console.log(schoolRegistrationId,'schoolRegistrationId');
    if (!schoolRegistrationId) {
      return res.status(400).json({
        success: false,
        message: "School registration ID missing in request",
      });
    }

    const schoolRegistration = await SchoolRegistration.findOne({ _id: schoolRegistrationId });

    if (!schoolRegistration) {
      return res.status(404).json({
        success: false,
        message: "School registration not found",
      });
    }

    res.status(200).json({
      success: true,
      schoolRegistration,
    });
  } catch (error) {
    console.error("Error fetching school profile:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching profile",
    });
  }
};