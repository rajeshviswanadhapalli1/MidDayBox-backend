# Admin Transaction APIs

## GET /api/admin/transactions – All Transactions

**Endpoint:** `GET /api/admin/transactions`

**Auth:** Admin (Bearer token)

### Payload (Query Parameters)

| Param           | Type   | Required | Description                                           |
|-----------------|--------|----------|-------------------------------------------------------|
| page            | number | No       | Page number, default: 1                               |
| limit           | number | No       | Items per page, default: 10                           |
| status          | string | No       | `pending`, `completed`, `failed`, `refunded`          |
| parentId        | string | No       | Filter by parent ID                                   |
| orderId         | string | No       | Filter by order ID                                    |
| transactionType | string | No       | `parent` = parent payments, `school` = school payments |

### Response

```json
{
  "success": true,
  "transactions": [
    {
      "_id": "transaction_id",
      "orderId": {
        "_id": "order_id",
        "orderNumber": "LUNCH20250129001",
        "totalAmount": 1500,
        "orderType": "15_days",
        "startDate": "2025-01-01T00:00:00.000Z",
        "endDate": "2025-01-15T00:00:00.000Z"
      },
      "parentId": {
        "_id": "parent_id",
        "name": "Parent Name",
        "email": "parent@email.com",
        "mobile": "9876543210"
      },
      "schoolId": null,
      "orderIds": [],
      "amount": 1500,
      "currency": "INR",
      "paymentType": "parent_payment",
      "status": "completed",
      "paymentMethod": "razorpay",
      "razorpayOrderId": "order_xxx",
      "razorpayPaymentId": "pay_xxx",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "completedAt": "2025-01-28T10:00:00.000Z",
      "transactionType": "parent"
    },
    {
      "_id": "transaction_id_2",
      "orderId": { "orderNumber": "LUNCH20250129002", "totalAmount": 2000, "orderType": "30_days", "startDate": "...", "endDate": "..." },
      "parentId": null,
      "schoolId": {
        "_id": "school_id",
        "schoolName": "ABC School",
        "contactName": "Principal",
        "mobile": "9876543211",
        "email": "school@email.com",
        "schoolUniqueId": "DELI2468"
      },
      "orderIds": [{ "orderNumber": "LUNCH20250129002", "totalAmount": 2000, "orderType": "30_days", "startDate": "...", "endDate": "..." }],
      "amount": 40,
      "currency": "INR",
      "paymentType": "school_payment",
      "status": "completed",
      "paymentMethod": "bank_transfer",
      "bankReference": "NEFT123456789012",
      "description": "School 2% for orders: LUNCH20250129002",
      "createdAt": "2025-01-30T10:00:00.000Z",
      "completedAt": "2025-01-30T10:00:00.000Z",
      "transactionType": "school"
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

**transactionType values in response:**
- `parent` – transaction has `parentId` (parent payment / refund)
- `school` – transaction has `schoolId` (school 2% payment)
- `admin` – neither parent nor school

---

## 1. Parent Transactions (Admin)

**Endpoint:** `GET /api/admin/transactions/parent`

**Auth:** Admin (Bearer token)

**Query params:**
| Param   | Type   | Required | Description        |
|---------|--------|----------|--------------------|
| page    | number | No       | Default 1          |
| limit   | number | No       | Default 10         |
| status  | string | No       | pending, completed, failed, refunded |
| parentId| string | No       | Filter by parent   |
| orderId | string | No       | Filter by order    |

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "txn_id",
      "orderId": { "orderNumber": "...", "totalAmount": 1500, "orderType": "15_days", "startDate": "...", "endDate": "..." },
      "parentId": { "name": "...", "email": "...", "mobile": "..." },
      "amount": 1500,
      "status": "completed",
      "paymentMethod": "razorpay",
      "createdAt": "...",
      "completedAt": "..."
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

## 2. School Transactions (Admin)

**Endpoint:** `GET /api/admin/transactions/school`

**Auth:** Admin (Bearer token)

**Query params:**
| Param   | Type   | Required | Description        |
|---------|--------|----------|--------------------|
| page    | number | No       | Default 1          |
| limit   | number | No       | Default 10         |
| status  | string | No       | pending, completed, failed |
| schoolId| string | No       | Filter by school   |
| orderId | string | No       | Filter by order    |

**Response:** Same format as school's transaction history (includes totalAmount, schoolAmount, orderDetails, startDate, endDate, orderType).

---

# School Payment (2%) - API Documentation

## Overview

Admin manually transfers 2% to schools via UPI or bank (outside the app), then records the payment in the system. Schools can view their transaction history.

---

## 1. Get Pending School Payments (Admin)

**Endpoint:** `GET /api/admin/pending-school-payments`

**Auth:** Admin (Bearer token)

**Query params:**
| Param   | Type   | Required | Description              |
|---------|--------|----------|--------------------------|
| page    | number | No       | Default 1                |
| limit   | number | No       | Default 50               |
| schoolId| string | No       | Filter by school         |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "orderId": "order_id",
      "orderNumber": "LUNCH20250129001",
      "totalAmount": 1500,
      "amountDue": 30,
      "schoolId": "school_reg_id",
      "schoolName": "ABC School",
      "contactName": "Principal Name",
      "mobile": "9876543210",
      "bankDetails": {
        "bankName": "HDFC Bank",
        "ifscCode": "HDFC0001234",
        "accountHolderName": "School Name",
        "accountNumber": "123456789012"
      },
      "upiId": "school@upi",
      "hasBankDetails": true,
      "hasUpi": true,
      "endDate": "2025-01-15T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "total": 45,
    "totalAmountDue": 1350
  }
}
```

