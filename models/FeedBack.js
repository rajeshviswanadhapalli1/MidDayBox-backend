const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    userType: {
      type: String,
      enum: ["Parent", "DeliveryBoy", "SchoolRegistration"],
      required: true,
    },
     userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "userType", // 👈 dynamic reference
    },
    message: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
