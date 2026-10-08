require('dotenv').config();

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bodyParser = require('body-parser');
const cors = require('cors');
const { connectDB, isDBConnected } = require('./config/db');
const { initFirebaseAdmin } = require('./services/fcmService');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log("Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);
console.log("Razorpay Key Secret:", process.env.RAZORPAY_KEY_SECRET ? "Loaded ✅" : "Missing ❌");
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Import routes
const authRoutes = require('./routes/authRoutes');
const addressRoutes = require('./routes/addressRoutes');
const schoolRoutes = require('./routes/schoolRoutes');
const orderRoutes = require('./routes/orderRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const deliveryBoyRoutes = require('./routes/deliveryBoyRoutes');
const feedbackRoutes = require('./routes/feedBackRoutes');
const appRoutes = require('./routes/appRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const demoVideoRoutes = require('./routes/demoVideoRoutes');
const festivalWishRoutes = require('./routes/festivalWishRoutes');
// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/delivery-boy', deliveryBoyRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/app', appRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/demo-videos', demoVideoRoutes);
app.use('/api/festival-wishes', festivalWishRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbConnected = isDBConnected();
  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected
      ? 'MidDayBox Server is running with Version Code 1.0.7'
      : 'Server is up but MongoDB is not connected',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5001;

initFirebaseAdmin().then((firebaseApp) => {
  console.log(
    firebaseApp
      ? 'Firebase Admin initialized'
      : 'Firebase Admin not configured — push notifications are disabled'
  );
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });