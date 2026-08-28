const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const SchoolRegistration = require('../models/SchoolRegistration');
const axios = require('axios');
const crypto = require('crypto');

const SCHOOL_SHARE_PERCENT = 2;
const MIN_PAYOUT_PAISE = 100;
const RAZORPAY_BASE = 'https://api.razorpay.com/v1';

function getRazorpayAuth() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) return null;
  return Buffer.from(`${key}:${secret}`).toString('base64');
}

async function razorpayXPost(path, data, idempotencyKey) {
  const auth = getRazorpayAuth();
  if (!auth) throw new Error('Razorpay credentials not configured');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Basic ${auth}`
  };
  if (idempotencyKey) headers['X-Payout-Idempotency'] = idempotencyKey;
  const res = await axios.post(`${RAZORPAY_BASE}${path}`, data, { headers });
  return res.data;
}

async function ensureRazorpayXFundAccount(school) {
  if (school.razorpayFundAccountId) return school.razorpayFundAccountId;

  const bd = school.bankDetails;
  if (!bd || !bd.accountHolderName || !bd.ifscCode || !bd.accountNumber) return null;

  let contactId = school.razorpayContactId;
  if (!contactId) {
    const contact = await razorpayXPost('/contacts', {
      name: (school.contactName || bd.accountHolderName || 'School').substring(0, 50),
      email: school.email || `school-${school._id}@placeholder.local`,
      contact: (school.mobile || '0000000000').replace(/\D/g, '').slice(0, 10) || '0000000000',
      type: 'vendor',
      reference_id: `school_${school._id}`
    });
    contactId = contact.id;
    school.razorpayContactId = contactId;
  }

  const fundAccount = await razorpayXPost('/fund_accounts', {
    contact_id: contactId,
    account_type: 'bank_account',
    bank_account: {
      name: bd.accountHolderName,
      ifsc: bd.ifscCode.toUpperCase(),
      account_number: String(bd.accountNumber)
    }
  });
  const fundAccountId = fundAccount.id;
  school.razorpayFundAccountId = fundAccountId;
  await school.save();
  return fundAccountId;
}

async function payoutToSchool(school, amountPaise, orderId, orderNumber) {
  const xAccount = process.env.RAZORPAY_X_ACCOUNT_NUMBER;
  if (!xAccount) throw new Error('RAZORPAY_X_ACCOUNT_NUMBER not set');

  const fundAccountId = await ensureRazorpayXFundAccount(school);
  if (!fundAccountId) throw new Error('Could not create fund account for school');

  const idempotencyKey = crypto.randomUUID();
  const payout = await razorpayXPost(
    '/payouts',
    {
      account_number: xAccount,
      fund_account_id: fundAccountId,
      amount: amountPaise,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      reference_id: `order_${orderId}`.slice(0, 40),
      narration: 'School 2%',
      queue_if_low_balance: true,
      notes: { orderId: String(orderId), orderNumber: orderNumber || '' }
    },
    idempotencyKey
  );
  return payout.id;
}

/**
 * Automatically pay 2% to school when order completes.
 * Uses RazorpayX Payouts with school bank details - no manual step.
 */
async function processSchoolPaymentForOrder(order) {
  if (order.payForSchool === 'completed') return { alreadyDone: true };

  const orderId = order._id;
  const existing = await Transaction.findOne({ orderId, paymentType: 'school_payment' });
  if (existing) {
    if (existing.status === 'completed') {
      await Order.findByIdAndUpdate(orderId, { payForSchool: 'completed' });
      return { alreadyDone: true };
    }
    return { failed: true, error: existing.failureReason || 'Previous attempt failed' };
  }

  const amountInr = Math.round((order.totalAmount || 0) * (SCHOOL_SHARE_PERCENT / 100) * 100) / 100;
  const amountPaise = Math.max(MIN_PAYOUT_PAISE, Math.round(amountInr * 100));

  const school = await SchoolRegistration.findById(order.schoolRegistrationId);
  if (!school) {
    await saveFailedTxn(orderId, order.schoolRegistrationId, amountInr, order.orderNumber, 'School not found');
    return { failed: true, error: 'School not found' };
  }

  const bd = school.bankDetails;
  const hasBankDetails = bd && bd.accountHolderName && bd.ifscCode && bd.accountNumber;

  if (!hasBankDetails) {
    await savePendingTxn(orderId, school._id, amountInr, order.orderNumber);
    return { pending: true, reason: 'no_bank_details' };
  }

  try {
    const payoutId = await payoutToSchool(school, amountPaise, orderId, order.orderNumber);

    const txn = new Transaction({
      orderId,
      schoolId: school._id,
      paymentType: 'school_payment',
      amount: amountInr,
      currency: 'INR',
      status: 'completed',
      completedAt: new Date(),
      paymentMethod: 'razorpay_payout',
      razorpayPayoutId: payoutId,
      description: `School ${SCHOOL_SHARE_PERCENT}% for order ${order.orderNumber}`
    });
    await txn.save();

    order.payForSchool = 'completed';
    order.trackingHistory.push({
      action: 'school_payment_sent',
      timestamp: new Date(),
      performedBy: null,
      notes: `2% (₹${amountInr}) sent to school via RazorpayX. Payout ID: ${payoutId}`
    });
    await order.save();

    return { success: true, amount: amountInr, payoutId };
  } catch (err) {
    const msg = err.response?.data?.error?.description || err.message || 'Payout failed';
    await saveFailedTxn(orderId, school._id, amountInr, order.orderNumber, msg);
    console.error('School payout error:', err);
    return { failed: true, error: msg };
  }
}

async function saveFailedTxn(orderId, schoolId, amountInr, orderNumber, reason) {
  const txn = new Transaction({
    orderId,
    schoolId,
    paymentType: 'school_payment',
    amount: amountInr,
    currency: 'INR',
    status: 'failed',
    paymentMethod: 'razorpay_payout',
    description: `School ${SCHOOL_SHARE_PERCENT}% for order ${orderNumber}`,
    failureReason: reason
  });
  await txn.save();
}

async function savePendingTxn(orderId, schoolId, amountInr, orderNumber) {
  const txn = new Transaction({
    orderId,
    schoolId,
    paymentType: 'school_payment',
    amount: amountInr,
    currency: 'INR',
    status: 'pending',
    paymentMethod: 'bank_transfer',
    description: `School ${SCHOOL_SHARE_PERCENT}% for order ${orderNumber} - add bank details for auto payout`
  });
  await txn.save();
}

module.exports = {
  processSchoolPaymentForOrder,
  recordSchoolPaymentDue: processSchoolPaymentForOrder,
  SCHOOL_SHARE_PERCENT
};
