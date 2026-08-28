const mongoose = require('mongoose');

const fcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    platform: { type: String, required: false, trim: true },
    role: { type: String, required: false, trim: true },

    // The app sends either `userId` or `schoolUniqueId` (or both).
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    schoolUniqueId: { type: String, required: false, trim: true, index: true },

    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FcmToken', fcmTokenSchema);

