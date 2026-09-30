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

const toMinutes = (hour, minute = '0', meridiem = '') => {
  let h = Number(hour) % 24;
  const suffix = String(meridiem || '').toUpperCase();
  if (suffix === 'PM' && h < 12) h += 12;
  if (suffix === 'AM' && h === 12) h = 0;
  return h * 60 + Number(minute || 0);
};

export function parseHours(hours = '') {
  if (typeof hours !== 'string') return null;
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;

  const [, startHour, startMin, startMeridiem, endHour, endMin, endMeridiem] = match;
  return {
    start: toMinutes(startHour, startMin, startMeridiem),
    end: toMinutes(endHour, endMin, endMeridiem),
  };
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

/** Open/closed purely from opening days + hours, ignoring any manual switch. */
export function isScheduledOpen(business = {}, now = new Date()) {
  if (!isOpenOnDay(business, getTodayDayKey(now))) return false;
  const hours = parseHours(business.hours);
  if (!hours) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (hours.start <= hours.end) return minutes >= hours.start && minutes < hours.end;
  return minutes >= hours.start || minutes < hours.end;
}

/** The next moment the schedule flips between open and closed (searches up to 8 days ahead). */
export function getNextScheduleChange(business = {}, from = new Date()) {
  const hours = parseHours(business.hours);
  const base = new Date(from);
  base.setHours(0, 0, 0, 0);
  const candidates = [];
  for (let day = 0; day <= 8; day += 1) {
    const offsets = [0];
    if (hours) offsets.push(hours.start, hours.end);
    offsets.forEach((minutes) => {
      const at = new Date(base);
      at.setDate(base.getDate() + day);
      at.setMinutes(minutes);
      if (at > from) candidates.push(at);
    });
  }
  candidates.sort((a, b) => a - b);
  return candidates.find((at) => isScheduledOpen(business, at) !== isScheduledOpen(business, new Date(at.getTime() - 60000))) || null;
}

const manualOverrideSetAt = (business = {}) => {
  if (business.manualOpenOverride === null || business.manualOpenOverride === undefined) return null;
  const setAt = business.manualOverrideAt ? new Date(business.manualOverrideAt) : null;
  return setAt && !Number.isNaN(setAt.getTime()) ? setAt : null;
};

/**
 * A manual open/close switch holds until the schedule's next open/close time, then automatic hours resume.
 * Returns null when there is no switch, or when the schedule never changes (the switch then holds until turned off).
 */
export function getManualOverrideUntil(business = {}) {
  const setAt = manualOverrideSetAt(business);
  return setAt ? getNextScheduleChange(business, setAt) : null;
}

export function isManualOverrideActive(business = {}, now = new Date()) {
  if (!manualOverrideSetAt(business)) return false;
  const until = getManualOverrideUntil(business);
  return !until || now < until;
}

export function getBusinessAvailabilityMeta(business = {}, now = new Date()) {
  const deliveryAvailable = business.deliveryAvailable !== undefined ? Boolean(business.deliveryAvailable) : true;
  const deliveryRadiusKm = Number(business.deliveryRadiusKm || business.radius || 5);
  const radius = Number.isFinite(deliveryRadiusKm) ? deliveryRadiusKm : 5;

  const todayKey = getTodayDayKey(now);
  const openToday = isOpenOnDay(business, todayKey);
  const scheduledOpen = isScheduledOpen(business, now);
  const manualActive = isManualOverrideActive(business, now);
  const effectiveIsOpen = manualActive ? Boolean(business.manualOpenOverride) : scheduledOpen;

  const hoursText = String(business.hours || '').trim() || '09:00 - 18:00';
  const daysLabel = formatOpeningDaysLabel(business);

  return {
    isOpen: effectiveIsOpen,
    scheduledOpen,
    mode: manualActive ? 'manual' : 'auto',
    manualUntil: manualActive ? getManualOverrideUntil(business) : null,
    nextChange: getNextScheduleChange(business, now),
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
