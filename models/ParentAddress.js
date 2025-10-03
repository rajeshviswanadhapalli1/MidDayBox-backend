const mongoose = require('mongoose');

const parentAddressSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  parentName: { type: String, required: true },
  studentName: { type: String, required: true },
  studentClass: { type: String },
  rollNumber: { type: String },
  houseNo: { type: String, required: true },
  apartmentName: { type: String },
  areaName: { type: String, required: true },
  landMark: { type: String, required: true },
  cityName: { type: String, required: true },
  pincode: { type: String, required: true, minlength: 6, maxlength: 6 },
  latitude: { type: Number },
  longitude: { type: Number },
  isDefault: { type: Boolean, default: false },
  noOfBoxes: { type: Number, default: 0 }, 
}, { timestamps: true });


// Ensure only one default address per parent
parentAddressSchema.index({ parentId: 1, isDefault: 1 });

module.exports = mongoose.model('ParentAddress', parentAddressSchema); 