const Admin = require('../models/Admin');
const Parent = require('../models/Parent');
const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const School = require('../models/School');
const ParentAddress = require('../models/ParentAddress');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { issueTokenPair } = require('../utils/tokenService');
const Pricing = require('../models/Pricing');
const SchoolRegistration = require('../models/SchoolRegistration');
const { sendSchoolApprovedNotification } = require('../services/fcmService');
const { enrichOrder, enrichOrders } = require('../utils/orderSchedule');

// Initialize admin credentials (hardcoded)
const initializeAdmin = async () => {
  try {
    const adminExists = await Admin.findOne({ email: 'admin@lunchapp.com' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new Admin({
        name: 'System Admin',
        email: 'admin@lunchapp.com',
        mobile: '9876543210',
        password: hashedPassword,
        role: 'admin'
      });
      await admin.save();
    
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
};

// Call initialization
initializeAdmin();

// Admin login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const admin = await Admin.findOne({ email, isActive: true });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const tokens = await issueTokenPair({
      userId: admin._id,
      role: admin.role || 'admin',
      req
    });

    res.json({
      success: true,
      message: 'Login successful',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        role: admin.role,
        permissions: admin.role === 'sub_admin' ? (admin.permissions || []) : undefined
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

const SUB_ADMIN_PERMISSION_KEYS = [
  'dashboard',
  'users',
  'orders',
  'prices',
  'schools',
  'transactions',
  'sub_admins',
  'feedbacks'
];

const normalizePermissions = (permissions) => {
  const arr = Array.isArray(permissions) ? permissions : [];
  const norm = arr
    .map((p) => String(p).trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(norm.filter((p) => SUB_ADMIN_PERMISSION_KEYS.includes(p))));
};

// Add Sub Admin (admin only)
exports.createSubAdmin = async (req, res) => {
  try {
    const { name, email, mobile, password, permissions } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({ success: false, message: 'name, email, mobile, password are required' });
    }

    const existing = await Admin.findOne({ $or: [{ email }, { mobile }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Admin with this email/mobile already exists' });
    }

    const perms = normalizePermissions(permissions);
    const hashedPassword = await bcrypt.hash(String(password), 10);

    const subAdmin = new Admin({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      mobile: String(mobile).trim(),
      password: hashedPassword,
      role: 'sub_admin',
      permissions: perms,
      createdBy: req.user?.id || null
    });

    await subAdmin.save();

    res.status(201).json({
      success: true,
      message: 'Sub admin created successfully',
      subAdmin: {
        id: subAdmin._id,
        name: subAdmin.name,
        email: subAdmin.email,
        mobile: subAdmin.mobile,
        role: subAdmin.role,
        permissions: subAdmin.permissions,
        isActive: subAdmin.isActive,
        createdAt: subAdmin.createdAt
      }
    });
  } catch (error) {
    console.error('Create sub admin error:', error);
    res.status(500).json({ success: false, message: 'Server error while creating sub admin', error: error.message });
  }
};

// Get all Sub Admins (admin only)
exports.getSubAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const filter = { role: 'sub_admin' };
    if (search) {
      const regex = new RegExp(String(search), 'i');
      filter.$or = [{ name: regex }, { email: regex }, { mobile: regex }];
    }

    const [items, total] = await Promise.all([
      Admin.find(filter)
        .select('name email mobile role permissions isActive createdAt updatedAt createdBy')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Admin.countDocuments(filter)
    ]);

    res.json({
      success: true,
      subAdmins: items,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        total,
        hasNextPage: skip + items.length < total,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Get sub admins error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching sub admins', error: error.message });
  }
};

// Update Sub Admin (admin/sub_admins permission)
exports.updateSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, mobile, permissions, isActive, password } = req.body || {};

    const subAdmin = await Admin.findOne({ _id: id, role: 'sub_admin' });
    if (!subAdmin) {
      return res.status(404).json({ success: false, message: 'Sub admin not found' });
    }

    if (email && String(email).trim().toLowerCase() !== subAdmin.email) {
      const existingEmail = await Admin.findOne({ email: String(email).trim().toLowerCase(), _id: { $ne: subAdmin._id } });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
      subAdmin.email = String(email).trim().toLowerCase();
    }

    if (mobile && String(mobile).trim() !== subAdmin.mobile) {
      const existingMobile = await Admin.findOne({ mobile: String(mobile).trim(), _id: { $ne: subAdmin._id } });
      if (existingMobile) {
        return res.status(400).json({ success: false, message: 'Mobile already in use' });
      }
      subAdmin.mobile = String(mobile).trim();
    }

    if (name) subAdmin.name = String(name).trim();

    if (permissions !== undefined) {
      subAdmin.permissions = normalizePermissions(permissions);
    }

    if (typeof isActive === 'boolean') {
      subAdmin.isActive = isActive;
    }

    if (password) {
      subAdmin.password = await bcrypt.hash(String(password), 10);
    }

    await subAdmin.save();

    res.json({
      success: true,
      message: 'Sub admin updated successfully',
      subAdmin: {
        id: subAdmin._id,
        name: subAdmin.name,
        email: subAdmin.email,
        mobile: subAdmin.mobile,
        role: subAdmin.role,
        permissions: subAdmin.permissions,
        isActive: subAdmin.isActive,
        updatedAt: subAdmin.updatedAt
      }
    });
  } catch (error) {
    console.error('Update sub admin error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating sub admin', error: error.message });
  }
};

