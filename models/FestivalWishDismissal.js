const mongoose = require('mongoose');

/** Permanent "Don't show again" — close for this session is handled on the app only. */
const festivalWishDismissalSchema = new mongoose.Schema(
  {
    wishId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FestivalWish',
      required: true,
      index: true
    },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: {
      type: String,
      enum: ['school', 'parent', 'deliveryboy'],
      required: true
    }
  },
  { timestamps: true }
);

festivalWishDismissalSchema.index({ wishId: 1, userId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('FestivalWishDismissal', festivalWishDismissalSchema);
