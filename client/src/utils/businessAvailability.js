const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const WEEKDAY_OPTIONS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];

export const ALL_OPENING_DAYS = WEEKDAY_OPTIONS.map((day) => day.key);

function parseHours(hours = '') {
  if (typeof hours !== 'string') return null;
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return null;

  const [, startHour, startMin = '0', endHour, endMin = '0'] = match;
  const start = Number(startHour) * 60 + Number(startMin);
  const end = Number(endHour) * 60 + Number(endMin);
  return { start, end };
}

/** Normalize to unique valid day keys. Empty/missing => all days (legacy businesses). */
export function normalizeOpeningDays(days, { defaultAll = true } = {}) {
  const list = Array.isArray(days)
    ? days
    : (typeof days === 'string' && days.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(days);
            return Array.isArray(parsed) ? parsed : String(days).split(',');
          } catch {
            return String(days).split(',');
          }
        })()
      : []);

  const normalized = [...new Set(
    list
      .map((day) => String(day || '').trim().toLowerCase().slice(0, 3))
      .filter((day) => ALL_OPENING_DAYS.includes(day))
  )];

  if (!normalized.length && defaultAll) return [...ALL_OPENING_DAYS];
  return normalized;
}

export function getTodayDayKey(now = new Date()) {
  return DAY_KEYS[now.getDay()];
}

export function isOpenOnDay(business = {}, dayKey = getTodayDayKey()) {
  const openingDays = normalizeOpeningDays(business.openingDays);
  return openingDays.includes(dayKey);
}

export function buildOpeningHoursSchedule(business = {}) {
  const hours = String(business.hours || '09:00 - 18:00').trim() || '09:00 - 18:00';
  const openingDays = normalizeOpeningDays(business.openingDays);
  return WEEKDAY_OPTIONS.map((day) => {
    const open = openingDays.includes(day.key);
    return {
      key: day.key,
      label: day.label,
      short: day.short,
      value: open ? hours : 'Closed',
      closed: !open,
    };
  });
}

export function formatOpeningDaysLabel(business = {}) {
  const openingDays = normalizeOpeningDays(business.openingDays);
  if (openingDays.length === 7) return 'Open every day';
  if (!openingDays.length) return 'Closed all week';
  const labels = WEEKDAY_OPTIONS
    .filter((day) => openingDays.includes(day.key))
    .map((day) => day.short);
  return labels.join(', ');
}

export function getBusinessAvailabilityMeta(business = {}, now = new Date()) {
  const deliveryAvailable = business.deliveryAvailable !== undefined ? Boolean(business.deliveryAvailable) : true;
  const deliveryRadiusKm = Number(business.deliveryRadiusKm || business.radius || 5);
  const radius = Number.isFinite(deliveryRadiusKm) ? deliveryRadiusKm : 5;

  const todayKey = getTodayDayKey(now);
  const openToday = isOpenOnDay(business, todayKey);
  const hours = parseHours(business.hours);
  const isOpenByHours = openToday && hours ? (() => {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (hours.start <= hours.end) {
      return currentMinutes >= hours.start && currentMinutes <= hours.end;
    }
    return currentMinutes >= hours.start || currentMinutes <= hours.end;
  })() : openToday && !hours;

  const effectiveIsOpen = business.manualOpenOverride !== null && business.manualOpenOverride !== undefined
    ? Boolean(business.manualOpenOverride)
    : Boolean(isOpenByHours);

  const hoursText = String(business.hours || '').trim() || '09:00 - 18:00';
  const daysLabel = formatOpeningDaysLabel(business);

  return {
    isOpen: effectiveIsOpen,
    openToday,
    todayKey,
    deliveryAvailable,
    deliveryRadiusKm: radius,
    openLabel: effectiveIsOpen ? 'Open' : (openToday ? 'Closed' : 'Closed today'),
    deliveryLabel: deliveryAvailable ? `Delivery up to ${radius} km` : 'Delivery not available',
    hoursLabel: openToday ? hoursText : 'Closed today',
    daysLabel,
    schedule: buildOpeningHoursSchedule(business),
  };
}
