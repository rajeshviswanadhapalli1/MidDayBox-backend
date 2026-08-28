const crypto = require('crypto');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const SchoolRegistration = require('../models/SchoolRegistration');
const Pricing = require('../models/Pricing');
const { default: axios } = require('axios');
const { enrichOrder } = require('../utils/orderSchedule');

async function getSchoolPaymentPercent() {
  const pricing = await Pricing.findOne().sort({ createdAt: -1 });
  const pct = pricing?.schoolPaymentPercent;
  return pct != null && !isNaN(Number(pct)) ? Number(pct) : 2;
}
const SMS_API_URL = process.env.SMS_API_URL || "http://web.smsgw.in/smsapi/httpapi.jsp";
exports.verifyPayment = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details'
      });
    }

    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');
console.log(expectedSignature);
console.log(razorpaySignature);
    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    const PaymentOrder = require('../models/PaymentOrder');
    const paymentOrder = await PaymentOrder.findOne({
      razorpayOrderId,
      parentId,
      status: 'pending'
    });

    if (!paymentOrder) {
      return res.status(404).json({
        success: false,
        message: 'Payment order not found or already processed'
      });
    }

    // Create the actual order now that payment is verified
    const rawOrderData = paymentOrder.orderData?.toObject ? paymentOrder.orderData.toObject() : paymentOrder.orderData || {};

const orderData = {
  parentId: paymentOrder.parentId,
  ...rawOrderData,
  paymentStatus: 'paid',
  paymentMethod: 'razorpay'
};

    const newOrder = new Order(orderData);
    newOrder.generateDailyDeliveries();
    newOrder.calculateTotalAmount();
    await newOrder.save();

    // Add initial tracking entry
    newOrder.trackingHistory.push({
      action: 'order_created',
      timestamp: new Date(),
      notes: 'Lunch box delivery order created successfully after payment'
    });
    await newOrder.save();
    const transaction = new Transaction({
      orderId: newOrder._id,
      parentId,
      amount: paymentOrder.amount,
      currency: 'INR',
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      status: 'completed',
      completedAt: new Date(),
      description: `Payment for lunch box order ${newOrder.orderNumber}`
    });

    await transaction.save();

    // Mark payment order as completed
    paymentOrder.status = 'completed';
    await paymentOrder.save();

    res.json({
      success: true,
      message: 'Payment verified and order created successfully',
      data: {
        transactionId: transaction._id,
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        amount: transaction.amount,
        status: transaction.status,
        order: enrichOrder(newOrder)
      }
    });
    console.log(newOrder?.schoolRegistrationId,'new order school id');
    const school = await SchoolRegistration.findById(newOrder?.schoolRegistrationId);
    const parent = await require('../models/Parent').findById(parentId);
    const mobile = school?.mobile;
    try {
      const message = `MidDayBox Alert: Parent ${parent?.name} placed a ${paymentOrder.amount} order in your school. Check your dashboard. MidDayBox Support`;
      const params = {
            username: process.env.SMS_USER,
            password: process.env.SMS_PASS,
            from: process.env.SMS_SENDER,
            to: mobile,
            text: message,
            coding: 0,
            pe_id: process.env.SMS_PE_ID,
            template_id: '1707176312210053785'
          };
      console.log(params,'sms params');
      
          const queryString = new URLSearchParams(params).toString();
          const response = await axios.get(`${SMS_API_URL}?${queryString}`);
      
          console.log("✅ SMS Sent:", response.data);
          return { success: true, message: "Message Sent Successfully" };
    } catch (error) {
      console.error("❌ Error Sending SMS:", error);
      return { success: false, message: "Failed to Send Message" };
    }

    // Create transaction record
    

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment and create order',
      error: error.message
    });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { page = 1, limit = 10, status, orderId } = req.query;

    const filter = { parentId };
    if (status) filter.status = status;
    if (orderId) filter.orderId = orderId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('orderId', 'orderNumber totalAmount orderType startDate endDate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      success: true,
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalTransactions: total,
        hasNextPage: skip + transactions.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction history',
      error: error.message
    });
  }
};

exports.getTransactionDetails = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { transactionId } = req.params;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      parentId
    }).populate('orderId');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      transaction
    });

  } catch (error) {
    console.error('Get transaction details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transaction details',
      error: error.message
    });
  }
};

