const mongoose = require('mongoose');
const axios = require('axios');

// Helper function to get coordinates from address using OpenStreetMap Nominatim
const getCoordinates = async (areaName, pincode, cityName) => {
  try {
    // Try multiple query formats for better geocoding success
    const queries = [
      `${areaName}, ${pincode}, ${cityName}, India`,
      `${pincode}, ${cityName}, India`,
      `${areaName}, ${cityName}, India`,
      `${pincode}, India`
    ];

    for (const query of queries) {
      console.log('Trying geocoding query:', query);
      
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
        const result = response.data[0];
        console.log('Geocoding successful for query:', query, 'Result:', result);
        return {
          lat: parseFloat(result.lat),
          lon: parseFloat(result.lon)
        };
      }
    }

    console.log('No coordinates found for any query format');
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// Helper function to calculate distance between two coordinates using Haversine formula
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance; // Round to 1 decimal place
};

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: false, // Changed from true to false, will be set by pre-save middleware
    unique: true
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: true
  },
  parentAddressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentAddress',
    required: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: false
  },
  schoolRegistrationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolRegistration',
    required: true
  },
  schoolUniqueId: {
    type: String,
    required: true
  },
  deliveryBoyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryBoy',
    required: false
  },
  // Order Details
  orderType: {
    type: String,
    enum: ['15_days', '30_days'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  deliveryTime: {
    type: String,
    required: true // Format: "HH:MM"
  },
  noOfBoxes: {
    type: Number,
    required: false,
    min: 1,
    default: 1
  },
  // Distance and Pricing
  distance: {
    type: Number, // Distance in kilometers
    required: true
  },
  basePrice: {
    type: Number,
    required: true // Price per day
  },
  distanceCharge: {
    type: Number,
    default: 0 // Additional charge based on distance
  },
  totalAmount: {
    type: Number,
    required: true
  },
  // Daily Delivery Tracking
  dailyDeliveries: [{
    date: { type: Date, required: true },
    status: { 
      type: String, 
      enum: ['pending', 'picked_up', 'delivered', 'cancelled', 'skipped'],
      default: 'pending'
    },
    pickupTime: { type: Date, required: false },
    deliveryTime: { type: Date, required: false },
    notes: { type: String, required: false },
    deliveredBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'DeliveryBoy',
      required: false 
    }
  }],
  // Overall Order Status
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'cancelled'],
    default: 'active'
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    required: false
  },
  // Tracking
  trackingHistory: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    performedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'DeliveryBoy',
      required: false 
    },
    notes: { type: String, required: false }
  }]
}, {
  timestamps: true
});

// Generate order number
orderSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.orderNumber) {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      // Get count of orders for today
      const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const todayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      
      const orderCount = await this.constructor.countDocuments({
        createdAt: { $gte: todayStart, $lt: todayEnd }
      });
      
      const sequence = String(orderCount + 1).padStart(4, '0');
      this.orderNumber = `LUNCH${year}${month}${day}${sequence}`;
      
      console.log('Generated order number:', this.orderNumber);
    }
    next();
  } catch (error) {
    console.error('Error generating order number:', error);
    next(error);
  }
});

// Method to calculate distance between two addresses
orderSchema.methods.calculateDistance = async function(parentAddress, school) {
  const parentCoords = await getCoordinates(parentAddress.areaName, parentAddress.pincode, parentAddress.cityName);
  const schoolCoords = await getCoordinates(school.areaName, school.pincode, school.cityName);

  if (!parentCoords || !schoolCoords) {
    console.error('Could not geocode addresses for distance calculation.');
    return 0; // Or throw an error, depending on desired behavior
  }

  return calculateHaversineDistance(parentCoords.lat, parentCoords.lon, schoolCoords.lat, schoolCoords.lon);
};

// Method to calculate total amount
orderSchema.methods.calculateTotalAmount = function() {
  const workingDays = this.dailyDeliveries.length;
  const dailyTotal = this.basePrice + this.distanceCharge;
  this.totalAmount = dailyTotal * workingDays;
  return this.totalAmount;
};

// Method to generate daily deliveries
orderSchema.methods.generateDailyDeliveries = function() {
  const deliveries = [];
  const today = new Date();
  today.setHours(0,0,0,0); // normalize time

  let currentDate;

  const startDate = new Date(this.startDate);
  const endDate = new Date(this.endDate);

  // If startDate is in the current month, start from tomorrow
  if (startDate.getMonth() === today.getMonth() && startDate.getFullYear() === today.getFullYear()) {
    currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() + 1); // start from tomorrow
  } else {
    // If startDate is in a future month, start from 1st day of that month
    currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  }

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // Sunday = 0
    if (dayOfWeek !== 0) { // skip only Sundays
      deliveries.push({
        date: new Date(currentDate),
        status: 'pending'
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  this.dailyDeliveries = deliveries;
  return deliveries;
};



// Indexes for efficient querying
orderSchema.index({ parentId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ 'schoolId': 1, 'parentAddressId': 1 });
orderSchema.index({ 'dailyDeliveries.date': 1, 'dailyDeliveries.status': 1 });
orderSchema.index({ deliveryBoyId: 1, 'dailyDeliveries.status': 1 });

module.exports = mongoose.model('Order', orderSchema); 