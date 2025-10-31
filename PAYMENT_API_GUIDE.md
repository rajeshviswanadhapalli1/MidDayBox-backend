# Payment API Integration Guide

## Overview
This guide documents the Razorpay payment integration for the delivery app. All payment endpoints require user authentication.

---

## Setup

### Prerequisites
1. Razorpay account with test/live keys
2. Node.js and npm installed
3. Environment variables configured

### Installation
```bash
npm install razorpay
```

### Environment Configuration
Add the following to your `.env` file:
```
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

---

## API Endpoints

### 1. Create Order (Initiate Payment)
**Endpoint:** `POST /orders/parent/create`

**Authentication:** Required (Parent)

**Request Body:**
```json
{
  "parentAddressId": "507f1f77bcf86cd799439050",
  "schoolUniqueId": "SCHOOL_001",
  "schoolRegistrationId": "507f1f77bcf86cd799439051",
  "orderType": "30_days",
  "startDate": "2025-10-28T00:00:00Z",
  "deliveryTime": "08:00",
  "basePrice": 500,
  "noOfBoxes": 1,
  "distance": 10,
  "specialInstructions": "No onions",
  "dietaryRestrictions": "Vegetarian",
  "lunchBoxType": "premium"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment initiation successful. Complete payment to create order.",
  "data": {
    "paymentOrderId": "507f1f77bcf86cd799439060",
    "razorpayOrderId": "order_DBJOWzybf0sJbb",
    "amount": 500,
    "currency": "INR",
    "keyId": "rzp_test_RYBG8hqXPrpBsK",
    "orderDetails": {
      "parentAddressId": "507f1f77bcf86cd799439050",
      "schoolRegistrationId": "507f1f77bcf86cd799439051",
      "orderType": "30_days",
      "startDate": "2025-10-28T00:00:00Z",
      "deliveryTime": "08:00",
      "basePrice": 500,
      "noOfBoxes": 1,
      "distance": 10
    }
  }
}
```

**Note:** The order is NOT created yet. After successful payment verification, the order will be created.

---

### 2. Verify Payment (Create Order)
**Endpoint:** `POST /orders/parent/payment/verify`

**Authentication:** Required (Parent)

**Request Body:**
```json
{
  "razorpayOrderId": "order_DBJOWzybf0sJbb",
  "razorpayPaymentId": "pay_EAkbvyVw4mxZrb",
  "razorpaySignature": "signature_from_razorpay"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "transactionId": "507f1f77bcf86cd799439012",
    "orderId": "507f1f77bcf86cd799439011",
    "orderNumber": "LUNCH2025102700001",
    "amount": 500,
    "status": "completed"
  }
}
```

---

### 3. Get Transaction History
**Endpoint:** `GET /orders/parent/transactions`

**Authentication:** Required (Parent)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by status (pending, completed, failed, refunded)
- `orderId` (optional): Filter by specific order ID

**Example:**
```
GET /orders/parent/transactions?page=1&limit=10&status=completed
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "orderId": {
        "_id": "507f1f77bcf86cd799439011",
        "orderNumber": "LUNCH2025102700001",
        "totalAmount": 500,
        "orderType": "30_days",
        "startDate": "2025-10-28T00:00:00.000Z",
        "endDate": "2025-11-27T00:00:00.000Z"
      },
      "amount": 500,
      "currency": "INR",
      "status": "completed",
      "razorpayPaymentId": "pay_EAkbvyVw4mxZrb",
      "completedAt": "2025-10-27T06:00:00.000Z",
      "createdAt": "2025-10-27T05:55:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalTransactions": 50,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### 4. Get Transaction Details
**Endpoint:** `GET /orders/parent/transactions/:transactionId`

**Authentication:** Required (Parent)

**Parameters:**
- `transactionId`: ID of the transaction

**Response:**
```json
{
  "success": true,
  "transaction": {
    "_id": "507f1f77bcf86cd799439012",
    "orderId": {
      "_id": "507f1f77bcf86cd799439011",
      "orderNumber": "LUNCH2025102700001",
      "totalAmount": 500,
      "orderType": "30_days",
      "startDate": "2025-10-28T00:00:00.000Z",
      "endDate": "2025-11-27T00:00:00.000Z"
    },
    "parentId": "507f1f77bcf86cd799439010",
    "amount": 500,
    "currency": "INR",
    "razorpayOrderId": "order_DBJOWzybf0sJbb",
    "razorpayPaymentId": "pay_EAkbvyVw4mxZrb",
    "razorpaySignature": "signature_hash",
    "status": "completed",
    "paymentMethod": "card",
    "description": "Payment for lunch box order LUNCH2025102700001",
    "completedAt": "2025-10-27T06:00:00.000Z",
    "createdAt": "2025-10-27T05:55:00.000Z",
    "updatedAt": "2025-10-27T06:00:00.000Z"
  }
}
```

