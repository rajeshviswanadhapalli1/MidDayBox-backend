const Order = require('../models/Order');
const mongoose = require('mongoose');
const Parent = require('../models/Parent');
const ParentAddress = require('../models/ParentAddress');
const School = require('../models/School');
const SchoolRegistration = require('../models/SchoolRegistration');
const DeliveryBoy = require('../models/DeliveryBoy');
const Razorpay = require('razorpay');
const {
  buildDeliverySchedule,
  enrichOrder,
  enrichOrders,
  isSunday
} = require('../utils/orderSchedule');

const toObjectId = value => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const resolveSchoolIdentifiers = async (req, params = {}) => {
  const { schoolUniqueId, schoolRegistrationId, registrationId } = params;
  let resolvedUniqueId = schoolUniqueId;
  let resolvedRegistrationId = schoolRegistrationId || registrationId;
  if (!resolvedUniqueId && !resolvedRegistrationId && req.user?.role === 'school') {
    const reg = await SchoolRegistration.findById(req.user.id).select('schoolUniqueId');
    if (reg) {
      resolvedUniqueId = reg.schoolUniqueId;
      resolvedRegistrationId = reg._id?.toString();
    }
  }
  return { resolvedUniqueId, resolvedRegistrationId };
};

const getAssignmentSummary = async filter => {
  const baseFilter = { ...filter };
  const assignedFilter = { ...baseFilter, deliveryBoyId: { $ne: null } };
  const unAssignedFilter = {
    ...baseFilter,
    $or: [
      { deliveryBoyId: null },
      { deliveryBoyId: { $exists: false } }
    ]
  };
  const [assignedOrdersCount, unAssignedOrdersCount, totalOrders] = await Promise.all([
    Order.countDocuments(assignedFilter),
    Order.countDocuments(unAssignedFilter),
    Order.countDocuments(baseFilter)
  ]);
  return { assignedOrdersCount, unAssignedOrdersCount, totalOrders };
};