---

## 2. Record School Payment (Admin)

**Endpoint:** `POST /api/admin/record-school-payment`

**Auth:** Admin (Bearer token)

**Payload – UPI:**
```json
{
  "orderIds": ["order_id_1", "order_id_2"],
  "schoolId": "school_registration_id",
  "amount": 60,
  "paymentMethod": "UPI",
  "recipientName": "ABC School",
  "recipientUpiId": "school@upi",
  "upiTransactionId": "123456789012345",
  "description": "Optional note"
}
```

**Payload – Bank transfer:**
```json
{
  "orderIds": ["order_id_1"],
  "schoolId": "school_registration_id",
  "amount": 30,
  "paymentMethod": "bank_transfer",
  "bankReference": "NEFT123456789012",
  "description": "Optional note"
}
```

**Payload fields:**
| Field           | Type   | Required | Description                              |
|-----------------|--------|----------|------------------------------------------|
| orderIds        | array  | Yes      | Order IDs for which payment is recorded  |
| schoolId        | string | Yes      | School registration ID                   |
| amount          | number | Yes      | Amount paid (2% total)                   |
| paymentMethod   | string | Yes      | `"UPI"` or `"bank_transfer"`             |
| recipientName   | string | UPI only | Recipient name                           |
| recipientUpiId  | string | UPI only | UPI ID (e.g. school@upi)                 |
| upiTransactionId| string | No       | UPI transaction/ref number               |
| bankReference   | string | Bank only| NEFT/IMPS UTR                            |
| description     | string | No       | Optional note                            |

**Response:**
```json
{
  "success": true,
  "message": "School payment recorded successfully",
  "data": {
    "transactionId": "txn_id",
    "orderIds": ["order_id_1"],
    "amount": 30,
    "paymentMethod": "bank_transfer",
    "schoolId": "school_reg_id"
  }
}
```

---

## 3. School Transaction History (School)

**Endpoint:** `GET /api/schools/transactions`

**Auth:** School (Bearer token)

**Query params:**
| Param       | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| page        | number | No       | Default 1                      |
| limit       | number | No       | Default 10                     |
| status      | string | No       | pending, completed, failed     |
| orderId     | string | No       | Filter by order                |
| paymentType | string | No       | school_payment, parent_payment |

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "transaction_id",
      "orderId": "order_id",
      "orderIds": ["order_id"],
      "orderNumber": "LUNCH20250129001",
      "orderNumbers": ["LUNCH20250129001"],
      "totalAmount": 1500,
      "schoolAmount": 30,
      "schoolSharePercent": 2,
      "paymentType": "school_payment",
      "status": "completed",
      "paymentMethod": "bank_transfer",
      "description": "School 2% for orders: LUNCH20250129001",
      "bankReference": "NEFT123456789012",
      "createdAt": "2025-01-30T10:00:00.000Z",
      "completedAt": "2025-01-30T10:00:00.000Z",
      "orderDetails": [
        {
          "orderId": "order_id",
          "orderNumber": "LUNCH20250129001",
          "totalAmount": 1500,
          "schoolAmount": 30,
          "startDate": "2025-01-01T00:00:00.000Z",
          "endDate": "2025-01-15T00:00:00.000Z",
          "orderType": "15_days"
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "totalTransactions": 15,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

**School transaction fields:**
| Field            | Description                               |
|------------------|-------------------------------------------|
| totalAmount      | Parent-paid amount (order total)          |
| schoolAmount     | 2% paid to school                         |
| schoolSharePercent | 2                                      |
| orderId          | Primary order ID                          |
| orderDetails     | Per-order data with startDate, endDate, orderType |
| startDate        | Order start date (in orderDetails)        |
| endDate          | Order end date (in orderDetails)          |
| orderType        | 15_days, 30_days, today (in orderDetails) |

---

## payForSchool (Order field)

| Value     | Meaning                                       |
|----------|-----------------------------------------------|
| pending  | 2% not yet paid to school                     |
| completed| 2% recorded as paid via record-school-payment |

Updated when admin calls `POST /api/admin/record-school-payment` for that order.
