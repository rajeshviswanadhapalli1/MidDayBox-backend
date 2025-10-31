const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["register", "forgot_password"],
      default: "register",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 300, // ⏰ OTP expires in 5 minutes
    },
  },
  { timestamps: true }
);

const Otp = mongoose.model("Otp", otpSchema);
module.exports = Otp;
