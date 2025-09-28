const mongoose = require('mongoose');

const parentAddressSchema = new mongoose.Schema({
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Parent', 
    required: true 
  },
  parentName: {
    type: String,
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  studentClass: {
    type: String,
    required: false
  },
  rollNumber: {
    type: String,
    required: false
  },
  houseNo: { 
    type: String, 
    required: true 
  },
  apartmentName: { 
    type: String, 
    required: false 
  },
  areaName: { 
    type: String, 
    required: true 
  },
  landMark: { 
    type: String, 
    required: true 
  },
  cityName: { 
    type: String, 
    required: true 
  },
  pincode: {
    type: String,
    required: true,
    minlength: 6,
    maxlength: 6
  },
  latitude: {
    type: Number,
    required: false
  },
  longitude: {
    type: Number,
    required: false
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Ensure only one default address per parent
parentAddressSchema.index({ parentId: 1, isDefault: 1 });

module.exports = mongoose.model('ParentAddress', parentAddressSchema); 