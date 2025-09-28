const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true, unique: true, minlength: 10, maxlength: 10 },
  altMobile: { type: String, unique: true, sparse: true, minlength: 10, maxlength: 10 }, // Made optional
  password: { type: String, required: true },
  profilePicture: { type: String }, // Cloudinary URL
});

module.exports = mongoose.model('Parent', parentSchema); 