// Delete Sub Admin (admin/sub_admins permission)
exports.deleteSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const subAdmin = await Admin.findOne({ _id: id, role: 'sub_admin' });
    if (!subAdmin) {
      return res.status(404).json({ success: false, message: 'Sub admin not found' });
    }

    await Admin.deleteOne({ _id: subAdmin._id });

    res.json({
      success: true,
      message: 'Sub admin deleted successfully'
    });
  } catch (error) {
    console.error('Delete sub admin error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting sub admin', error: error.message });
  }
};

// Get all users (parents and delivery boys)
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, userType } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let parents = [];
    let deliveryBoys = [];
    let totalParents = 0;
    let totalDeliveryBoys = 0;

    if (!userType || userType === 'parent') {
      totalParents = await Parent.countDocuments();
      parents = await Parent.find()
        .select('name email mobile altMobile createdAt updatedAt')
        .sort({ createdAt: -1 }) // latest first
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
    }

    if (!userType || userType === 'deliveryboy') {
      totalDeliveryBoys = await DeliveryBoy.countDocuments();
      deliveryBoys = await DeliveryBoy.find()
        .select('name email mobile altMobile vehicleType vehicleNo drivingLicenceNumber adharNumber adharFrontUrl adharBackUrl drivingLicenceFrontUrl drivingLicenceBackUrl isActive approvalStatus createdAt updatedAt')
        .sort({ createdAt: -1 }) // latest first
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);
    }

    // build pagination count separately for each type
    let totalRecords = 0;
    if (userType === 'parent') totalRecords = totalParents;
    else if (userType === 'deliveryboy') totalRecords = totalDeliveryBoys;
    else totalRecords = totalParents + totalDeliveryBoys; // combined count

    res.json({
      success: true,
      data: {
        parents,
        deliveryBoys,
        totalParents,
        totalDeliveryBoys
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalRecords / limitNum),
        hasNextPage: pageNum * limitNum < totalRecords,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
      error: error.message
    });
  }
};

