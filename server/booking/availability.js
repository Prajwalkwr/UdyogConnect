/**
 * Nepal (Asia/Kathmandu) booking availability & validation.
 * Server is the source of truth; clients should call the availability API.
 */

const NEPAL_TZ = 'Asia/Kathmandu';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ALL_OPENING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed']);

const pad2 = (n) => String(n).padStart(2, '0');

const getNepalParts = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
  );
  const weekdayMap = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayKey: weekdayMap[parts.weekday] || DAY_KEYS[date.getUTCDay()],
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const parseHourRange = (hours = '') => {
  if (typeof hours !== 'string') return null;
  const cleaned = hours
    .replace(/\u2013|\u2014/g, '-') // en/em dash → hyphen
    .replace(/\s+to\s+/gi, ' - ')
    .trim();
  if (!cleaned) return null;
  const match = cleaned.match(
    /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i
  );
  if (!match) return null;
  const toMinutes = (h, m = '0', meridiem, peerMeridiem) => {
    let hour = Number(h);
    const min = Number(m);
    if (Number.isNaN(hour) || Number.isNaN(min)) return null;
    const mer = (meridiem || peerMeridiem || '').toUpperCase();
    // 24h values like 13–23 stay as-is when no meridiem
    if (meridiem || (peerMeridiem && hour <= 12)) {
      if (mer === 'PM' && hour < 12) hour += 12;
      if (mer === 'AM' && hour === 12) hour = 0;
    }
    if (hour > 23 || min > 59) return null;
    return hour * 60 + min;
  };
  // If only closing has AM/PM (rare), still parse; if opening is 9 and closing is 5 PM, opening inherits context via peer
  const start = toMinutes(match[1], match[2], match[3], match[6]);
  const end = toMinutes(match[4], match[5], match[6], match[3]);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
};

/** Parse duration from number or strings like "60", "90 mins", "1 Hour", "1.5 hours". */
const parseDurationMinutes = (value, fallback = 60) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(5, Math.round(value));
  }
  const raw = String(value ?? '').trim();
  if (!raw) return Math.max(5, fallback);
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.max(5, Math.round(Number(raw)));
  }
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i);
  const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/i);
  let total = 0;
  if (hourMatch) total += Number(hourMatch[1]) * 60;
  if (minMatch) total += Number(minMatch[1]);
  if (total > 0) return Math.max(5, Math.round(total));
  const firstNum = raw.match(/(\d+)/);
  if (firstNum) return Math.max(5, Number(firstNum[1]));
  return Math.max(5, fallback);
};

const minutesFromTimeFields = (openingTime, closingTime) => {
  const start = parseTimeToMinutes(openingTime);
  const end = parseTimeToMinutes(closingTime);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
};

/** Resolve business open/close window (Nepal local minutes). */
const resolveBusinessHours = (business = {}) => {
  const fromFields = minutesFromTimeFields(business.openingTime, business.closingTime);
  if (fromFields) return fromFields;
  const fromHours = parseHourRange(business.hours || '');
  if (fromHours) return fromHours;
  return { start: 9 * 60, end: 18 * 60 };
};

/** Service-specific window, intersected with business hours when both exist. */
const resolveServiceWindow = (service = {}, businessRange) => {
  const fromFields = minutesFromTimeFields(service.availableFrom, service.availableTo);
  if (fromFields) {
    return {
      start: Math.max(businessRange.start, fromFields.start),
      end: Math.min(businessRange.end, fromFields.end),
    };
  }
  return { ...businessRange };
};

/** Candidate start minutes from service.slots entries like "09:00", "09:00 - 10:00", "9:00 AM". */
const candidateStartsFromServiceSlots = (slots, range, duration) => {
  if (!Array.isArray(slots) || !slots.length) return null;
  const starts = [];
  for (const raw of slots) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const window = parseHourRange(text);
    if (window) {
      // Treat configured period as a fixed offering that must fit duration
      if (window.start >= range.start && window.start + duration <= range.end) {
        starts.push(window.start);
      } else if (window.start >= range.start && window.end <= range.end && window.end - window.start >= duration) {
        starts.push(window.start);
      }
      continue;
    }
    const start = parseTimeToMinutes(text);
    if (start !== null && start >= range.start && start + duration <= range.end) {
      starts.push(start);
    }
  }
  return [...new Set(starts)].sort((a, b) => a - b);
};

const parseTimeToMinutes = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const startOnly = raw.split(/[-–]/)[0].trim();
  const match = startOnly.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (match[3]) {
    const up = match[3].toUpperCase();
    if (up === 'PM' && hour < 12) hour += 12;
    if (up === 'AM' && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
};

const minutesToLabel = (totalMinutes) => {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad2(minute)} ${meridiem}`;
};

const minutesToHHmm = (totalMinutes) => {
  const hour24 = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${pad2(hour24)}:${pad2(minute)}`;
};

