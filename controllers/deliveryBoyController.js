const DeliveryBoy = require('../models/DeliveryBoy');
const Order = require('../models/Order');
const User = require('../models/User');
const cloudinary = require('cloudinary').v2;

// Update delivery boy status
exports.updateDeliveryBoyStatus = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { status, location, notes } = req.body;

    // Validate status
    const validStatuses = ['available', 'busy', 'offline', 'on_delivery', 'break'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be one of: available, busy, offline, on_delivery, break'
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Check if delivery boy is approved
    if (!deliveryBoy.isActive || deliveryBoy.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your account is not approved. Please contact admin.'
      });
    }

    // Update status
    deliveryBoy.currentStatus = status;
    deliveryBoy.lastStatusUpdate = new Date();
    
    if (location) {
      deliveryBoy.currentLocation = location;
    }
    
    if (notes) {
      deliveryBoy.statusNotes = notes;
    }

    await deliveryBoy.save();

    res.json({
      success: true,
      message: 'Status updated successfully',
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        currentStatus: deliveryBoy.currentStatus,
        currentLocation: deliveryBoy.currentLocation,
        lastStatusUpdate: deliveryBoy.lastStatusUpdate,
        statusNotes: deliveryBoy.statusNotes
      }
    });

  } catch (error) {
    console.error('Update delivery boy status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating status',
      error: error.message
    });
  }
};

// Get delivery boy profile
exports.getDeliveryBoyProfile = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId)
      .select('-password');

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    res.json({
      success: true,
      deliveryBoy: {
        _id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        mobile: deliveryBoy.mobile,
        altMobile: deliveryBoy.altMobile,
        vehicleType: deliveryBoy.vehicleType,
        vehicleNo: deliveryBoy.vehicleNo,
        drivingLicenceNumber: deliveryBoy.drivingLicenceNumber,
        adharNumber: deliveryBoy.adharNumber,
        adharFrontUrl: deliveryBoy.adharFrontUrl,
        adharBackUrl: deliveryBoy.adharBackUrl,
        drivingLicenceFrontUrl: deliveryBoy.drivingLicenceFrontUrl,
        drivingLicenceBackUrl: deliveryBoy.drivingLicenceBackUrl,
        profilePicture: deliveryBoy.profilePicture,
        isActive: deliveryBoy.isActive,
        approvalStatus: deliveryBoy.approvalStatus,
        approvalDate: deliveryBoy.approvalDate,
        approvedBy: deliveryBoy.approvedBy,
        rejectionReason: deliveryBoy.rejectionReason,
        currentStatus: deliveryBoy.currentStatus,
        currentLocation: deliveryBoy.currentLocation,
        lastStatusUpdate: deliveryBoy.lastStatusUpdate,
        statusNotes: deliveryBoy.statusNotes,
        schoolUniqueId: deliveryBoy.schoolUniqueId || null,
        schoolRegistrationId: deliveryBoy.schoolRegistrationId || null,
        createdAt: deliveryBoy.createdAt,
        updatedAt: deliveryBoy.updatedAt
      }
    });

  } catch (error) {
    console.error('Get delivery boy profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile',
      error: error.message
    });
  }
};