function formatSchoolTransaction(t, schoolSharePercent = 2) {
  const base = {
    _id: t._id,
    orderId: t.orderId?._id || t.orderIds?.[0]?._id,
    orderIds: t.orderIds?.map((o) => o?._id).filter(Boolean) || (t.orderId?._id ? [t.orderId._id] : []),
    orderNumber: t.orderId?.orderNumber || t.orderIds?.[0]?.orderNumber,
    orderNumbers: t.orderIds?.map((o) => o?.orderNumber).filter(Boolean) || (t.orderId?.orderNumber ? [t.orderId.orderNumber] : []),
    totalAmount: null,
    schoolAmount: t.amount,
    schoolSharePercent,
    paymentType: t.paymentType,
    status: t.status,
    paymentMethod: t.paymentMethod,
    description: t.description,
    bankReference: t.bankReference,
    upiTransactionId: t.upiTransactionId,
    createdAt: t.createdAt,
    completedAt: t.completedAt
  };

  const orders = (t.orderIds && t.orderIds.length > 0 ? t.orderIds : t.orderId ? [t.orderId] : []);
  const orderDetails = orders.map((o) => ({
    orderId: o?._id,
    orderNumber: o?.orderNumber,
    totalAmount: o?.totalAmount,
    schoolAmount: o?.totalAmount ? Math.round(o.totalAmount * (schoolSharePercent / 100) * 100) / 100 : null,
    startDate: o?.startDate,
    endDate: o?.endDate,
    orderType: o?.orderType
  }));

  const totalParentAmount = orderDetails.reduce((s, o) => s + (o.totalAmount || 0), 0);
  base.totalAmount = totalParentAmount || t.orderId?.totalAmount || t.orderIds?.[0]?.totalAmount;
  base.orderDetails = orderDetails;

  return base;
}

exports.getSchoolTransactionHistory = async (req, res) => {
  try {
    const schoolId = req.user.id;
    const { page = 1, limit = 10, status, orderId, paymentType } = req.query;

    const filter = { schoolId };
    if (status) filter.status = status;
    if (orderId) filter.orderId = orderId;
    if (paymentType) filter.paymentType = paymentType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total, schoolSharePercent] = await Promise.all([
      Transaction.find(filter)
        .populate('orderId', 'orderNumber totalAmount orderType startDate endDate')
        .populate('orderIds', 'orderNumber totalAmount orderType startDate endDate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
      getSchoolPaymentPercent()
    ]);

    const formatted = transactions.map((t) => formatSchoolTransaction(t, schoolSharePercent));

    res.json({
      success: true,
      transactions: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalTransactions: total,
        hasNextPage: skip + transactions.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get school transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve school transaction history',
      error: error.message
    });
  }
};

exports.refundPayment = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { transactionId } = req.params;
    const { amount } = req.body;

    const transaction = await Transaction.findOne({
      _id: transactionId,
      parentId
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed transactions can be refunded'
      });
    }

    const refundAmount = amount || transaction.amount;

    const refund = await razorpay.payments.refund(transaction.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100)
    });

    transaction.refundId = refund.id;
    transaction.refundAmount = refundAmount;
    transaction.refundedAt = new Date();
    transaction.status = 'refunded';
    await transaction.save();

    const order = await Order.findById(transaction.orderId);
    order.paymentStatus = 'failed';
    order.trackingHistory.push({
      action: 'payment_refunded',
      timestamp: new Date(),
      notes: `Refund of ₹${refundAmount} processed. Refund ID: ${refund.id}`
    });
    await order.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refund.id,
        amount: refundAmount,
        status: transaction.status
      }
    });

  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

exports.getAllTransactionsForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, parentId, orderId, transactionType } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (parentId) filter.parentId = parentId;
    if (orderId) filter.orderId = orderId;

    // Filter by transaction type
    if (transactionType === 'school') {
      filter.schoolId = { $exists: true, $ne: null };
    } else if (transactionType === 'parent') {
      filter.parentId = { $exists: true, $ne: null };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('orderId', 'orderNumber totalAmount orderType startDate endDate')
        .populate('parentId', 'name email mobile')
        .populate('schoolId', 'schoolName contactName mobile email schoolUniqueId')
        .populate('orderIds', 'orderNumber totalAmount orderType startDate endDate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter)
    ]);

    // Add transactionType to each transaction for differentiation
    const transactionsWithType = transactions.map(transaction => {
      const transactionObj = transaction.toObject();
      if (transaction.schoolId) {
        transactionObj.transactionType = 'school';
      } else if (transaction.parentId) {
        transactionObj.transactionType = 'parent';
      } else {
        transactionObj.transactionType = 'admin';
      }
      return transactionObj;
    });

    res.json({
      success: true,
      transactions: transactionsWithType,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalTransactions: total,
        hasNextPage: skip + transactions.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all transactions for admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve transactions',
      error: error.message
    });
  }
};