/** Convert Nepal local date+minutes to a UTC Date. */
const nepalLocalToUtc = (dateKey, minutesOfDay) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  let guess = Date.UTC(y, m - 1, d, hour - 6, minute, 0);
  for (let i = 0; i < 8; i += 1) {
    const parts = getNepalParts(new Date(guess));
    const actualMinutes = parts.hour * 60 + parts.minute;
    if (parts.dateKey === dateKey && actualMinutes === minutesOfDay) {
      return new Date(guess);
    }
    const targetDay = Date.UTC(y, m - 1, d) / 86400000;
    const actualDay = Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000;
    guess += (targetDay - actualDay) * 86400000 + (minutesOfDay - actualMinutes) * 60000;
  }
  return new Date(guess);
};

const isValidCalendarDate = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const dayKeyFromDateKey = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return DAY_KEYS[weekday];
};

const normalizeOpeningDays = (days) => {
  const list = Array.isArray(days) ? days : [];
  const normalized = [...new Set(
    list.map((d) => String(d || '').toLowerCase().slice(0, 3)).filter((d) => ALL_OPENING_DAYS.includes(d))
  )];
  return normalized.length ? normalized : [...ALL_OPENING_DAYS];
};

const normalizeDateList = (values) => (Array.isArray(values) ? values : [])
  .map((v) => String(v || '').trim())
  .filter((v) => isValidCalendarDate(v));

const getBookingSettings = (business = {}) => {
  const range = resolveBusinessHours(business);
  return {
    hours: business.hours || `${minutesToHHmm(range.start)} - ${minutesToHHmm(range.end)}`,
    openingTime: business.openingTime || minutesToHHmm(range.start),
    closingTime: business.closingTime || minutesToHHmm(range.end),
    openingDays: normalizeOpeningDays(business.openingDays),
    holidays: normalizeDateList(business.holidays),
    blockedDates: normalizeDateList(business.blockedDates),
    minBookingNoticeMinutes: Math.max(0, Number(business.minBookingNoticeMinutes ?? 30)),
    maxAdvanceBookingDays: Math.max(1, Number(business.maxAdvanceBookingDays ?? 60)),
    bookingSlotIntervalMinutes: Math.max(5, Number(business.bookingSlotIntervalMinutes ?? 30)),
    openMinutes: range.start,
    closeMinutes: range.end,
  };
};

const intervalsOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const bookingInterval = (booking, fallbackDuration = 60) => {
  const start = parseTimeToMinutes(booking.timeSlot || booking.startTime);
  if (start === null) return null;
  const duration = Math.max(5, Number(booking.durationMinutes || booking.duration || fallbackDuration));
  return { start, end: start + duration, staffMember: booking.staffMember || '' };
};