// Update delivery boy profile
exports.updateDeliveryBoyProfile = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { name, mobile, altMobile, vehicleNo } = req.body;
    
    // First, fetch the delivery boy to check if they exist
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }
    
    // Handle profile picture upload
    let profilePictureUrl = null;
    if (req.file) {
      // Cloudinary returns the URL in req.file.path
      profilePictureUrl = req.file.path;
      
      // Delete old profile picture from Cloudinary if it exists
      if (deliveryBoy.profilePicture) {
        try {
          // Extract public_id from the old URL
          const oldUrlParts = deliveryBoy.profilePicture.split('/');
          const oldPublicId = oldUrlParts[oldUrlParts.length - 1].split('.')[0];
          
          // Delete from Cloudinary
          await cloudinary.uploader.destroy(oldPublicId);
          console.log('Old profile picture deleted from Cloudinary');
        } catch (error) {
          console.error('Error deleting old profile picture:', error);
          // Continue with the update even if deletion fails
        }
      }
    }

    // Update allowed fields
    if (name) deliveryBoy.name = name;
    if (mobile) {
      // Check if mobile number is already taken by another delivery boy
      const existingDeliveryBoy = await DeliveryBoy.findOne({ 
        mobile: mobile, 
        _id: { $ne: deliveryBoyId } 
      });
      
      if (existingDeliveryBoy) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number is already registered with another delivery boy'
        });
      }
      
      deliveryBoy.mobile = mobile;
    }
    if (altMobile) {
      // Check if alt mobile number is already taken by another delivery boy
      const existingDeliveryBoy = await DeliveryBoy.findOne({ 
        altMobile: altMobile, 
        _id: { $ne: deliveryBoyId } 
      });
      
      if (existingDeliveryBoy) {
        return res.status(400).json({
          success: false,
          message: 'Alternative mobile number is already registered with another delivery boy'
        });
      }
      
      deliveryBoy.altMobile = altMobile;
    }
    if (vehicleNo) deliveryBoy.vehicleNo = vehicleNo;
    if (profilePictureUrl) deliveryBoy.profilePicture = profilePictureUrl;

    await deliveryBoy.save();

    // Update corresponding User record
    try {
      const user = await User.findOne({ deliveryBoyId: deliveryBoyId });
      if (user) {
        // Update user fields that match delivery boy fields
        if (name) user.name = name;
        if (mobile) user.mobile = mobile;
        if (altMobile) user.altMobile = altMobile;
        if (profilePictureUrl) user.profilePicture = profilePictureUrl;
        
        await user.save();
        console.log('User record updated successfully');
      } else {
        console.log('No corresponding User record found for delivery boy');
      }
    } catch (userError) {
      console.error('Error updating User record:', userError);
      // Continue with delivery boy update even if user update fails
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      deliveryBoy: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        mobile: deliveryBoy.mobile,
        altMobile: deliveryBoy.altMobile,
        vehicleType: deliveryBoy.vehicleType,
        vehicleNo: deliveryBoy.vehicleNo,
        profilePicture: deliveryBoy.profilePicture,
        schoolUniqueId: deliveryBoy.schoolUniqueId || null,
        schoolRegistrationId: deliveryBoy.schoolRegistrationId || null
      },
      userUpdated: true
    });

  } catch (error) {
    console.error('Update delivery boy profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
      error: error.message
    });
  }
};

// Get delivery boy dashboard stats
exports.getDeliveryBoyDashboard = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { startDate, endDate } = req.query;

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get assigned orders
    const assignedOrders = await Order.find({
      deliveryBoyId,
      ...dateFilter
    }).populate('parentId', 'name mobile')
      .populate('schoolId', 'schoolName areaName')
      .sort({ createdAt: -1 });

    // Calculate statistics
    const totalOrders = assignedOrders.length;
    const activeOrders = assignedOrders.filter(order => order.status === 'active').length;
    const completedOrders = assignedOrders.filter(order => order.status === 'completed').length;
    
    // Calculate total deliveries today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayDeliveries = assignedOrders.filter(order => {
      return order.dailyDeliveries.some(delivery => {
        const deliveryDate = new Date(delivery.date);
        return deliveryDate >= today && deliveryDate < tomorrow && delivery.status === 'delivered';
      });
    }).length;

    // Get recent deliveries
    const recentDeliveries = [];
    assignedOrders.forEach(order => {
      order.dailyDeliveries.forEach(delivery => {
        if (delivery.status === 'delivered') {
          recentDeliveries.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            parentName: order.parentId?.name || 'N/A',
            schoolName: order.schoolId?.schoolName || 'N/A',
            deliveryDate: delivery.date,
            deliveryTime: delivery.deliveryTime,
            notes: delivery.notes
          });
        }
      });
    });

    // Sort by delivery date (most recent first)
    recentDeliveries.sort((a, b) => new Date(b.deliveryDate) - new Date(a.deliveryDate));

    res.json({
      success: true,
      dashboard: {
        profile: {
          name: deliveryBoy.name,
          currentStatus: deliveryBoy.currentStatus || 'offline',
          currentLocation: deliveryBoy.currentLocation,
          lastStatusUpdate: deliveryBoy.lastStatusUpdate
        },
        stats: {
          totalOrders,
          activeOrders,
          completedOrders,
          todayDeliveries
        },
        recentDeliveries: recentDeliveries.slice(0, 5) // Last 5 deliveries
      }
    });

  } catch (error) {
    console.error('Get delivery boy dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard',
      error: error.message
    });
  }
};

