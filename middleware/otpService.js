const axios = require("axios");
const crypto = require("crypto");
const dotenv = require("dotenv");
const Otp = require("../models/otp");

dotenv.config();

const SMS_API_URL = process.env.SMS_API_URL || "http://web.smsgw.in/smsapi/httpapi.jsp";

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

const sendOTP = async (mobile, purpose = "register") => {
  console.log(`📲 Sending OTP to ${mobile} for ${purpose}`);
  
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
        ? `Hi, use OTP ${otp} to verify your MidDayBox account. This code will expire in 5 minutes. Do not share this code with anyone. MidDayBox Support`
        : `MidDayBox Reset OTP: ${otp}. Valid for 5 min. Do not share this code with anyone. MidDayBox Support`;

    // 🔹 Step 4: Send SMS
    const params = {
      username: process.env.SMS_USER,
      password: process.env.SMS_PASS,
      from: process.env.SMS_SENDER,
      to: mobile,
      text: message,
      coding: 0,
      pe_id: process.env.SMS_PE_ID,
      template_id: purpose === "register" ? process.env.SMS_TEMPLATE_ID : '1707176312205337571'
    };

    const queryString = new URLSearchParams(params).toString();
    const response = await axios.get(`${SMS_API_URL}?${queryString}`);

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
    console.log(record,'record');
    console.log(otp,'otp');
    
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