function evaluateBookingAvailability({
  business,
  service,
  date,
  timeSlot,
  staffMember = '',
  existingBookings = [],
  now = new Date(),
  excludeBookingId = null,
}) {
  const settings = getBookingSettings(business);
  const nepalNow = getNepalParts(now);
  const duration = parseDurationMinutes(service?.duration, 60);

  if (!service || service.availability === false) {
    return {
      ok: false,
      status: 422,
      code: 'SERVICE_UNAVAILABLE',
      message: 'This service is unavailable at the selected time.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      ok: false,
      status: 422,
      code: 'INVALID_DURATION',
      message: 'This service has an invalid duration. Please contact the business.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  if (!isValidCalendarDate(date)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_DATE',
      message: 'Please select a valid calendar date.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  if (date < nepalNow.dateKey) {
    return {
      ok: false,
      status: 400,
      code: 'PAST_DATE',
      message: 'Please select a future date.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  const maxDateParts = getNepalParts(
    new Date(nepalLocalToUtc(nepalNow.dateKey, 12 * 60).getTime() + settings.maxAdvanceBookingDays * 86400000)
  );
  const maxDate = maxDateParts.dateKey;

  if (date > maxDate) {
    return {
      ok: false,
      status: 400,
      code: 'TOO_FAR',
      message: `Bookings can only be made up to ${settings.maxAdvanceBookingDays} days in advance.`,
      slots: [],
      settings,
      nepalNow,
      maxDate,
    };
  }

  const dayKey = dayKeyFromDateKey(date);
  if (!settings.openingDays.includes(dayKey)) {
    return {
      ok: false,
      status: 422,
      code: 'CLOSED_DAY',
      message: 'This business is closed on this day.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  if (settings.holidays.includes(date) || settings.blockedDates.includes(date)) {
    return {
      ok: false,
      status: 422,
      code: 'BLOCKED_DATE',
      message: 'This business is closed on this day.',
      slots: [],
      settings,
      nepalNow,
    };
  }

  const businessRange = {
    start: settings.openMinutes,
    end: settings.closeMinutes,
  };
  const range = resolveServiceWindow(service, businessRange);

  if (!range || range.end - range.start < duration) {
    return {
      ok: false,
      status: 422,
      code: 'SERVICE_UNAVAILABLE',
      message: 'This service is unavailable at the selected time. The business needs a longer open period for this service duration.',
      slots: [],
      settings,
      nepalNow,
      duration,
    };
  }

  const activeBookings = (Array.isArray(existingBookings) ? existingBookings : [])
    .filter((b) => String(b.date) === String(date))
    .filter((b) => ACTIVE_BOOKING_STATUSES.has(String(b.status || 'pending').toLowerCase()))
    .filter((b) => !excludeBookingId || String(b._id) !== String(excludeBookingId));

  const earliestMinutes = date === nepalNow.dateKey
    ? (nepalNow.hour * 60 + nepalNow.minute + settings.minBookingNoticeMinutes)
    : range.start;

  const hasConflict = (start) => {
    const end = start + duration;
    return activeBookings.some((booking) => {
      const interval = bookingInterval(booking, duration);
      if (!interval) return false;
      const requestedStaff = String(staffMember || '').trim();
      const bookedStaff = String(booking.staffMember || '').trim();
      if (
        requestedStaff
        && bookedStaff
        && requestedStaff !== 'Any available staff'
        && bookedStaff !== 'Any available staff'
        && requestedStaff !== bookedStaff
      ) {
        return false;
      }
      return intervalsOverlap(start, end, interval.start, interval.end);
    });
  };

  const pushSlot = (start, list) => {
    if (start < range.start || start + duration > range.end) return;
    if (start < earliestMinutes) return;
    if (hasConflict(start)) return;
    const end = start + duration;
    list.push({
      value: minutesToHHmm(start),
      label: minutesToLabel(start),
      endValue: minutesToHHmm(end),
      endLabel: minutesToLabel(end),
      startMinutes: start,
      endMinutes: end,
    });
  };

  const slots = [];
  const fromServiceSlots = candidateStartsFromServiceSlots(service?.slots, range, duration);
  if (fromServiceSlots && fromServiceSlots.length) {
    fromServiceSlots.forEach((start) => pushSlot(start, slots));
  }
  // Always fall back to business/service hours when custom slots are empty or all expired
  if (!slots.length) {
    for (let start = range.start; start + duration <= range.end; start += settings.bookingSlotIntervalMinutes) {
      pushSlot(start, slots);
    }
  }

  const emptyMessage = date === nepalNow.dateKey
    ? 'No available time slots left for today. Please select another date.'
    : 'No available time slots for this date.';

  if (!timeSlot) {
    return {
      ok: true,
      status: 200,
      code: 'OK',
      message: slots.length ? 'Slots available.' : emptyMessage,
      slots,
      settings,
      nepalNow,
      minDate: nepalNow.dateKey,
      maxDate,
      duration,
      openMinutes: range.start,
      closeMinutes: range.end,
    };
  }

  const requestedStart = parseTimeToMinutes(timeSlot);
  if (requestedStart === null) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_TIME',
      message: 'Please select a valid time.',
      slots,
      settings,
      nepalNow,
    };
  }

  if (requestedStart < range.start || requestedStart + duration > range.end) {
    return {
      ok: false,
      status: 400,
      code: 'OUTSIDE_HOURS',
      message: 'Bookings outside business hours are not allowed.',
      slots,
      settings,
      nepalNow,
    };
  }

  if (date === nepalNow.dateKey && requestedStart < nepalNow.hour * 60 + nepalNow.minute + settings.minBookingNoticeMinutes) {
    return {
      ok: false,
      status: 400,
      code: 'MIN_NOTICE',
      message: `Please select a time at least ${settings.minBookingNoticeMinutes} minutes from now.`,
      slots,
      settings,
      nepalNow,
    };
  }

  const matchingSlot = slots.find((slot) => slot.startMinutes === requestedStart);
  if (!matchingSlot) {
    const busy = hasConflict(requestedStart);
    return {
      ok: false,
      status: busy ? 409 : 422,
      code: busy ? 'SLOT_TAKEN' : 'SERVICE_UNAVAILABLE',
      message: busy
        ? 'This time has already been booked.'
        : 'This service is unavailable at the selected time.',
      slots,
      settings,
      nepalNow,
    };
  }

  return {
    ok: true,
    status: 200,
    code: 'OK',
    message: 'Booking time is available.',
    slots,
    settings,
    nepalNow,
    minDate: nepalNow.dateKey,
    maxDate,
    duration,
    startAt: nepalLocalToUtc(date, requestedStart),
    endAt: nepalLocalToUtc(date, requestedStart + duration),
    normalizedTimeSlot: matchingSlot.label,
    startMinutes: requestedStart,
    endMinutes: requestedStart + duration,
  };
}

module.exports = {
  NEPAL_TZ,
  ACTIVE_BOOKING_STATUSES,
  ALL_OPENING_DAYS,
  getNepalParts,
  isValidCalendarDate,
  getBookingSettings,
  evaluateBookingAvailability,
  parseTimeToMinutes,
  parseDurationMinutes,
  parseHourRange,
  resolveBusinessHours,
  minutesToLabel,
  minutesToHHmm,
  nepalLocalToUtc,
};
