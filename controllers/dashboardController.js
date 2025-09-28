const Order = require('../models/Order');
const ParentAddress = require('../models/ParentAddress');

// Get parent dashboard data
exports.getParentDashboard = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { month, year } = req.query;

    // Default to current month and year if not provided
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) - 1 : currentDate.getMonth(); // Month is 0-indexed
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    // Calculate date range for the month
    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

    // Get all orders for the parent
    const orders = await Order.find({ parentId })
      .populate('parentAddressId', 'parentName studentName')
      .populate('schoolId', 'schoolName')
      .populate('schoolRegistrationId','schoolName')
      .populate('deliveryBoyId', 'name mobile')
      .sort({ createdAt: -1 });

    // Calculate monthly statistics
    const monthlyStats = await calculateMonthlyStats(parentId, targetYear);

    // Get calendar data for the specified month
    const calendarData = await getCalendarData(parentId, targetYear, targetMonth);

    // Get recent orders (last 5)
    const recentOrders = orders.slice(0, 5).map(order => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      schoolName: order.schoolId?.schoolName || 'N/A',
      status: order.status,
      totalAmount: order.totalAmount,
      startDate: order.startDate,
      endDate: order.endDate,
      createdAt: order.createdAt
    }));

    // Calculate overall statistics
    const totalOrders = orders.length;
    const activeOrders = orders.filter(order => order.status === 'active').length;
    const completedOrders = orders.filter(order => order.status === 'completed').length;
    const pendingOrders = orders.filter(order => order.status === 'active').length;

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalOrders,
          activeOrders,
          completedOrders,
          pendingOrders
        },
        monthlyStats,
        calendarData,
        recentOrders
      }
    });

  } catch (error) {
    console.error('Get parent dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard data',
      error: error.message
    });
  }
};

// Calculate monthly statistics for the year
const calculateMonthlyStats = async (parentId, year) => {
  const monthlyStats = [];
  
  for (let month = 0; month < 12; month++) {
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
    
    // Get orders for this month
    const monthOrders = await Order.find({
      parentId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });

    // Count total deliveries for this month
    let totalDeliveries = 0;
    let completedDeliveries = 0;
    let pendingDeliveries = 0;

    monthOrders.forEach(order => {
      order.dailyDeliveries.forEach(delivery => {
        const deliveryDate = new Date(delivery.date);
        if (deliveryDate.getMonth() === month && deliveryDate.getFullYear() === year) {
          totalDeliveries++;
          if (delivery.status === 'delivered') {
            completedDeliveries++;
          } else if (delivery.status === 'pending') {
            pendingDeliveries++;
          }
        }
      });
    });

    const monthName = new Date(year, month).toLocaleString('default', { month: 'short' });
    
    monthlyStats.push({
      month: monthName,
      year: year,
      monthNumber: month + 1,
      totalDeliveries,
      completedDeliveries,
      pendingDeliveries,
      orderCount: monthOrders.length
    });
  }

  return monthlyStats;
};

// Get calendar data for a specific month
const getCalendarData = async (parentId, year, month) => {
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

  const orders = await Order.find({
    parentId,
    'dailyDeliveries.date': { $gte: startOfMonth, $lte: endOfMonth }
  }).populate('schoolRegistrationId', 'schoolName');

  const daysInMonth = endOfMonth.getDate();
  const calendar = [];
  let currentWeek = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month, day);
    currentDate.setHours(0,0,0,0); // normalize

    const dayOfWeek = currentDate.getDay();
    const isHoliday = dayOfWeek === 0; // only Sunday

    const dayDeliveries = [];

    orders.forEach(order => {
      order.dailyDeliveries.forEach(delivery => {
        const deliveryDate = new Date(delivery.date);
        deliveryDate.setHours(0,0,0,0); // normalize

        if (deliveryDate.getTime() === currentDate.getTime()) {
          dayDeliveries.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            schoolName: order.schoolRegistrationId?.schoolName || 'N/A',
            status: delivery.status,
            deliveryTime: order.deliveryTime,
            notes: delivery.notes
          });
        }
      });
    });

    // determine status
    let dayStatus = 'empty';
    const statusCount = { delivered: 0, pending: 0, cancelled: 0, skipped: 0 };

    dayDeliveries.forEach(delivery => {
      statusCount[delivery.status]++;
    });

    if (!isHoliday && dayDeliveries.length > 0) {
      if (statusCount.delivered > 0 && statusCount.pending === 0) dayStatus = 'completed';
      else if (statusCount.pending > 0) dayStatus = 'pending';
      else if (statusCount.cancelled > 0 || statusCount.skipped > 0) dayStatus = 'cancelled';
    }

    currentWeek.push({
      date: day,
      dayOfWeek,
      isHoliday,
      deliveries: dayDeliveries,
      status: dayStatus,
      statusCount
    });

    if (dayOfWeek === 6 || day === daysInMonth) {
      calendar.push(currentWeek);
      currentWeek = [];
    }
  }

  return {
    year,
    month: month + 1,
    monthName: new Date(year, month).toLocaleString('default', { month: 'long' }),
    calendar,
    totalDays: daysInMonth
  };
};

// Get detailed delivery information for a specific date
exports.getDateDeliveries = async (req, res) => {
  try {
    const parentId = req.user.id;
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    // Get orders with deliveries on this date
    const orders = await Order.find({
      parentId,
      'dailyDeliveries.date': {
        $gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
        $lt: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1)
      }
    })
    .populate('parentAddressId', 'parentName studentName')
    .populate('schoolId', 'schoolName')
    .populate('deliveryBoyId', 'name mobile')
    .populate('dailyDeliveries.deliveredBy', 'name');

    const deliveries = [];
    orders.forEach(order => {
      const dayDelivery = order.dailyDeliveries.find(delivery => {
        const deliveryDate = new Date(delivery.date);
        return deliveryDate.toDateString() === targetDate.toDateString();
      });

      if (dayDelivery) {
        deliveries.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          parentName: order.parentAddressId?.parentName || 'N/A',
          studentName: order.parentAddressId?.studentName || 'N/A',
          schoolName: order.schoolId?.schoolName || 'N/A',
          deliveryTime: order.deliveryTime,
          status: dayDelivery.status,
          pickupTime: dayDelivery.pickupTime,
          deliveryTime: dayDelivery.deliveryTime,
          notes: dayDelivery.notes,
          deliveredBy: dayDelivery.deliveredBy?.name || 'N/A'
        });
      }
    });

    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      deliveries
    });

  } catch (error) {
    console.error('Get date deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching date deliveries',
      error: error.message
    });
  }
}; 