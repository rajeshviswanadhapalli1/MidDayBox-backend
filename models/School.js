const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  schoolName: { 
    type: String, 
    required: true 
  },
  recognisedNumber: { 
    type: String, 
    required: true,
    unique: true
  },
  branchNumber: { 
    type: String, 
    required: false 
  },
  // School Address
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
  contactNumber: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Track which parent created this school entry
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: false,
    index: true
  }
}, {
  timestamps: true
});

// Index for efficient filtering
schoolSchema.index({ pincode: 1, recognisedNumber: 1, branchNumber: 1 });

module.exports = mongoose.model('School', schoolSchema); 