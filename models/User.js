const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true },
  altMobile: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['parent', 'delivery_boy', 'admin'], 
    required: true 
  },
  // Reference to the specific user type
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Parent' 
  },
  deliveryBoyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DeliveryBoy' 
  },
  adminId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  profilePicture: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema); 