// Get all orders with filtering
exports.getAllOrders = async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 10,
      parentId,
      deliveryBoyId,
      paymentStatus,
      orderType,
      startDate,
      endDate,
      schoolId
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (schoolId) filter.schoolRegistrationId = schoolId;
    if (parentId) filter.parentId = parentId;
    if (deliveryBoyId) filter.deliveryBoyId = deliveryBoyId;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (orderType) filter.orderType = orderType;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(filter)
      .populate('parentId', 'name email mobile')
      .populate('parentAddressId', 'parentName studentName areaName cityName')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      orders: enrichOrders(orders),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total,
        hasNextPage: skip + orders.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders',
      error: error.message
    });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findById(orderId)
      .populate('parentId', 'name email mobile')
      .populate('parentAddressId')
      .populate('schoolId')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
      .populate('schoolRegistrationId')

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order: enrichOrder(order)
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching order details',
      error: error.message
    });
  }
};

// Update distance pricing
exports.updateDistancePricing = async (req, res) => {
  try {
    const { basePricePerKm, freeDistanceKm } = req.body;

    // Store pricing in environment or database
    // For now, we'll return the pricing structure
    const pricing = {
      basePricePerKm: basePricePerKm || 5,
      freeDistanceKm: freeDistanceKm || 5,
      updatedAt: new Date()
    };

    res.json({
      success: true,
      message: 'Distance pricing updated successfully',
      pricing
    });

  } catch (error) {
    console.error('Update distance pricing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating pricing',
      error: error.message
    });
  }
};

// Get available delivery boys for order assignment
exports.getAvailableDeliveryBoys = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { maxDistance = 10 } = req.query; // Maximum distance in km

    const order = await Order.findById(orderId)
      .populate('parentAddressId')
      .populate('schoolId');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get all active delivery boys
    const deliveryBoys = await DeliveryBoy.find({ isActive: true });

    // Calculate distance for each delivery boy
    const availableDeliveryBoys = [];

    for (const deliveryBoy of deliveryBoys) {
      // Get delivery boy's current location (you might want to store this)
      // For now, we'll use a default location or calculate from their last delivery
      
      const distance = await calculateDistanceFromDeliveryBoy(
        deliveryBoy._id,
        order.parentAddressId,
        order.schoolId
      );

      if (distance <= maxDistance) {
        availableDeliveryBoys.push({
          deliveryBoy: {
            id: deliveryBoy._id,
            name: deliveryBoy.name,
            mobile: deliveryBoy.mobile,
            vehicleType: deliveryBoy.vehicleType,
            vehicleNo: deliveryBoy.vehicleNo
          },
          distance: distance,
          estimatedTime: Math.ceil(distance * 3) // Rough estimate: 3 minutes per km
        });
      }
    }

    // Sort by distance
    availableDeliveryBoys.sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        parentName: order.parentAddressId?.parentName,
        studentName: order.parentAddressId?.studentName,
        schoolName: order.schoolId?.schoolName,
        deliveryTime: order.deliveryTime
      },
      availableDeliveryBoys
    });

  } catch (error) {
    console.error('Get available delivery boys error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching available delivery boys',
      error: error.message
    });
  }
};

// Assign delivery boy to order
exports.assignDeliveryBoy = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery boy ID is required'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Check if delivery boy is available (not assigned to too many orders)
    const assignedOrders = await Order.countDocuments({
      deliveryBoyId,
      status: 'active',
      'dailyDeliveries.date': {
        $gte: new Date(),
        $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
      }
    });

    if (assignedOrders >= 10) { // Maximum 10 active orders per delivery boy
      return res.status(400).json({
        success: false,
        message: 'Delivery boy has reached maximum order limit'
      });
    }

    // Update order
    order.deliveryBoyId = deliveryBoyId;
    order.trackingHistory.push({
      action: 'delivery_boy_assigned',
      timestamp: new Date(),
      performedBy: req.user.id,
      notes: `Assigned to delivery boy: ${deliveryBoy.name}`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Delivery boy assigned successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        deliveryBoy: {
          id: deliveryBoy._id,
          name: deliveryBoy.name,
          mobile: deliveryBoy.mobile,
          vehicleType: deliveryBoy.vehicleType
        }
      }
    });

  } catch (error) {
    console.error('Assign delivery boy error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while assigning delivery boy',
      error: error.message
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['active', 'paused', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.status = status;
    order.trackingHistory.push({
      action: `order_status_${status}`,
      timestamp: new Date(),
      performedBy: req.user.id,
      notes: notes || `Order status updated to ${status}`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status
      }
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating order status',
      error: error.message
    });
  }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const totalParents = await Parent.countDocuments();
    const totalDeliveryBoys = await DeliveryBoy.countDocuments();
    const totalOrders = await Order.countDocuments();
    const activeOrders = await Order.countDocuments({ status: 'active' });
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const totalSchools = await School.countDocuments();

    // Get today's orders
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow }
    });

    // Get recent orders
    const recentOrders = await Order.find()
      .populate('parentId', 'name')
      .populate('schoolId', 'schoolName')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      stats: {
        totalParents,
        totalDeliveryBoys,
        totalOrders,
        activeOrders,
        completedOrders,
        totalSchools,
        todayOrders
      },
      recentOrders
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard stats',
      error: error.message
    });
  }
};