// Get delivery boy earnings
exports.getDeliveryBoyEarnings = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { startDate, endDate } = req.query;

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get completed orders
    const completedOrders = await Order.find({
      deliveryBoyId,
      status: 'completed',
      ...dateFilter
    });

    // Calculate earnings (assuming 10% commission per order)
    const totalEarnings = completedOrders.reduce((total, order) => {
      return total + (order.totalAmount * 0.1); // 10% commission
    }, 0);

    // Group by month for chart data
    const monthlyEarnings = {};
    completedOrders.forEach(order => {
      const month = new Date(order.createdAt).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthlyEarnings[month]) {
        monthlyEarnings[month] = 0;
      }
      monthlyEarnings[month] += order.totalAmount * 0.1;
    });

    res.json({
      success: true,
      earnings: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalOrders: completedOrders.length,
        monthlyBreakdown: monthlyEarnings,
        period: {
          startDate: startDate || 'all',
          endDate: endDate || 'all'
        }
      }
    });

  } catch (error) {
    console.error('Get delivery boy earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching earnings',
      error: error.message
    });
  }
};

// Get delivery boy orders
exports.getDeliveryBoyOrders = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      startDate, 
      endDate,
      orderNumber 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    const filter = { deliveryBoyId };

    if (status) {
      filter.status = status;
    }

    if (orderNumber) {
      filter.orderNumber = { $regex: orderNumber, $options: 'i' };
    }

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get orders with pagination
    const orders = await Order.find(filter)
      .populate('parentId', 'name mobile email')
      .populate('schoolId', 'schoolName areaName cityName pincode latitude longitude')
      .populate('parentAddressId', 'parentName studentName houseNo apartmentName areaName landMark cityName pincode latitude longitude')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(filter);

    // Format orders for response
    const formattedOrders = orders.map(order => {
      // Calculate today's delivery status
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayDelivery = order.dailyDeliveries.find(delivery => {
        const deliveryDate = new Date(delivery.date);
        return deliveryDate >= today && deliveryDate < tomorrow;
      });

      return {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        distance: order.distance,
        specialInstructions: order.specialInstructions,
        dietaryRestrictions: order.dietaryRestrictions,
        lunchBoxType: order.lunchBoxType,
        parent: {
          id: order.parentId?._id,
          name: order.parentId?.name,
          mobile: order.parentId?.mobile,
          email: order.parentId?.email
        },
        school: {
          id: order.schoolId?._id,
          name: order.schoolId?.schoolName,
          area: order.schoolId?.areaName,
          city: order.schoolId?.cityName,
          pincode: order.schoolId?.pincode,
          latitude: order.schoolId?.latitude,
          longitude: order.schoolId?.longitude
        },
        address: {
          id: order.parentAddressId?._id,
          parentName: order.parentAddressId?.parentName,
          studentName: order.parentAddressId?.studentName,
          houseNo: order.parentAddressId?.houseNo,
          apartmentName: order.parentAddressId?.apartmentName,
          areaName: order.parentAddressId?.areaName,
          landMark: order.parentAddressId?.landMark,
          cityName: order.parentAddressId?.cityName,
          pincode: order.parentAddressId?.pincode,
          latitude: order.parentAddressId?.latitude,
          longitude: order.parentAddressId?.longitude
        },
        todayDelivery: todayDelivery ? {
          status: todayDelivery.status,
          deliveryTime: todayDelivery.deliveryTime,
          notes: todayDelivery.notes
        } : null,
        dailyDeliveries: order.dailyDeliveries.map(delivery => ({
          date: delivery.date,
          status: delivery.status,
          deliveryTime: delivery.deliveryTime,
          notes: delivery.notes
        })),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    });
console.log(formattedOrders,'formattedorders');

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        totalOrders,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
        hasNextPage: skip + orders.length < totalOrders,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get delivery boy orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders',
      error: error.message
    });
  }
};

