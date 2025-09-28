const mongoose = require('mongoose');

const deliveryBoySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true },
  altMobile: { type: String, unique: true, sparse: true }, // Made optional
  password: { type: String, required: true },
  vehicleType: { type: String, enum: ['2 wheeler', '3 wheeler'], required: true },
  vehicleNo: { type: String, required: true },
  drivingLicenceNumber: { type: String, required: true, unique: true },
  adharNumber: { type: String, required: true, unique: true },
  adharFrontUrl: { type: String, required: true },
  adharBackUrl: { type: String, required: true },
  drivingLicenceFrontUrl: { type: String, required: true },
  drivingLicenceBackUrl: { type: String, required: true },
  profilePicture: { type: String }, // Profile picture URL
  isActive: { type: Boolean, default: false }, // Default to false, needs admin approval
  approvalStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  approvalDate: { type: Date },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  },
  rejectionReason: { type: String },
  // Status and location tracking
  currentStatus: { 
    type: String, 
    enum: ['available', 'busy', 'offline', 'on_delivery', 'break'], 
    default: 'offline' 
  },
  schoolUniqueId: { type: String, required:true },
  currentLocation: {
    type: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String }
    },
    default: null
  },
  lastStatusUpdate: { type: Date },
  statusNotes: { type: String }
}, {
  timestamps: true
});

// School linkage (optional)
deliveryBoySchema.add({
  schoolUniqueId: { type: String, index: true },
  schoolRegistrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolRegistration', index: true }
});

module.exports = mongoose.model('DeliveryBoy', deliveryBoySchema); 