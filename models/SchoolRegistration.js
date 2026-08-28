const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  houseNo: { type: String, required: true },
  apartmentName: { type: String, required: false },
  areaName: { type: String, required: true },
  landmark: { type: String, required: true },
  city: { type: String, required: true },
  pincode: { type: String, required: true, minlength: 6, maxlength: 6 }
}, { _id: false });

const bankDetailsSchema = new mongoose.Schema({
  bankName: { type: String, required: false },
  ifscCode: { type: String, required: false },
  accountHolderName: { type: String, required: false },
  accountNumber: { type: String, required: false },
  documentImageUrl: { type: String, required: false }
}, { _id: false });

const schoolRegistrationSchema = new mongoose.Schema({
  contactName: { type: String, required: true },
  mobile: { type: String, required: true, unique: true, minlength: 10, maxlength: 10 },
  password: { type: String, required: true, minlength: 4 },
  email: { type: String, required: true,unique: true },
  aadhar: { type: String, required: true, minlength: 12, maxlength: 12 },
  aadharFrontUrl: { type: String, required: true },
  aadharBackUrl: { type: String, required: true },
  schoolName: { type: String, required: true },
  recogniseId: { type: String, required: true,unique: true },
 branchNumber: {
  type: String,
  required: false,
  unique: false,
  index: true, // Allows multiple docs with no branchNumber
},
  address: { type: addressSchema, required: true },
  schoolIdImageUrl: { type: String, required: true },
  profilePicture: { type: String },

  // Generated unique ID like DELI2468
  schoolUniqueId: { type: String, required: true, unique: true, index: true },
   
  // Payment details (UPI or Bank)
  upiId: { type: String, required: false, default: null },
  bankDetails: { type: bankDetailsSchema, default: null },

  // Razorpay Route linked account ID (acc_xxx) for receiving 2% share via transfer
  razorpayLinkedAccountId: { type: String, required: false, default: null },
  // RazorpayX for bank payout: contact ID and fund account ID (created from bankDetails)
  razorpayContactId: { type: String, required: false, default: null },
  razorpayFundAccountId: { type: String, required: false, default: null },

  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('SchoolRegistration', schoolRegistrationSchema);
