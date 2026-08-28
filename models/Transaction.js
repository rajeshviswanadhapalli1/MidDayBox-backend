const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false // Made optional for UPI transfers
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: false // Made optional for UPI transfers
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolRegistration',
    required: false // For school payments
  },
  orderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false // For bulk payments to schools covering multiple orders
  }],
  paymentType: {
    type: String,
    enum: ['parent_payment', 'school_payment', 'manual_transfer'],
    default: 'parent_payment'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  razorpayOrderId: {
    type: String,
    required: false
  },
  razorpayPaymentId: {
    type: String,
    required: false
  },
  razorpaySignature: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false
  },
  failureReason: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    required: false
  },
  refundId: {
    type: String,
    required: false
  },
  refundAmount: {
    type: Number,
    required: false
  },
  refundedAt: {
    type: Date,
    required: false
  },
  // UPI transfer fields for manual admin entries
  upiRecipientName: {
    type: String,
    required: false
  },
  upiRecipientId: {
    type: String,
    required: false
  },
  upiTransactionId: {
    type: String,
    required: false
  },
  bankReference: {
    type: String,
    required: false
  },
  razorpayTransferId: {
    type: String,
    required: false
  },
  razorpayPayoutId: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

transactionSchema.index({ parentId: 1, createdAt: -1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ razorpayOrderId: 1 });
transactionSchema.index({ razorpayPaymentId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ paymentType: 1, status: 1 });
transactionSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
