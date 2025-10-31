const crypto = require('crypto');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');

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
// console.log(expectedSignature);
// console.log(razorpaySignature);
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
    await newOrder.save();

    // Add initial tracking entry
    newOrder.trackingHistory.push({
      action: 'order_created',
      timestamp: new Date(),
      notes: 'Lunch box delivery order created successfully after payment'
    });
    await newOrder.save();

    // Create transaction record
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
        order: newOrder
      }
    });

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