// Create new lunch box order with payment integration
exports.createOrder = async (req, res) => {
  try {
    const parentId = req.user.id;
    const {
      parentAddressId,
      schoolId,
      schoolUniqueId,
      schoolRegistrationId,
      orderType,
      startDate,
      deliveryTime,
      basePrice,
      noOfBoxes,
      distance,
      specialInstructions,
      dietaryRestrictions,
      lunchBoxType,
    } = req.body;

    // Validate required fields
    const requiredFields = {
      parentAddressId, schoolUniqueId,schoolRegistrationId, orderType, startDate, deliveryTime, basePrice, noOfBoxes
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    // Validate noOfBoxes as a positive integer
    const boxesCount = Number(noOfBoxes);
    if (!Number.isFinite(boxesCount) || boxesCount < 1 || !Number.isInteger(boxesCount)) {
      return res.status(400).json({
        success: false,
        message: 'noOfBoxes must be a positive integer (min 1)'
      });
    }

    // Validate order type
    if (!['15_days', '30_days', 'today'].includes(orderType)) {
      return res.status(400).json({
        success: false,
        message: 'Order type must be 15_days or 30_days'
      });
    }

    // Check if parent address exists and belongs to parent
    const parentAddress = await ParentAddress.findOne({ _id: parentAddressId, parentId });
    if (!parentAddress) {
      return res.status(404).json({
        success: false,
        message: 'Parent address not found'
      });
    }

    // Check if school exists
    const school = await SchoolRegistration.findById(schoolRegistrationId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School not found'
      });
    }

    // If schoolRegistrationId is provided, validate it exists
    let schoolRegistration = null;
    if (schoolRegistrationId) {
      schoolRegistration = await SchoolRegistration.findById(schoolRegistrationId);
      if (!schoolRegistration) {
        return res.status(404).json({
          success: false,
          message: 'School registration not found'
        });
      }
    }

    const start = new Date(startDate);

    if (orderType === 'today' && isSunday(start)) {
      return res.status(400).json({
        success: false,
        message: 'Sunday is not a delivery day. Please choose Monday–Saturday.'
      });
    }

    const schedule = buildDeliverySchedule({ startDate: start, orderType });
    if (!schedule.ok) {
      return res.status(400).json({
        success: false,
        message: schedule.error
      });
    }

    // Calculate distance charge (example: ₹5 per km per day)
    const distanceChargePerDay = Math.max(0, (distance - 5) * 5);
    const dailyRate = Number(basePrice) + distanceChargePerDay;
    const totalAmount = Math.round(dailyRate * schedule.totalDeliveryDays * 100) / 100;

    // Prepare order data for storage
    const orderData = {
      parentAddressId,
      schoolId,
      schoolRegistrationId,
      schoolUniqueId,
      orderType,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      deliveryTime,
      noOfBoxes: Number(noOfBoxes) || 1,
      distance,
      basePrice,
      distanceCharge: distanceChargePerDay,
      totalAmount,
      specialInstructions,
      dietaryRestrictions,
      lunchBoxType: lunchBoxType || 'standard'
    };

    const amount = Math.round(totalAmount * 100);

   
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount,
      currency: 'INR',
      receipt: `lunch_${Date.now()}`,
      notes: {
        parentId: parentId,
        orderType: orderType
      }
    });

    // Store order data temporarily with Razorpay order ID
    const PaymentOrder = require('../models/PaymentOrder');
    const paymentOrder = new PaymentOrder({
      parentId,
      razorpayOrderId: razorpayOrder.id,
      orderData,
      amount: totalAmount,
      currency: 'INR',
      status: 'pending'
    });

    await paymentOrder.save();

    res.status(200).json({
      success: true,
      message: 'Payment initiation successful. Complete payment to create order.',
      data: {
        paymentOrderId: paymentOrder._id,
        razorpayOrderId: razorpayOrder.id,
        amount: totalAmount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        orderDetails: {
          ...orderData,
          requestedCalendarDays: schedule.requestedCalendarDays,
          totalDeliveryDays: schedule.totalDeliveryDays,
          sundaysExcluded: schedule.sundaysExcluded
        }
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate order and payment. Please check your input data and try again.',
      error: error.message
    });
  }
};

// Get orders for parent
exports.getParentOrders = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { parentId };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(filter)
      .populate('parentAddressId')
      .populate('schoolId', 'schoolName recognisedNumber branchNumber')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
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
    console.error('Get parent orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your orders. Please try again later.',
      error: error.message
    });
  }
};

// Get order by ID (for parent)
exports.getOrderById = async (req, res) => {
  try {
    const parentId = req.user.id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ _id: orderId, parentId })
      .populate('parentAddressId')
      .populate('schoolId')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
      .populate('parentId', 'name email mobile');

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
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve the order details. Please try again later.',
      error: error.message
    });
  }
};

// Admin: Get all orders with filtering
exports.getAllOrders = async (req, res) => {
  try {
    const { 
      status, 
      pincode, 
      recognisedNumber, 
      branchNumber,
      orderType,
      deliveryDate,
      page = 1, 
      limit = 10 
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (orderType) filter.orderType = orderType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let orders = await Order.find(filter)
      .populate('parentId', 'name email mobile altMobile')
      .populate('parentAddressId')
      .populate('schoolId')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Filter by pincode, recognised number, or branch number if provided
    if (pincode || recognisedNumber || branchNumber) {
      orders = orders.filter(order => {
        const parentAddress = order.parentAddressId;
        const school = order.schoolRegistrationId;
        
        let matches = true;
        
        if (pincode) {
          matches = matches && (
            (parentAddress && parentAddress.pincode === pincode) ||
            (school && school.pincode === pincode)
          );
        }
        
        if (recognisedNumber) {
          matches = matches && school && school.recognisedNumber === recognisedNumber;
        }
        
        if (branchNumber) {
          matches = matches && school && school.branchNumber === branchNumber;
        }
        
        return matches;
      });
    }

    // Filter by delivery date if provided
    if (deliveryDate) {
      const targetDate = new Date(deliveryDate);
      orders = orders.filter(order => {
        return order.dailyDeliveries.some(delivery => {
          const deliveryDate = new Date(delivery.date);
          return deliveryDate.toDateString() === targetDate.toDateString();
        });
      });
    }

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
      message: 'Failed to retrieve orders. Please try again later.',
      error: error.message
    });
  }
};

