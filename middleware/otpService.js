const axios = require("axios");
const qs = require("qs");
const crypto = require("crypto");
const dotenv = require("dotenv");
const Otp = require("../models/otp");

dotenv.config();

const SMS_API_URL = "https://bhashsms.com/api/sendmsg.php";

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

const sendOTP = async (mobile, purpose = "register") => {
  try {
    // 🔹 Step 1: Check if a recent OTP exists (within 2 minutes)
    let existing = await Otp.findOne({
      mobile,
      purpose,
      createdAt: { $gt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    // 🔹 Step 2: Use existing OTP or generate new
    let otp;
    if (existing) {
      otp = existing.otp;
      console.log("♻️ Reusing existing OTP:", otp);
    } else {
      otp = generateOTP();
      console.log("✨ Generated new OTP:", otp);

      // Save new OTP record
      existing = new Otp({ mobile, purpose, otp, createdAt: new Date() });
      await existing.save();
    }

    // 🔹 Step 3: Prepare message
    const message =
      purpose === "register"
        ? `Your MidDayBox verification code is ${otp}.`
        : `Your MidDayBox password reset code is ${otp}.`;

    // 🔹 Step 4: Send SMS only once
    const params = {
      user: process.env.SMS_USER,
      pass: process.env.SMS_PASS,
      sender: process.env.SMS_SENDER,
      phone: mobile,
      text: message,
      priority: "ndnd",
      stype: "normal",
    };

    const response = await axios.post(SMS_API_URL, qs.stringify(params), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    console.log("✅ OTP Sent:", response.data);
    return { success: true, message: "OTP sent successfully" };
  } catch (error) {
    console.error("❌ OTP Send Error:", error.message);
    return { success: false, message: "Failed to send OTP" };
  }
};

const verifyOTP = async (mobile, otp, purpose = "register") => {
  try {
    const record = await Otp.findOne({ mobile, purpose });
    if (!record) return { success: false, message: "OTP not found or expired" };
    if (record.otp !== otp) return { success: false, message: "Invalid OTP" };

    await Otp.deleteOne({ _id: record._id });
    return { success: true, message: "OTP verified successfully" };
  } catch (error) {
    console.error("❌ OTP Verify Error:", error.message);
    return { success: false, message: "Server error verifying OTP" };
  }
};

module.exports = { sendOTP, verifyOTP };