// Get current date deliveries for delivery boy
exports.getCurrentDateDeliveries = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { date } = req.query;

    // Use provided date or default to today
    let targetDate;
    if (date) {
      targetDate = new Date(date);
    } else {
      targetDate = new Date();
    }
    
    // Set to start of day
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get all orders assigned to this delivery boy
    const orders = await Order.find({ deliveryBoyId })
      .populate('parentId', 'name mobile email')
      .populate('schoolId', 'schoolName areaName cityName pincode')
      .populate('parentAddressId', 'parentName studentName houseNo apartmentName areaName landMark cityName pincode')
      .populate('schoolRegistrationId')
      .sort({ createdAt: -1 });
console.log(orders,'orders');
console.log(orders,'orders count');
    // Filter orders that have deliveries for the target date
    const currentDateDeliveries = [];

    orders.forEach(order => {
      const targetDelivery = order.dailyDeliveries.find(delivery => {
        const deliveryDate = new Date(delivery.date);
        return deliveryDate >= targetDate && deliveryDate < nextDay;
      });

      if (targetDelivery) {
        currentDateDeliveries.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          orderStatus: order.status,
          totalAmount: order.totalAmount,
          distance: order.distance,
          specialInstructions: order.specialInstructions,
          dietaryRestrictions: order.dietaryRestrictions,
          lunchBoxType: order.lunchBoxType,
          parent: {
            id: order.parentId?._id,
            name: order.parentId?.name,
            mobile: order.parentId?.mobile,
            email: order.parentId?.email
          },
          pickupAddress: {
            id: order.parentAddressId?._id,
           parentName: order.parentAddressId?.parentName,
          studentName: order.parentAddressId?.studentName,
          houseNo: order.parentAddressId?.houseNo,
          apartmentName: order.parentAddressId?.apartmentName,
          areaName: order.parentAddressId?.areaName,
          landMark: order.parentAddressId?.landMark,
          cityName: order.parentAddressId?.cityName,
          pincode: order.parentAddressId?.pincode,
          latitude: order.parentAddressId?.latitude,
          longitude: order.parentAddressId?.longitude
          },
          deliveryAddress: {
            id: order.schoolRegistrationId?._id,
            name: order.schoolRegistrationId?.schoolName,
            area: order.schoolRegistrationId?.address?.areaName,
            city: order.schoolRegistrationId?.address?.city,
            pincode: order.schoolRegistrationId?.address?.pincode,
            address: `${order.schoolRegistrationId?.schoolName}, ${order.schoolRegistrationId?.address?.areaName}, ${order.schoolRegistrationId?.address?.city} - ${order.schoolRegistrationId?.address?.pincode}`,
            latitude: order.schoolRegistrationId?.address?.latitude,
            longitude: order.schoolRegistrationId?.address?.longitude
          },
          delivery: {
            date: targetDelivery.date,
            status: targetDelivery.status,
            deliveryTime: targetDelivery.deliveryTime,
            notes: targetDelivery.notes
          },
          orderCreatedAt: order.createdAt,
          orderUpdatedAt: order.updatedAt
        });
      }
    });