// Approve or reject delivery boy
exports.updateDeliveryBoyStatus = async (req, res) => {
  try {
    const { deliveryBoyId } = req.params;
    const { status, reason } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Update delivery boy status
    deliveryBoy.isActive = status === 'approved';
    deliveryBoy.approvalStatus = status;
    deliveryBoy.approvalDate = new Date();
    deliveryBoy.approvedBy = req.user.id;
    deliveryBoy.rejectionReason = status === 'rejected' ? reason : null;

    await deliveryBoy.save();

    // Add to tracking history if you want to track approval/rejection
    // You might want to create a separate tracking collection for this

    res.json({
      success: true,
      message: `Delivery boy ${status} successfully`,
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        mobile: deliveryBoy.mobile,
        isActive: deliveryBoy.isActive,
        approvalStatus: deliveryBoy.approvalStatus,
        approvalDate: deliveryBoy.approvalDate,
        rejectionReason: deliveryBoy.rejectionReason
      }
    });

  } catch (error) {
    console.error('Update delivery boy status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating delivery boy status',
      error: error.message
    });
  }
};

// Get pending delivery boys for approval
exports.getPendingDeliveryBoys = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const pendingDeliveryBoys = await DeliveryBoy.find({ 
      isActive: false,
      approvalStatus: { $exists: false }
    })
    .select('name email mobile altMobile vehicleType vehicleNo drivingLicenceNumber adharNumber adharFrontUrl adharBackUrl drivingLicenceFrontUrl drivingLicenceBackUrl createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await DeliveryBoy.countDocuments({ 
      isActive: false,
      approvalStatus: { $exists: false }
    });

    res.json({
      success: true,
      pendingDeliveryBoys,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalPending: total,
        hasNextPage: skip + pendingDeliveryBoys.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get pending delivery boys error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending delivery boys',
      error: error.message
    });
  }
};

// Get all delivery boys with approval status
exports.getAllDeliveryBoysWithStatus = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (status) {
      if (status === 'pending') {
        filter.isActive = false;
        filter.approvalStatus = { $exists: false };
      } else if (status === 'approved') {
        filter.isActive = true;
        filter.approvalStatus = 'approved';
      } else if (status === 'rejected') {
        filter.approvalStatus = 'rejected';
      }
    }

    const deliveryBoys = await DeliveryBoy.find(filter)
    .select('name email mobile altMobile vehicleType vehicleNo drivingLicenceNumber adharNumber adharFrontUrl adharBackUrl drivingLicenceFrontUrl drivingLicenceBackUrl isActive approvalStatus approvalDate rejectionReason createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await DeliveryBoy.countDocuments(filter);

    res.json({
      success: true,
      deliveryBoys,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalDeliveryBoys: total,
        hasNextPage: skip + deliveryBoys.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all delivery boys with status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching delivery boys',
      error: error.message
    });
  }
};

