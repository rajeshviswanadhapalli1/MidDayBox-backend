const mongoose = require('mongoose');

const paymentOrderSchema = new mongoose.Schema({
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: true
  },
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true
  },
  orderData: {
    parentAddressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentAddress',
      required: true
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: false
    },
    schoolUniqueId: {
      type: String,
      required: true
    },
    schoolRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolRegistration',
      required: true
    },
    orderType: {
      type: String,
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
    type: Date,
    required: true
  },
    deliveryTime: {
      type: String,
      required: true
    },
    basePrice: {
      type: Number,
      required: true
    },
    noOfBoxes: {
      type: Number,
      required: true
    },
    distance: {
      type: Number,
      required: true
    },
    totalAmount: {
      type: Number,
      required: true
    },
    specialInstructions: {
      type: String,
      required: false
    },
    dietaryRestrictions: {
      type: String,
      required: false
    },
    lunchBoxType: {
      type: String,
      required: false
    }
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending'
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 60 * 1000)
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

paymentOrderSchema.index({ parentId: 1, createdAt: -1 });
paymentOrderSchema.index({ razorpayOrderId: 1 });
paymentOrderSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