exports.getAdminParentTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, parentId, orderId } = req.query;

    const filter = { parentId: { $exists: true, $ne: null } };
    if (status) filter.status = status;
    if (parentId) filter.parentId = parentId;
    if (orderId) filter.orderId = orderId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .populate('orderId', 'orderNumber totalAmount orderType startDate endDate')
        .populate('parentId', 'name email mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter)
    ]);

    res.json({
      success: true,
      transactions: transactions.map((t) => t.toObject()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalTransactions: total,
        hasNextPage: skip + transactions.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get admin parent transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve parent transactions',
      error: error.message
    });
  }
};

exports.getAdminSchoolTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, schoolId, orderId } = req.query;

    const filter = { schoolId: { $exists: true, $ne: null } };
    if (status) filter.status = status;
    if (schoolId) filter.schoolId = schoolId;
    if (orderId) filter.orderId = orderId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transactions, total, schoolSharePercent] = await Promise.all([
      Transaction.find(filter)
        .populate('orderId', 'orderNumber totalAmount orderType startDate endDate')
        .populate('orderIds', 'orderNumber totalAmount orderType startDate endDate')
        .populate('schoolId', 'schoolName contactName mobile email schoolUniqueId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Transaction.countDocuments(filter),
      getSchoolPaymentPercent()
    ]);

    const formatted = transactions.map((t) => formatSchoolTransaction(t, schoolSharePercent));

    res.json({
      success: true,
      transactions: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalTransactions: total,
        hasNextPage: skip + transactions.length < total,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get admin school transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve school transactions',
      error: error.message
    });
  }
};

exports.createUpiTransfer = async (req, res) => {
  try {
    const {
      amount,
      description,
      recipientName,
      recipientUpiId,
      transactionId,
      bankReference,
      schoolId,
      orderIds
    } = req.body;

    if (!amount || !description || !recipientName || !recipientUpiId) {
      return res.status(400).json({
        success: false,
        message: 'Amount, description, recipient name, and UPI ID are required'
      });
    }

    // Validate that either schoolId or orderIds are provided for proper tracking
    if (!schoolId && (!orderIds || orderIds.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Either schoolId or orderIds must be provided to track the payment purpose'
      });
    }

    const transaction = new Transaction({
      orderId: null, // Manual transfer, no single associated order
      parentId: null, // Admin initiated transfer
      schoolId: schoolId || null,
      orderIds: orderIds || [],
      paymentType: schoolId ? 'school_payment' : 'manual_transfer',
      amount: parseFloat(amount),
      currency: 'INR',
      status: 'completed',
      // payForSchool:'completed',
      paymentMethod: 'UPI',
      description,
      completedAt: new Date(),
      upiRecipientName: recipientName,
      upiRecipientId: recipientUpiId,
      upiTransactionId: transactionId,
      bankReference
    });

    await transaction.save();
if (orderIds && orderIds.length > 0) {
      await Order.updateMany(
        { _id: { $in: orderIds } },
        { $set: { payForSchool: 'completed' } }
      );
    }
    res.json({
      success: true,
      message: 'UPI transfer recorded successfully',
      data: {
        transactionId: transaction._id,
        amount: transaction.amount,
        status: transaction.status,
        description: transaction.description,
        schoolId: transaction.schoolId,
        orderIds: transaction.orderIds,
        paymentType: transaction.paymentType
      }
    });

  } catch (error) {
    console.error('Create UPI transfer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record UPI transfer',
      error: error.message
    });
  }
};