// Get pricing
exports.getPricing = async (req, res) => {
  try {
    const latestPricing = await Pricing.findOne().sort({ createdAt: -1 });
    if (!latestPricing) {
      return res.json({
        success: true,
        pricing: null
      });
    }
    res.json({ success: true, pricing: latestPricing });
  } catch (error) {
    console.error('Get pricing error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching pricing', error: error.message });
  }
};

// Update pricing
exports.updatePricing = async (req, res) => {
  try {
    const { tiers, boxPrice, gstPercent, serviceChargePercent, schoolPaymentPercent } = req.body;

    // Basic validation
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return res.status(400).json({ success: false, message: 'tiers must be a non-empty array' });
    }
    const formattedTiers = [];
    for (const tier of tiers) {
      if (!tier || typeof tier !== 'object') {
        return res.status(400).json({ success: false, message: 'Each tier must be an object with label and price' });
      }
      const { label, price } = tier;
      if (!label || typeof label !== 'string' || label.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Each tier must have a non-empty label' });
      }
      if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
        return res.status(400).json({ success: false, message: 'Each tier must have a non-negative price' });
      }
      formattedTiers.push({ label: label.trim(), price: Number(price) });
    }

    if (boxPrice === undefined || boxPrice === null || isNaN(Number(boxPrice)) || Number(boxPrice) < 0) {
      return res.status(400).json({ success: false, message: 'boxPrice must be a non-negative number' });
    }
    if (gstPercent === undefined || gstPercent === null || isNaN(Number(gstPercent)) || Number(gstPercent) < 0 || Number(gstPercent) > 100) {
      return res.status(400).json({ success: false, message: 'gstPercent must be a number between 0 and 100' });
    }
    if (serviceChargePercent === undefined || serviceChargePercent === null || isNaN(Number(serviceChargePercent)) || Number(serviceChargePercent) < 0 || Number(serviceChargePercent) > 100) {
      return res.status(400).json({ success: false, message: 'serviceChargePercent must be a number between 0 and 100' });
    }

    let schoolPaymentPercentVal = 2;
    if (schoolPaymentPercent !== undefined && schoolPaymentPercent !== null) {
      const v = Number(schoolPaymentPercent);
      if (isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ success: false, message: 'schoolPaymentPercent must be a number between 0 and 100' });
      }
      schoolPaymentPercentVal = v;
    }

    // Create new pricing version (keeps history)
    const pricing = new Pricing({
      tiers: formattedTiers,
      boxPrice: Number(boxPrice),
      gstPercent: Number(gstPercent),
      serviceChargePercent: Number(serviceChargePercent),
      schoolPaymentPercent: schoolPaymentPercentVal,
      updatedBy: req.user?.id || null
    });

    await pricing.save();

    res.json({
      success: true,
      message: 'Pricing updated successfully',
      pricing
    });
  } catch (error) {
    console.error('Update pricing error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating pricing', error: error.message });
  }
};

// Get all school registrations with filters
exports.getSchoolRegistrations = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status, // pending | approved | rejected
      search // matches contactName, schoolName, email, mobile, recogniseId, branchNumber
    } = req.query;

    const filter = {};
    if (status) {
      filter.status = status;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { contactName: regex },
        { schoolName: regex },
        { email: regex },
        { mobile: regex },
        { recogniseId: regex },
        { branchNumber: regex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const registrations = await SchoolRegistration.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await SchoolRegistration.countDocuments(filter);

    res.json({
      success: true,
      registrations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalRegistrations: total,
        hasNextPage: skip + registrations.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get school registrations error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching school registrations',
      error: error.message
    });
  }
};

// Get school registration by id
exports.getSchoolRegistrationById = async (req, res) => {
  try {
    const { id } = req.params;

    const registration = await SchoolRegistration.findById(id).select('-password');
    if (!registration) {
      return res.status(404).json({ success: false, message: 'School registration not found' });
    }

    res.json({ success: true, registration });
  } catch (error) {
    console.error('Get school registration by id error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching school registration', error: error.message });
  }
};