// console.log(currentDateDeliveries,'currentDateDeliveries');
    // Sort by delivery time
    currentDateDeliveries.sort((a, b) => {
      const timeA = a.delivery.deliveryTime || '23:59';
      const timeB = b.delivery.deliveryTime || '23:59';
      return timeA.localeCompare(timeB);
    });

    // Calculate statistics
    const totalDeliveries = currentDateDeliveries.length;
    const pendingDeliveries = currentDateDeliveries.filter(d => d.delivery.status === 'pending').length;
    const completedDeliveries = currentDateDeliveries.filter(d => d.delivery.status === 'delivered').length;
    const cancelledDeliveries = currentDateDeliveries.filter(d => d.delivery.status === 'cancelled').length;

    // Group by delivery time for better organization
    const deliveriesByTime = {};
    currentDateDeliveries.forEach(delivery => {
      const time = delivery.delivery.deliveryTime || 'No time specified';
      if (!deliveriesByTime[time]) {
        deliveriesByTime[time] = [];
      }
      deliveriesByTime[time].push(delivery);
    });

    res.json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        statistics: {
          totalDeliveries,
          pendingDeliveries,
          completedDeliveries,
          cancelledDeliveries
        },
        deliveries: currentDateDeliveries,
        deliveriesByTime,
        summary: {
          totalOrders: totalDeliveries,
          totalDistance: currentDateDeliveries.reduce((sum, d) => sum + (d.distance || 0), 0),
          totalAmount: currentDateDeliveries.reduce((sum, d) => sum + (d.totalAmount || 0), 0)
        }
      }
    });

  } catch (error) {
    console.error('Get current date deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching current date deliveries',
      error: error.message
    });
  }
};

// Update order status (picked/delivered)
exports.updateOrderStatus = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { orderId } = req.params;
    const { status, date, notes } = req.body;

    // Validate status
    const validStatuses = ['picked_up', 'delivered'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "picked_up" or "delivered"'
      });
    }

    // Find the order assigned to this delivery boy
    const order = await Order.findOne({ 
      _id: orderId, 
      deliveryBoyId 
    }).populate('parentId', 'name mobile email')
      .populate('schoolId', 'schoolName areaName cityName pincode')
      .populate('parentAddressId', 'parentName studentName houseNo apartmentName areaName landMark cityName pincode');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you'
      });
    }

    // Use provided date or default to today
    let targetDate;
    if (date) {
      // Handle different date formats
      let dateString = date;
      
      // If date includes time, extract only the date part
      if (dateString.includes(' ')) {
        dateString = dateString.split(' ')[0];
      }
      
      // If date is in DD-MM-YYYY format, convert to YYYY-MM-DD
      if (dateString.includes('-') && dateString.split('-')[0].length === 2) {
        const parts = dateString.split('-');
        dateString = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      
      targetDate = new Date(dateString);
    } else {
      targetDate = new Date();
    }
    
    // Set to start of day
    targetDate.setHours(0, 0, 0, 0);

    // Check if the target date is within the order's validity period
    const orderStartDate = new Date(order.startDate);
    const orderEndDate = new Date(order.endDate);
    
    orderStartDate.setHours(0, 0, 0, 0);
    orderEndDate.setHours(0, 0, 0, 0);
    
    console.log('Order validity period:', {
      startDate: orderStartDate.toISOString(),
      endDate: orderEndDate.toISOString(),
      targetDate: targetDate.toISOString()
    });
    
    // Check if target date is within order validity period
    if (targetDate < orderStartDate || targetDate > orderEndDate) {
      return res.status(400).json({
        success: false,
        message: `Date ${targetDate.toISOString().split('T')[0]} is outside the order validity period (${orderStartDate.toISOString().split('T')[0]} to ${orderEndDate.toISOString().split('T')[0]})`
      });
    }

    // Find the delivery for the target date
    let deliveryIndex = order.dailyDeliveries.findIndex(delivery => {
      const deliveryDate = new Date(delivery.date);
      deliveryDate.setHours(0, 0, 0, 0);
      console.log(`Comparing: deliveryDate=${deliveryDate.toISOString()} vs targetDate=${targetDate.toISOString()}`);
      return deliveryDate.getTime() === targetDate.getTime();
    });

    console.log('Found delivery index:', deliveryIndex);

    // If delivery doesn't exist for this date, create it
    if (deliveryIndex === -1) {
      console.log('Creating new delivery entry for date:', targetDate.toISOString());
      
      const newDelivery = {
        date: targetDate,
        status: 'pending',
        deliveryTime: order.deliveryTime,
        notes: '',
        deliveredBy: deliveryBoyId
      };
      
      order.dailyDeliveries.push(newDelivery);
      deliveryIndex = order.dailyDeliveries.length - 1;
      
      console.log('New delivery created at index:', deliveryIndex);
    }

    const delivery = order.dailyDeliveries[deliveryIndex];

    // Validate status transition
    if (status === 'delivered' && delivery.status !== 'picked_up') {
      return res.status(400).json({
        success: false,
        message: 'Order must be picked up before it can be delivered'
      });
    }

    if (status === 'picked_up' && delivery.status === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Order is already delivered and cannot be marked as picked up'
      });
    }

    // Update delivery status
    delivery.status = status;
    delivery.updatedAt = new Date();
    
    if (notes) {
      delivery.notes = notes;
    }

    // Update order status if all deliveries are completed
    if (status === 'delivered') {
      const allDeliveriesCompleted = order.dailyDeliveries.every(d => d.status === 'delivered');
      if (allDeliveriesCompleted) {
        order.status = 'completed';
      }
    }

    await order.save();

    // Format response
    const response = {
      success: true,
      message: `Order ${status} successfully`,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        updatedDelivery: {
          date: delivery.date,
          status: delivery.status,
          deliveryTime: delivery.deliveryTime,
          notes: delivery.notes,
          updatedAt: delivery.updatedAt
        },
        parent: {
          id: order.parentId?._id,
          name: order.parentId?.name,
          mobile: order.parentId?.mobile,
          email: order.parentId?.email
        },
        pickupAddress: {
          id: order.parentAddressId?._id,
          parentName: order.parentAddressId?.parentName,
          studentName: order.parentAddressId?.studentName,
          houseNo: order.parentAddressId?.houseNo,
          apartmentName: order.parentAddressId?.apartmentName,
          areaName: order.parentAddressId?.areaName,
          landMark: order.parentAddressId?.landMark,
          cityName: order.parentAddressId?.cityName,
          pincode: order.parentAddressId?.pincode
        },
        deliveryAddress: {
          id: order.schoolId?._id,
          name: order.schoolId?.schoolName,
          area: order.schoolId?.areaName,
          city: order.schoolId?.cityName,
          pincode: order.schoolId?.pincode,
          address: `${order.schoolId?.schoolName}, ${order.schoolId?.areaName}, ${order.schoolId?.cityName} - ${order.schoolId?.pincode}`
        }
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating order status',
      error: error.message
    });
  }
}; 

