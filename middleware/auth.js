const jwt = require('jsonwebtoken');
const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const Admin = require('../models/Admin');
const SchoolRegistration = require('../models/SchoolRegistration');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';

// Middleware to authenticate user
exports.authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user based on role
    let user;
    if (decoded.role === 'parent') {
      user = await Parent.findById(decoded.id);
    } else if (decoded.role === 'deliveryboy') {
      user = await DeliveryBoy.findById(decoded.id);
    }else if (decoded.role === 'admin') {
      user = await Admin.findById(decoded.id);
    } else if (decoded.role === 'school') {
      user = await SchoolRegistration.findById(decoded.id);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.'
      });
    }

    req.user = {
      id: user._id,
      role: decoded.role,
      name: user.name,
      email: user.email,
      mobile: user.mobile
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Middleware to check if user is parent
exports.requireParent = (req, res, next) => {
  if (req.user.role !== 'parent') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Parent role required.'
    });
  }
  next();
};

// Middleware to check if user is delivery boy
exports.requireDeliveryBoy = (req, res, next) => {
  if (req.user.role !== 'deliveryboy') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Delivery boy role required.'
    });
  }
  next();
};

// Middleware to check if user is admin
exports.requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
}; 

// Middleware to check if user is school
exports.requireSchool = (req, res, next) => {
  console.log(req.user);
  if (req.user.role !== 'school') {
    
    return res.status(403).json({
      success: false,
      message: 'Access denied. School role required.'
    });
  }
  next();
};