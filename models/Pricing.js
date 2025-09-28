const mongoose = require('mongoose');

const tierSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    tiers: {
      type: [tierSchema],
      validate: {
        validator: function (tiers) {
          return Array.isArray(tiers) && tiers.length > 0;
        },
        message: 'At least one tier is required',
      },
      required: true,
    },
    boxPrice: { type: Number, required: true, min: 0 },
    gstPercent: { type: Number, required: true, min: 0, max: 100 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pricing', pricingSchema); 