// Utility function to sync delivery boy with User model
exports.syncDeliveryBoyWithUser = async (deliveryBoyId) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      throw new Error('Delivery boy not found');
    }

    // Check if user already exists
    let user = await User.findOne({ deliveryBoyId: deliveryBoyId });
    
    if (!user) {
      // Create new user record
      user = new User({
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        mobile: deliveryBoy.mobile,
        altMobile: deliveryBoy.altMobile,
        password: deliveryBoy.password, // Note: In production, you might want to handle this differently
        role: 'delivery_boy',
        deliveryBoyId: deliveryBoyId,
        isActive: deliveryBoy.isActive,
        profilePicture: deliveryBoy.profilePicture
      });
    } else {
      // Update existing user record
      user.name = deliveryBoy.name;
      user.email = deliveryBoy.email;
      user.mobile = deliveryBoy.mobile;
      user.altMobile = deliveryBoy.altMobile;
      user.isActive = deliveryBoy.isActive;
      user.profilePicture = deliveryBoy.profilePicture;
    }

    await user.save();
    console.log(`User record synced for delivery boy: ${deliveryBoyId}`);
    return user;
  } catch (error) {
    console.error('Error syncing delivery boy with user:', error);
    throw error;
  }
}; 

// Get last 6 months delivery statistics
exports.getLastSixMonthsDeliveries = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Calculate date range for last 6 months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    startDate.setDate(1); // Start from first day of the month
    startDate.setHours(0, 0, 0, 0);

    // Get all orders assigned to this delivery boy in the last 6 months
    const orders = await Order.find({
      deliveryBoyId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).populate('parentId', 'name mobile')
      .populate('schoolId', 'schoolName areaName');

    // Initialize monthly data structure
    const monthlyData = {};
    
    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = date.toISOString().slice(0, 7); // YYYY-MM format
      const monthName = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short' 
      });
      
      monthlyData[monthKey] = {
        month: monthName,
        year: date.getFullYear(),
        monthNumber: date.getMonth() + 1,
        totalBoxes: 0,
        totalOrders: 0,
        completedDeliveries: 0,
        pendingDeliveries: 0,
        cancelledDeliveries: 0
      };
    }

    // Process each order and its deliveries
    orders.forEach(order => {
      order.dailyDeliveries.forEach(delivery => {
        const deliveryDate = new Date(delivery.date);
        const monthKey = deliveryDate.toISOString().slice(0, 7);
        
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].totalBoxes += 1; // Each delivery is one box
          monthlyData[monthKey].totalOrders += 1; // Count unique orders
          
          switch (delivery.status) {
            case 'delivered':
              monthlyData[monthKey].completedDeliveries += 1;
              break;
            case 'pending':
              monthlyData[monthKey].pendingDeliveries += 1;
              break;
            case 'cancelled':
              monthlyData[monthKey].cancelledDeliveries += 1;
              break;
          }
        }
      });
    });

    // Convert to array format for easier frontend consumption
    const monthlyStats = Object.values(monthlyData).map(month => ({
      month: month.month,
      year: month.year,
      monthNumber: month.monthNumber,
      monthKey: `${month.year}-${month.monthNumber.toString().padStart(2, '0')}`,
      totalBoxes: month.totalBoxes,
      totalOrders: month.totalOrders,
      completedDeliveries: month.completedDeliveries,
      pendingDeliveries: month.pendingDeliveries,
      cancelledDeliveries: month.cancelledDeliveries
    }));

    // Calculate overall statistics
    const totalStats = monthlyStats.reduce((acc, month) => {
      acc.totalBoxes += month.totalBoxes;
      acc.totalOrders += month.totalOrders;
      acc.completedDeliveries += month.completedDeliveries;
      acc.pendingDeliveries += month.pendingDeliveries;
      acc.cancelledDeliveries += month.cancelledDeliveries;
      return acc;
    }, {
      totalBoxes: 0,
      totalOrders: 0,
      completedDeliveries: 0,
      pendingDeliveries: 0,
      cancelledDeliveries: 0
    });

    res.json({
      success: true,
      data: {
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        monthlyStats,
        totalStats,
        deliveryBoy: {
          id: deliveryBoy._id,
          name: deliveryBoy.name,
          currentStatus: deliveryBoy.currentStatus || 'offline'
        }
      }
    });

  } catch (error) {
    console.error('Get last six months deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching monthly delivery statistics',
      error: error.message
    });
  }
};