// Update school registration status
exports.updateSchoolRegistrationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of pending, approved, rejected' });
    }

    const registration = await SchoolRegistration.findById(id);
    if (!registration) {
      return res.status(404).json({ success: false, message: 'School registration not found' });
    }

    const previousStatus = registration.status;

    registration.status = status;
    if (status === 'rejected') {
      registration.rejectionReason = reason || null;
    } else {
      registration.rejectionReason = undefined;
    }
    registration.approvedBy = req.user.id;
    registration.approvalDate = status === 'approved' ? new Date() : undefined;

    await registration.save();

    const sanitized = registration.toObject();
    delete sanitized.password;

    // Push notification only on transition: pending -> approved.
    if (previousStatus === 'pending' && status === 'approved') {
      sendSchoolApprovedNotification({
        schoolRegistrationId: registration._id,
        schoolUniqueId: registration.schoolUniqueId
      }).catch((e) => {
        // Never block admin workflow due to FCM issues.
        console.error('FCM school approved notification error:', e);
      });
    }

    res.json({ success: true, message: `School registration ${status}`, registration: sanitized });
  } catch (error) {
    console.error('Update school registration status error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating school registration status', error: error.message });
  }
};

// Helper function to calculate distance from delivery boy
const calculateDistanceFromDeliveryBoy = async (deliveryBoyId, parentAddress, school) => {
  try {
    // This is a simplified calculation
    // In a real app, you'd track delivery boy's current location
    const coords1 = await getCoordinates(parentAddress.areaName, parentAddress.pincode, parentAddress.cityName);
    const coords2 = await getCoordinates(school.areaName, school.pincode, school.cityName);

    if (!coords1 || !coords2) {
      return 999; // Return high distance if coordinates not found
    }

    return calculateHaversineDistance(coords1.lat, coords1.lon, coords2.lat, coords2.lon);
  } catch (error) {
    console.error('Distance calculation error:', error);
    return 999;
  }
};

// Helper function to get coordinates
const getCoordinates = async (areaName, pincode, cityName) => {
  try {
    const queries = [
      `${areaName}, ${pincode}, ${cityName}, India`,
      `${pincode}, ${cityName}, India`,
      `${areaName}, ${cityName}, India`,
      `${pincode}, India`
    ];

    for (const query of queries) {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: query,
          format: 'json',
          limit: 1,
          countrycodes: 'in'
        },
        headers: {
          'User-Agent': 'DeliveryApp/1.0'
        }
      });

      if (response.data && response.data.length > 0) {
        return {
          lat: parseFloat(response.data[0].lat),
          lon: parseFloat(response.data[0].lon)
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// Helper function to calculate Haversine distance
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return Math.round(distance * 10) / 10;
};

exports.getSchoolRegistrationOrders = async (req, res) => {
  try {
    const { schoolId, status, page, limit } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'schoolId is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'status is required (active or completed)'
      });
    }

    const filter = {
      schoolRegistrationId: schoolId,
      status: status
    };

    let query = Order.find(filter)
      .populate('parentId', 'name email mobile')
      .populate('parentAddressId', 'parentName studentName areaName cityName pincode')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email')
      .populate('deliveryBoyId', 'name mobile vehicleType')
      .sort({ createdAt: -1 });

    let orders;
    let pagination = null;

    if (page && limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await Order.countDocuments(filter);

      orders = await query.skip(skip).limit(parseInt(limit));

      pagination = {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total,
        hasNextPage: skip + orders.length < total,
        hasPrevPage: parseInt(page) > 1
      };
    } else {
      orders = await query;
    }

    res.json({
      success: true,
      orders,
      ...(pagination && { pagination })
    });

  } catch (error) {
    console.error('Get school registration orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching school registration orders',
      error: error.message
    });
  }
}; 