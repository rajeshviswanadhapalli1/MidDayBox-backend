/**
 * Order delivery schedule — Sundays are excluded.
 * 15_days / 30_days = that many CALENDAR days in the plan window;
 * deliveries = all non-Sunday days inside the window (e.g. 15 days with 2 Sundays → 13 deliveries).
 */

function normalizeDate(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSunday(date) {
  return normalizeDate(date).getDay() === 0;
}

/** Calendar days in the plan (15 or 30), not delivery day count. */
function getCalendarSpanDays(orderType) {
  if (orderType === '15_days') return 15;
  if (orderType === '30_days') return 30;
  if (orderType === 'today') return 1;
  return 0;
}

/** First day of the plan window (matches legacy Order logic). */
function getEffectiveStartDate(startDate) {
  const today = normalizeDate(new Date());
  const start = normalizeDate(startDate);

  if (start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear()) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  return new Date(start.getFullYear(), start.getMonth(), 1);
}

/**
 * Build delivery dates: N calendar days from plan start, skip Sundays only (no extra days added).
 * @returns {{ ok: true, startDate, endDate, deliveryDates, totalDeliveryDays, requestedCalendarDays, sundaysExcluded } | { ok: false, error }}
 */
function buildDeliverySchedule({ startDate, orderType }) {
  const spanDays = getCalendarSpanDays(orderType);
  if (!spanDays) {
    return { ok: false, error: 'Invalid order type' };
  }

  if (orderType === 'today') {
    const day = normalizeDate(startDate);
    if (isSunday(day)) {
      return {
        ok: false,
        error: 'Sunday is not a delivery day. Please choose Monday–Saturday.'
      };
    }
    return {
      ok: true,
      startDate: day,
      endDate: day,
      deliveryDates: [new Date(day)],
      totalDeliveryDays: 1,
      requestedCalendarDays: 1,
      sundaysExcluded: true
    };
  }

  const periodStart = getEffectiveStartDate(startDate);
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodStart.getDate() + spanDays - 1);

  const deliveryDates = [];
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(periodStart);
    d.setDate(periodStart.getDate() + i);
    if (!isSunday(d)) {
      deliveryDates.push(new Date(d));
    }
  }

  if (deliveryDates.length === 0) {
    return {
      ok: false,
      error: 'No delivery days in this period. Please choose a different start date.'
    };
  }

  return {
    ok: true,
    startDate: periodStart,
    endDate: periodEnd,
    deliveryDates,
    totalDeliveryDays: deliveryDates.length,
    requestedCalendarDays: spanDays,
    sundaysExcluded: true
  };
}

function scheduleToDailyDeliveries(schedule) {
  return schedule.deliveryDates.map((date) => ({
    date: new Date(date),
    status: 'pending'
  }));
}

/** Add schedule summary for API responses (existing + new orders). */
function enrichOrder(order) {
  const o = order?.toObject ? order.toObject({ virtuals: true }) : { ...order };
  const deliveries = Array.isArray(o.dailyDeliveries) ? o.dailyDeliveries : [];

  if (deliveries.length > 0) {
    const sorted = [...deliveries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    o.effectiveStartDate = sorted[0].date;
    o.effectiveEndDate = sorted[sorted.length - 1].date;
    o.totalDeliveryDays = sorted.length;
    o.sundaysExcluded = true;
    if (o.orderType === '15_days') o.requestedCalendarDays = 15;
    if (o.orderType === '30_days') o.requestedCalendarDays = 30;
    if (o.orderType === 'today') o.requestedCalendarDays = 1;
  } else if (o.startDate && o.orderType) {
    const schedule = buildDeliverySchedule({
      startDate: o.startDate,
      orderType: o.orderType
    });
    if (schedule.ok) {
      o.effectiveStartDate = schedule.startDate;
      o.effectiveEndDate = schedule.endDate;
      o.totalDeliveryDays = schedule.totalDeliveryDays;
      o.requestedCalendarDays = schedule.requestedCalendarDays;
      o.sundaysExcluded = schedule.sundaysExcluded;
    }
  }

  return o;
}

function enrichOrders(orders) {
  return orders.map((o) => enrichOrder(o));
}

module.exports = {
  normalizeDate,
  isSunday,
  getCalendarSpanDays,
  getEffectiveStartDate,
  buildDeliverySchedule,
  scheduleToDailyDeliveries,
  enrichOrder,
  enrichOrders
};