// Get daily delivery breakdown for a specific month
exports.getMonthlyDailyDeliveries = async (req, res) => {
  try {
    const deliveryBoyId = req.user.id;
    const { year, month } = req.params;

    // Validate parameters
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month parameters are required'
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: 'Delivery boy not found'
      });
    }

    // Create date range for the specified month
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(month), 0); // Last day of the month
    endDate.setHours(23, 59, 59, 999);

    // Get all orders assigned to this delivery boy
    const orders = await Order.find({ deliveryBoyId })
      .populate('parentId', 'name mobile email')
      .populate('schoolId', 'schoolName areaName cityName pincode')
      .populate('parentAddressId', 'parentName studentName houseNo apartmentName areaName landMark cityName pincode')
      .sort({ createdAt: -1 });

    // Initialize daily data structure
    const dailyData = {};

    // Process each order and its deliveries for the specified month
    orders.forEach(order => {
      order.dailyDeliveries.forEach(delivery => {
        const deliveryDate = new Date(delivery.date);
        const dateKey = deliveryDate.toISOString().split('T')[0];
        
        // Check if delivery is in the specified month
        if (deliveryDate >= startDate && deliveryDate <= endDate) {
          // Initialize day data if it doesn't exist
          if (!dailyData[dateKey]) {
            const day = deliveryDate.getDate();
            const dayName = deliveryDate.toLocaleDateString('en-US', { weekday: 'short' });
            
            dailyData[dateKey] = {
              date: dateKey,
              day: day,
              dayName: dayName,
              totalBoxes: 0,
              totalOrders: 0,
              completedDeliveries: 0,
              pendingDeliveries: 0,
              cancelledDeliveries: 0,
              deliveries: []
            };
          }
          
          dailyData[dateKey].totalBoxes += 1;
          dailyData[dateKey].totalOrders += 1;
          
          switch (delivery.status) {
            case 'delivered':
              dailyData[dateKey].completedDeliveries += 1;
              break;
            case 'pending':
              dailyData[dateKey].pendingDeliveries += 1;
              break;
            case 'cancelled':
              dailyData[dateKey].cancelledDeliveries += 1;
              break;
          }

          // Add delivery details
          dailyData[dateKey].deliveries.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            totalAmount: order.totalAmount,
            distance: order.distance,
            specialInstructions: order.specialInstructions,
            dietaryRestrictions: order.dietaryRestrictions,
            lunchBoxType: order.lunchBoxType,
            parent: {
              id: order.parentId?._id,
              name: order.parentId?.name,
              mobile: order.parentId?.mobile,
              email: order.parentId?.email
            },
            pickupAddress: {
              id: order.parentAddressId?._id,
              parentName: order.parentAddressId?.parentName,
              studentName: order.parentAddressId?.studentName,
              houseNo: order.parentAddressId?.houseNo,
              apartmentName: order.parentAddressId?.apartmentName,
              areaName: order.parentAddressId?.areaName,
              landMark: order.parentAddressId?.landMark,
              cityName: order.parentAddressId?.cityName,
              pincode: order.parentAddressId?.pincode
            },
            deliveryAddress: {
              id: order.schoolId?._id,
              name: order.schoolId?.schoolName,
              area: order.schoolId?.areaName,
              city: order.schoolId?.cityName,
              pincode: order.schoolId?.pincode,
              address: `${order.schoolId?.schoolName}, ${order.schoolId?.areaName}, ${order.schoolId?.cityName} - ${order.schoolId?.pincode}`
            },
            delivery: {
              date: delivery.date,
              status: delivery.status,
              deliveryTime: delivery.deliveryTime,
              notes: delivery.notes,
              updatedAt: delivery.updatedAt
            }
          });
        }
      });
    });

    // Convert to array format and sort by date
    const dailyStats = Object.values(dailyData)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate monthly summary
    const monthlySummary = dailyStats.reduce((acc, day) => {
      acc.totalBoxes += day.totalBoxes;
      acc.totalOrders += day.totalOrders;
      acc.completedDeliveries += day.completedDeliveries;
      acc.pendingDeliveries += day.pendingDeliveries;
      acc.cancelledDeliveries += day.cancelledDeliveries;
      return acc;
    }, {
      totalBoxes: 0,
      totalOrders: 0,
      completedDeliveries: 0,
      pendingDeliveries: 0,
      cancelledDeliveries: 0
    });

    const monthName = startDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });

    console.log('Daily Stats:', dailyStats);

    res.json({
      success: true,
      data: {
        month: monthName,
        year: parseInt(year),
        monthNumber: parseInt(month),
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        monthlySummary,
        dailyStats,
        deliveryBoy: {
          id: deliveryBoy._id,
          name: deliveryBoy.name,
          currentStatus: deliveryBoy.currentStatus || 'offline'
        }
      }
    });

  } catch (error) {
    console.error('Get monthly daily deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching daily delivery breakdown',
      error: error.message
    });
  }
}; 