const mongoose = require('mongoose');

const festivalWishSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, trim: true, default: '' },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    mediaUrl: { type: String, required: true },
    mediaKey: { type: String, required: true },
    thumbnailUrl: { type: String, default: null },
    thumbnailKey: { type: String, default: null },
    audience: {
      type: String,
      enum: ['all', 'school', 'parent', 'deliveryboy'],
      default: 'all',
      index: true
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

festivalWishSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('FestivalWish', festivalWishSchema);
