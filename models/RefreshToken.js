const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: {
      type: String,
      required: true,
      enum: ['parent', 'deliveryboy', 'school', 'admin', 'sub_admin']
    },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ userId: 1, role: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
