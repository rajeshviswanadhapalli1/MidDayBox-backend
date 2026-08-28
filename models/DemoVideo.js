const mongoose = require('mongoose');

const demoVideoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    audience: {
      type: String,
      enum: ['school', 'parent', 'deliveryboy'],
      required: true,
      index: true
    },
    videoUrl: { type: String, required: true },
    videoKey: { type: String, required: true },
    thumbnailUrl: { type: String, required: true },
    thumbnailKey: { type: String, required: true },
    durationSeconds: { type: Number, default: null },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  },
  { timestamps: true }
);

demoVideoSchema.index({ audience: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('DemoVideo', demoVideoSchema);