exports.getPendingSchoolPayments = async (req, res) => {
  try {
    const { page = 1, limit = 50, schoolId } = req.query;

    const filter = { status: 'completed', payForSchool: 'pending' };
    if (schoolId) filter.schoolRegistrationId = schoolId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const schoolSharePercent = await getSchoolPaymentPercent();

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('schoolRegistrationId', 'schoolName contactName mobile email bankDetails upiId')
        .populate('parentId', 'name mobile')
        .sort({ endDate: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(filter)
    ]);

    const items = orders.map((order) => {
      const amount = Math.round((order.totalAmount || 0) * (schoolSharePercent / 100) * 100) / 100;
      const school = order.schoolRegistrationId;
      const bd = school?.bankDetails;
      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        amountDue: amount,
        schoolId: school?._id,
        schoolName: school?.schoolName,
        contactName: school?.contactName,
        mobile: school?.mobile,
        bankDetails: bd
          ? {
              bankName: bd.bankName,
              ifscCode: bd.ifscCode,
              accountHolderName: bd.accountHolderName,
              accountNumber: bd.accountNumber
            }
          : null,
        upiId: school?.upiId || null,
        hasBankDetails: !!(bd && bd.accountNumber && bd.ifscCode && bd.accountHolderName),
        hasUpi: !!(school?.upiId),
        endDate: order.endDate
      };
    });

    const totalAmount = items.reduce((s, i) => s + (i.amountDue || 0), 0);

    res.json({
      success: true,
      schoolSharePercent,
      data: items,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        total,
        totalAmountDue: totalAmount
      }
    });
  } catch (error) {
    console.error('Get pending school payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending school payments',
      error: error.message
    });
  }
};

/**
 * Admin records manual school payment (2%) after transferring via UPI or bank outside the app.
 * Creates school_payment transaction and marks order(s) payForSchool = completed.
 */
exports.recordSchoolPayment = async (req, res) => {
  try {
    const {
      orderIds,
      schoolId,
      amount,
      paymentMethod,
      recipientName,
      recipientUpiId,
      upiTransactionId,
      bankReference,
      description
    } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'orderIds (array) is required'
      });
    }
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'schoolId is required'
      });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'amount must be a positive number'
      });
    }

    const method = (paymentMethod || 'bank_transfer').toLowerCase();
    if (!['upi', 'bank_transfer'].includes(method)) {
      return res.status(400).json({
        success: false,
        message: 'paymentMethod must be "UPI" or "bank_transfer"'
      });
    }

    if (method === 'upi') {
      if (!recipientUpiId || !recipientName) {
        return res.status(400).json({
          success: false,
          message: 'recipientUpiId and recipientName are required for UPI'
        });
      }
    } else {
      if (!bankReference || typeof bankReference !== 'string' || !bankReference.trim()) {
        return res.status(400).json({
          success: false,
          message: 'bankReference (NEFT/IMPS UTR) is required for bank transfer'
        });
      }
    }

    const orders = await Order.find({
      _id: { $in: orderIds },
      schoolRegistrationId: schoolId,
      payForSchool: 'pending'
    });

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching pending orders found for this school'
      });
    }

    const schoolSharePercent = await getSchoolPaymentPercent();
    const desc = description || `School ${schoolSharePercent}% for orders: ${orders.map((o) => o.orderNumber).join(', ')}`;

    const txnData = {
      orderId: orderIds[0],
      orderIds,
      schoolId,
      paymentType: 'school_payment',
      amount: parseFloat(amount),
      currency: 'INR',
      status: 'completed',
      completedAt: new Date(),
      paymentMethod: method === 'upi' ? 'UPI' : 'bank_transfer',
      description: desc
    };

    if (method === 'upi') {
      txnData.upiRecipientName = recipientName;
      txnData.upiRecipientId = recipientUpiId;
      txnData.upiTransactionId = upiTransactionId || bankReference || null;
    } else {
      txnData.bankReference = bankReference.trim();
    }

    const transaction = new Transaction(txnData);
    await transaction.save();

    // Update each order with payForSchool completed and school payment details
    const updatePromises = orders.map((order) => {
      const schoolPaymentAmount = Math.round((order.totalAmount || 0) * (schoolSharePercent / 100) * 100) / 100;
      return Order.findByIdAndUpdate(order._id, {
        $set: {
          payForSchool: 'completed',
          schoolPaymentPercent: schoolSharePercent,
          schoolPaymentAmount
        }
      });
    });
    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: 'School payment recorded successfully',
      data: {
        transactionId: transaction._id,
        orderIds,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        schoolId
      }
    });
  } catch (error) {
    console.error('Record school payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record school payment',
      error: error.message
    });
  }
};