// Admin: Get order details with all information
exports.getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findById(orderId)
      .populate('parentId', 'name email mobile altMobile')
      .populate('parentAddressId')
      .populate('schoolId')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo altMobile drivingLicenceNumber adharNumber');

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
      message: 'Failed to retrieve order details. Please try again later.',
      error: error.message
    });
  }
};

// Admin: Assign delivery boy to order
exports.assignDeliveryBoy = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { deliveryBoyId } = req.body;

    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: 'Delivery boy ID is required'
      });
    }

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if delivery boy exists
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
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

    const schoolFilter = {};
    if (order.schoolRegistrationId) {
      schoolFilter.schoolRegistrationId = order.schoolRegistrationId;
    }
    if (order.schoolUniqueId) {
      schoolFilter.schoolUniqueId = order.schoolUniqueId;
    }

    const [assignedOrdersCount, unAssignedOrdersCount] = await Promise.all([
      Order.countDocuments({ ...schoolFilter, deliveryBoyId: { $ne: null } }),
      Order.countDocuments({
        ...schoolFilter,
        $or: [
          { deliveryBoyId: null },
          { deliveryBoyId: { $exists: false } }
        ]
      })
    ]);

    res.json({
      success: true,
      message: 'Delivery boy assigned successfully',
      order,
      assignedOrdersCount,
      unAssignedOrdersCount
    });

  } catch (error) {
    console.error('Assign delivery boy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign delivery boy to the order. Please try again later.',
      error: error.message
    });
  }
};

// Delivery boy: Update daily delivery status
exports.updateDailyDelivery = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const deliveryBoyId = req.user.id;
    const { date, status, notes } = req.body;

    if (!date || !status) {
      return res.status(400).json({
        success: false,
        message: 'Date and status are required'
      });
    }

    const validStatuses = ['pending', 'picked_up', 'delivered', 'cancelled', 'skipped'];
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

    // Check if delivery boy is assigned to this order
    if (order.deliveryBoyId.toString() !== deliveryBoyId) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Find the specific daily delivery
    const targetDate = new Date(date);
    const dailyDelivery = order.dailyDeliveries.find(delivery => {
      const deliveryDate = new Date(delivery.date);
      return deliveryDate.toDateString() === targetDate.toDateString();
    });

    if (!dailyDelivery) {
      return res.status(404).json({
        success: false,
        message: 'Daily delivery not found for this date'
      });
    }

    // Update delivery status
    dailyDelivery.status = status;
    dailyDelivery.notes = notes;
    dailyDelivery.deliveredBy = deliveryBoyId;

    if (status === 'picked_up') {
      dailyDelivery.pickupTime = new Date();
    } else if (status === 'delivered') {
      dailyDelivery.deliveryTime = new Date();
    }

    // Add tracking entry
    order.trackingHistory.push({
      action: `daily_delivery_${status}`,
      timestamp: new Date(),
      performedBy: deliveryBoyId,
      notes: `Daily delivery for ${date}: ${status}${notes ? ` - ${notes}` : ''}`
    });

    await order.save();

    // When last delivery is marked 'delivered', mark order completed
    const allDelivered = order.dailyDeliveries.length > 0 &&
      order.dailyDeliveries.every(d => d.status === 'delivered');

    let orderCompleted = false;
    if (allDelivered && status === 'delivered') {
      order.status = 'completed';
      order.trackingHistory.push({
        action: 'order_completed',
        timestamp: new Date(),
        performedBy: deliveryBoyId,
        notes: 'All deliveries completed. Order marked completed.'
      });
      await order.save();
      orderCompleted = true;
    }

    const response = {
      success: true,
      message: 'Daily delivery status updated successfully',
      dailyDelivery
    };
    if (orderCompleted) {
      response.orderCompleted = true;
      response.payForSchool = order.payForSchool;
    }
    res.json(response);

  } catch (error) {
    console.error('Update daily delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update daily delivery status. Please try again later.',
      error: error.message
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
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

    // Update status and add tracking entry
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
      order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status. Please try again later.',
      error: error.message
    });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel order in current status'
      });
    }

    order.status = 'cancelled';
    order.trackingHistory.push({
      action: 'order_cancelled',
      timestamp: new Date(),
      performedBy: req.user.id,
      notes: reason || 'Order cancelled'
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel the order. Please try again later.',
      error: error.message
    });
  }
};