---

### 5. Refund Payment
**Endpoint:** `POST /orders/parent/transactions/:transactionId/refund`

**Authentication:** Required (Parent)

**Parameters:**
- `transactionId`: ID of the transaction to refund

**Request Body:**
```json
{
  "amount": 500
}
```

**Note:** If `amount` is not provided, the full transaction amount will be refunded.

**Response:**
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refundId": "rfnd_DBJOWzybf0sJbb",
    "amount": 500,
    "status": "refunded"
  }
}
```

---

## Integration Flow

### Step-by-Step Payment Process

1. **Create Order**
   - User creates a lunch box order via `/orders/parent/create`
   - Order is created with `paymentStatus: 'pending'`

2. **Initialize Payment**
   - Frontend calls `/orders/parent/payment/create` with orderId
   - Backend creates Razorpay order and Transaction record
   - Return Razorpay Order ID and Key ID to frontend

3. **Frontend Payment**
   - Frontend uses Razorpay Checkout with returned data
   - User completes payment on Razorpay
   - Razorpay returns `razorpayOrderId`, `razorpayPaymentId`, and `razorpaySignature`

4. **Verify Payment**
   - Frontend calls `/orders/parent/payment/verify` with payment details
   - Backend verifies signature and updates order status
   - Transaction status changes to 'completed'
   - Order `paymentStatus` changes to 'paid'

5. **View History**
   - User can view transaction history via `/orders/parent/transactions`
   - Filter by status or specific orders as needed

---

## Error Handling

### Common Error Responses

**Invalid Order ID:**
```json
{
  "success": false,
  "message": "Order not found"
}
```

**Invalid Payment Signature:**
```json
{
  "success": false,
  "message": "Invalid payment signature"
}
```

**Already Paid Order:**
```json
{
  "success": false,
  "message": "Order is already paid"
}
```

**Invalid Refund Request:**
```json
{
  "success": false,
  "message": "Only completed transactions can be refunded"
}
```

---

## Transaction Schema

```javascript
{
  _id: ObjectId,
  orderId: ObjectId (ref: 'Order'),
  parentId: ObjectId (ref: 'Parent'),
  amount: Number,
  currency: String (default: 'INR'),
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  status: String (enum: ['pending', 'completed', 'failed', 'refunded']),
  paymentMethod: String,
  description: String,
  failureReason: String,
  completedAt: Date,
  refundId: String,
  refundAmount: Number,
  refundedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Frontend Implementation Example

### Razorpay Checkout Integration

```javascript
const handlePayment = async (orderId) => {
  try {
    // Step 1: Create payment order
    const createResponse = await fetch('/orders/parent/payment/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ orderId })
    });

    const createData = await createResponse.json();
    const { razorpayOrderId, keyId, amount } = createData.data;

    // Step 2: Open Razorpay Checkout
    const options = {
      key: keyId,
      amount: amount * 100,
      currency: 'INR',
      order_id: razorpayOrderId,
      handler: async (response) => {
        // Step 3: Verify payment
        const verifyResponse = await fetch('/orders/parent/payment/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature
          })
        });

        const verifyData = await verifyResponse.json();
        if (verifyData.success) {
          alert('Payment successful!');
          // Redirect to order details or home
        }
      },
      prefill: {
        email: userEmail,
        contact: userPhone
      },
      theme: {
        color: '#3399cc'
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (error) {
    console.error('Payment error:', error);
  }
};
```

---

## Testing

### Test Cards (Razorpay)

**Successful Payment:**
- Card Number: 4111111111111111
- Expiry: Any future date
- CVV: Any 3 digits

**Failed Payment:**
- Card Number: 4000000000000002
- Expiry: Any future date
- CVV: Any 3 digits

---

## Security Notes

⚠️ **Important:**
1. Keep your `RAZORPAY_KEY_SECRET` safe and never expose it
2. Always verify payment signatures on the backend
3. Never trust payment status from frontend alone
4. Regenerate keys if they are exposed
5. Use HTTPS in production
6. Store sensitive data securely

---

## Support

For more information:
- Razorpay Documentation: https://razorpay.com/docs/
- API Reference: https://razorpay.com/docs/api/orders/
