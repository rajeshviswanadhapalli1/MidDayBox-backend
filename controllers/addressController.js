const ParentAddress = require('../models/ParentAddress');
const Parent = require('../models/Parent');
const axios = require('axios');

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

// Add parent address
exports.addParentAddress = async (req, res) => {
  console.log(req.user,"req.user");
  console.log(req.body,"req.body");
  
  try {
    const parentId = req.user.id; // From JWT token
    console.log(parentId,"parentId");
    
  const { 
  parentName,
  studentName,
  studentClass,
  rollNumber,
  houseNo, 
  apartmentName, 
  areaName, 
  landMark, 
  cityName, 
  pincode, 
  isDefault,
  noOfBoxes 
} = req.body;

    // Validate required fields
    const requiredFields = { parentName, studentName, houseNo, areaName, landMark, cityName, pincode, noOfBoxes };
const missingFields = Object.entries(requiredFields)
  .filter(([key, value]) => value === undefined || value === null || value === '')
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

    // Check if parent exists
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: 'Parent not found'
      });
    }

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await ParentAddress.updateMany(
        { parentId, isDefault: true },
        { isDefault: false }
      );
    }

    // Get coordinates for the address
    const coordinates = await getCoordinates(areaName, pincode, cityName);

    // Create address
    const addressData = {
  parentId,
  parentName,
  studentName,
  studentClass,
  rollNumber,
  houseNo,
  apartmentName,
  areaName,
  landMark,
  cityName,
  pincode,
  isDefault: isDefault || false,
  noOfBoxes: Number(noOfBoxes) || 0, 
};

    // Add coordinates if available
    if (coordinates) {
      addressData.latitude = coordinates.lat;
      addressData.longitude = coordinates.lon;
    }

    const address = new ParentAddress(addressData);
    await address.save();

    res.status(201).json({
      success: true,
      message: 'Address added successfully',
      address
    });

  } catch (error) {
    console.error('Add address error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding address',
      error: error.message
    });
  }
};

// Get all addresses for a parent
exports.getParentAddresses = async (req, res) => {
  try {
    const parentId = req.user.id;

    const addresses = await ParentAddress.find({ parentId })
      .sort({ isDefault: -1, createdAt: -1 });

    res.json({
      success: true,
      addresses
    });

  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching addresses',
      error: error.message
    });
  }
};

// Update parent address
exports.updateParentAddress = async (req, res) => {
  try {
    const parentId = req.user.id;
    const addressId = req.params.addressId;
    const { 
  parentName,
  studentName,
  studentClass,
  rollNumber,
  houseNo, 
  apartmentName, 
  areaName, 
  landMark, 
  cityName, 
  pincode, 
  isDefault,
  noOfBoxes // ✅ new field
} = req.body;

    // Check if address exists and belongs to parent
    const address = await ParentAddress.findOne({ _id: addressId, parentId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Validate pincode if provided
    if (pincode && (pincode.length !== 6 || !/^\d+$/.test(pincode))) {
      return res.status(400).json({
        success: false,
        message: 'Pincode must be exactly 6 digits'
      });
    }

    // If setting as default, unset other default addresses
    if (isDefault) {
      await ParentAddress.updateMany(
        { parentId, _id: { $ne: addressId }, isDefault: true },
        { isDefault: false }
      );
    }

    // Update address
   const updateData = {};
if (parentName) updateData.parentName = parentName;
if (studentName) updateData.studentName = studentName;
if (studentClass !== undefined) updateData.studentClass = studentClass;
if (rollNumber !== undefined) updateData.rollNumber = rollNumber;
if (houseNo) updateData.houseNo = houseNo;
if (apartmentName) updateData.apartmentName = apartmentName;
if (areaName) updateData.areaName = areaName;
if (landMark) updateData.landMark = landMark;
if (cityName) updateData.cityName = cityName;
if (pincode) updateData.pincode = pincode;
if (typeof isDefault === 'boolean') updateData.isDefault = isDefault;
if (noOfBoxes !== undefined) updateData.noOfBoxes = Number(noOfBoxes);

// Re-geocode if areaName, cityName, or pincode updated
if (areaName || cityName || pincode) {
  const coordsArea = areaName || address.areaName;
  const coordsPincode = pincode || address.pincode;
  const coordsCity = cityName || address.cityName;

  const coordinates = await getCoordinates(coordsArea, coordsPincode, coordsCity);
  if (coordinates) {
    updateData.latitude = coordinates.lat;
    updateData.longitude = coordinates.lon;
  }
}

const updatedAddress = await ParentAddress.findByIdAndUpdate(addressId, updateData, { new: true });
res.json({
  success: true,
  message: 'Address updated successfully',
  address: updatedAddress
});

  } catch (error) {
    console.error('Update address error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating address',
      error: error.message
    });
  }
};

// Delete parent address
exports.deleteParentAddress = async (req, res) => {
  try {
    const parentId = req.user.id;
    const addressId = req.params.addressId;

    // Check if address exists and belongs to parent
    const address = await ParentAddress.findOne({ _id: addressId, parentId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    await ParentAddress.findByIdAndDelete(addressId);

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting address',
      error: error.message
    });
  }
};

// Set default address
exports.setDefaultAddress = async (req, res) => {
  try {
    const parentId = req.user.id;
    const addressId = req.params.addressId;

    // Check if address exists and belongs to parent
    const address = await ParentAddress.findOne({ _id: addressId, parentId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: 'Address not found'
      });
    }

    // Unset all default addresses for this parent
    await ParentAddress.updateMany(
      { parentId },
      { isDefault: false }
    );

    // Set this address as default
    await ParentAddress.findByIdAndUpdate(addressId, { isDefault: true });

    res.json({
      success: true,
      message: 'Default address set successfully'
    });

  } catch (error) {
    console.error('Set default address error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while setting default address',
      error: error.message
    });
  }
}; 