// Get today's deliveries for delivery boy
exports.getTodayDeliveries = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      deliveryBoyId,
      status: 'active',
      'dailyDeliveries.date': {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('parentId', 'name mobile')
    .populate('parentAddressId')
    .populate('schoolId', 'schoolName')
    .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
    .populate('dailyDeliveries.deliveredBy', 'name');

    const todayDeliveries = orders.map(order => {
      const todayDelivery = order.dailyDeliveries.find(delivery => {
        const deliveryDate = new Date(delivery.date);
        return deliveryDate.toDateString() === today.toDateString();
      });

      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        parent: order.parentId,
        parentAddress: order.parentAddressId,
        school: order.schoolId,
        deliveryTime: order.deliveryTime,
        todayDelivery
      };
    });

    res.json({
      success: true,
      todayDeliveries
    });

  } catch (error) {
    console.error('Get today deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve today\'s deliveries. Please try again later.',
      error: error.message
    });
  }
};

// Get orders by school (schoolUniqueId or schoolRegistrationId) with assigned/unassigned filter
exports.getOrdersBySchool = async (req, res) => {
  try {
    const { schoolUniqueId, schoolRegistrationId, registrationId, page = 1, limit = 10, status, assigned } = req.query;
console.log(schoolUniqueId,registrationId);

    const { resolvedUniqueId, resolvedRegistrationId } = await resolveSchoolIdentifiers(req, {
      schoolUniqueId,
      schoolRegistrationId,
      registrationId
    });

    if (!resolvedUniqueId && !resolvedRegistrationId) {
      return res.status(400).json({
        success: false,
        message: 'Either schoolUniqueId or schoolRegistrationId is required'
      });
    }

    const baseFilter = {};
    if (resolvedUniqueId) baseFilter.schoolUniqueId = resolvedUniqueId;
    if (resolvedRegistrationId) {
      const registrationObjectId = toObjectId(resolvedRegistrationId);
      if (!registrationObjectId) {
        return res.status(400).json({ success: false, message: 'Invalid schoolRegistrationId' });
      }
      baseFilter.schoolRegistrationId = registrationObjectId;
    }
    if (status) baseFilter.status = status;

    const queryFilter = { ...baseFilter };

    if (typeof assigned !== 'undefined') {
      const assignedBool = String(assigned).toLowerCase() === 'true';
      if (assignedBool) {
        queryFilter.deliveryBoyId = { $ne: null };
      } else {
        queryFilter.$or = [
          { deliveryBoyId: null },
          { deliveryBoyId: { $exists: false } }
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total, summary] = await Promise.all([
      Order.find(queryFilter)
        .populate('parentId', 'name email mobile altMobile')
        .populate('parentAddressId')
        .populate('schoolId')
        .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
        .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(queryFilter),
      getAssignmentSummary(baseFilter)
    ]);
// console.log(orders,'orders');

    res.json({
      success: true,
      orders: enrichOrders(orders),
      assignedOrdersCount: summary.assignedOrdersCount,
      unAssignedOrdersCount: summary.unAssignedOrdersCount,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalOrders: total,
        hasNextPage: skip + orders.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get orders by school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders for the school. Please try again later.',
      error: error.message
    });
  }
};

exports.getSchoolOrderCounts = async (req, res) => {
  try {
    const { schoolUniqueId, schoolRegistrationId, registrationId, status } = req.query;

    const { resolvedUniqueId, resolvedRegistrationId } = await resolveSchoolIdentifiers(req, {
      schoolUniqueId,
      schoolRegistrationId,
      registrationId
    });

    if (!resolvedUniqueId && !resolvedRegistrationId) {
      return res.status(400).json({
        success: false,
        message: 'Either schoolUniqueId or schoolRegistrationId is required'
      });
    }

    const baseFilter = {};
    if (resolvedUniqueId) baseFilter.schoolUniqueId = resolvedUniqueId;
    if (resolvedRegistrationId) {
      const registrationObjectId = toObjectId(resolvedRegistrationId);
      if (!registrationObjectId) {
        return res.status(400).json({ success: false, message: 'Invalid schoolRegistrationId' });
      }
      baseFilter.schoolRegistrationId = registrationObjectId;
    }
    if (status) baseFilter.status = status;

    const summary = await getAssignmentSummary(baseFilter);

    res.json({
      success: true,
      assignedOrdersCount: summary.assignedOrdersCount,
      unAssignedOrdersCount: summary.unAssignedOrdersCount,
      totalOrders: summary.totalOrders
    });

  } catch (error) {
    console.error('Get school order counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve order counts. Please try again later.',
      error: error.message
    });
  }
};

// Get school orders list with date filter and order type (active/completed) with pagination
exports.getSchoolOrdersList = async (req, res) => {
  try {
    const { date, type = 'active', page = 1, limit = 10 } = req.query;

    // Validate required fields
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      });
    }

    if (!['active', 'completed'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "active" or "completed"'
      });
    }

    // Parse and normalize the date
    const selectedDate = new Date(date);
    if (isNaN(selectedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    selectedDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(selectedDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get school information from authenticated user
    const schoolRegistration = await SchoolRegistration.findById(req.user.id);
    if (!schoolRegistration) {
      return res.status(404).json({
        success: false,
        message: 'School registration not found'
      });
    }

    const schoolUniqueId = schoolRegistration.schoolUniqueId;
    const schoolRegistrationId = schoolRegistration._id;

    // Helper function to check if all deliveries up to selected date are delivered
    const areAllDeliveriesCompleted = (order, upToDate) => {
      // Get all deliveries from start date up to and including the selected date
      const deliveriesUpToDate = order.dailyDeliveries.filter(delivery => {
        const deliveryDate = new Date(delivery.date);
        deliveryDate.setHours(0, 0, 0, 0);
        return deliveryDate <= upToDate;
      });

      // If no deliveries up to this date, return false
      if (deliveriesUpToDate.length === 0) return false;

      // Check if ALL deliveries up to this date are delivered
      return deliveriesUpToDate.every(delivery => delivery.status === 'delivered');
    };

    // Helper function to check if order has a delivery ON the exact selected date
    const hasDeliveryOnDate = (order, targetDate) => {
      return order.dailyDeliveries.some(delivery => {
        const deliveryDate = new Date(delivery.date);
        deliveryDate.setHours(0, 0, 0, 0);
        return deliveryDate.getTime() === targetDate.getTime();
      });
    };

    // Helper function to get delivery on a specific date
    const getDeliveryOnDate = (order, targetDate) => {
      return order.dailyDeliveries.find(delivery => {
        const deliveryDate = new Date(delivery.date);
        deliveryDate.setHours(0, 0, 0, 0);
        return deliveryDate.getTime() === targetDate.getTime();
      });
    };

    // Base filter for school - fetch orders that have a delivery on the selected date
    const baseFilter = {
      $or: [
        { schoolUniqueId: schoolUniqueId },
        { schoolRegistrationId: toObjectId(schoolRegistrationId) }
      ],
      // Filter orders that have a delivery on the exact selected date
      'dailyDeliveries.date': {
        $gte: selectedDate,
        $lt: nextDay
      }
    };

    // Fetch orders for this school that have deliveries on the selected date
    let allOrders = await Order.find(baseFilter)
      .populate('parentId', 'name email mobile altMobile')
      .populate('parentAddressId')
      .populate('schoolId', 'schoolName recognisedNumber branchNumber')
      .populate('schoolRegistrationId', 'schoolName schoolUniqueId contactName mobile email address')
      .populate('deliveryBoyId', 'name mobile vehicleType vehicleNo')
      .sort({ createdAt: -1 });

    // Filter orders based on completion status - MUST have delivery ON the selected date
    let filteredOrders = allOrders.filter(order => {
      // Must have a delivery ON the exact selected date (not before or after)
      if (!hasDeliveryOnDate(order, selectedDate)) {
        return false;
      }

      // Get the delivery on the selected date
      const deliveryOnDate = getDeliveryOnDate(order, selectedDate);

      if (type === 'active') {
        // Active: order status is active AND not all deliveries up to selected date are completed
        // Exclude if the delivery on selected date is cancelled (but include if it's pending/picked_up/skipped/delivered as long as order is still active and not fully completed)
        if (order.status !== 'active') {
          return false;
        }
        
        // Exclude if delivery on selected date is cancelled
        if (deliveryOnDate && deliveryOnDate.status === 'cancelled') {
          return false;
        }
        
        // Exclude if all deliveries up to selected date are completed
        if (areAllDeliveriesCompleted(order, selectedDate)) {
          return false;
        }
        
        // Order is active and has delivery on this date (not cancelled and not fully completed)
        return true;
      } else if (type === 'completed') {
        // Completed: ALL deliveries from start date up to selected date are delivered
        return areAllDeliveriesCompleted(order, selectedDate);
      }

      return false;
    });

    // Apply pagination to filtered results
    const total = filteredOrders.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedOrders = filteredOrders.slice(skip, skip + parseInt(limit));

    // Format orders to include delivery info for the selected date
    const formattedOrders = paginatedOrders.map(order => {
      // Get delivery on the exact selected date (it must exist since we filtered for it)
      const deliveryOnSelectedDate = getDeliveryOnDate(order, selectedDate);

      // Get all deliveries up to and including the selected date for progress calculation
      const deliveriesUpToDate = order.dailyDeliveries.filter(delivery => {
        const deliveryDate = new Date(delivery.date);
        deliveryDate.setHours(0, 0, 0, 0);
        return deliveryDate <= selectedDate;
      });

      // Count delivered vs total deliveries up to selected date
      const totalDeliveriesUpToDate = deliveriesUpToDate.length;
      const deliveredCount = deliveriesUpToDate.filter(d => d.status === 'delivered').length;

      return enrichOrder({
        ...order.toObject(),
        deliveryOnSelectedDate: deliveryOnSelectedDate || null,
        deliveryProgress: {
          delivered: deliveredCount,
          total: totalDeliveriesUpToDate,
          isFullyCompleted: areAllDeliveriesCompleted(order, selectedDate)
        }
      });
    });

    // Calculate counts for summary using already fetched orders
    let activeCount = 0;
    let completedCount = 0;

    allOrders.forEach(order => {
      // Must have a delivery ON the exact selected date
      if (!hasDeliveryOnDate(order, selectedDate)) {
        return;
      }

      // Get the delivery on the selected date
      const deliveryOnDate = getDeliveryOnDate(order, selectedDate);

      // Count active orders (order status is active, delivery exists, not cancelled, and not fully completed)
      if (order.status === 'active') {
        // Exclude if delivery on selected date is cancelled
        if (deliveryOnDate && deliveryOnDate.status === 'cancelled') {
          // Skip this order for active count
        } 
        // Exclude if all deliveries up to selected date are completed
        else if (areAllDeliveriesCompleted(order, selectedDate)) {
          // Skip this order for active count (it will be counted as completed)
        } else {
          activeCount++;
        }
      }

      // Count completed orders (ALL deliveries from start date up to selected date are delivered)
      if (areAllDeliveriesCompleted(order, selectedDate)) {
        completedCount++;
      }
    });

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        summary: {
          activeOrders: activeCount,
          completedOrders: completedCount,
          totalOrders: activeCount + completedCount
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalOrders: total,
          hasNextPage: skip + formattedOrders.length < total,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get school orders list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve school orders list. Please try again later.',
      error: error.message
    });
  }
}; 