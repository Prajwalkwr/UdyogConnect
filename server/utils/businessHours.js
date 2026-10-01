/**
 * Server-side open/closed status, matching client/src/utils/businessAvailability.js.
 * The server may run in UTC (Render), so every calculation uses Nepal wall-clock time:
 * dates are shifted by the Nepal offset and read with UTC getters.
 */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const toNepal = (date) => new Date(new Date(date).getTime() + NEPAL_OFFSET_MS);
const fromNepal = (shifted) => new Date(shifted.getTime() - NEPAL_OFFSET_MS);

const toMinutes = (hour, minute = '0', meridiem = '') => {
  let h = Number(hour) % 24;
  const suffix = String(meridiem || '').toUpperCase();
  if (suffix === 'PM' && h < 12) h += 12;
  if (suffix === 'AM' && h === 12) h = 0;
  return h * 60 + Number(minute || 0);
};

function parseHours(hours = '') {
  if (typeof hours !== 'string') return null;
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  const [, startHour, startMin, startMeridiem, endHour, endMin, endMeridiem] = match;
  return { start: toMinutes(startHour, startMin, startMeridiem), end: toMinutes(endHour, endMin, endMeridiem) };
}

function normalizeOpeningDays(days) {
  let list = [];
  if (Array.isArray(days)) list = days;
  else if (typeof days === 'string' && days.trim()) {
    try {
      const parsed = JSON.parse(days);
      list = Array.isArray(parsed) ? parsed : days.split(',');
    } catch {
      list = days.split(',');
    }
  }
  const normalized = [...new Set(list.map((day) => String(day || '').trim().toLowerCase().slice(0, 3)).filter((day) => ALL_DAYS.includes(day)))];
  return normalized.length ? normalized : [...ALL_DAYS];
}

/** `shifted` is a Nepal wall-clock date (read with UTC getters). */
function isScheduledOpenAt(business, shifted) {
  if (!normalizeOpeningDays(business.openingDays).includes(DAY_KEYS[shifted.getUTCDay()])) return false;
  const hours = parseHours(business.hours);
  if (!hours) return true;
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  if (hours.start <= hours.end) return minutes >= hours.start && minutes < hours.end;
  return minutes >= hours.start || minutes < hours.end;
}

function nextScheduleChange(business, fromShifted) {
  const hours = parseHours(business.hours);
  const base = new Date(fromShifted);
  base.setUTCHours(0, 0, 0, 0);
  const candidates = [];
  for (let day = 0; day <= 8; day += 1) {
    const offsets = hours ? [0, hours.start, hours.end] : [0];
    offsets.forEach((minutes) => {
      const at = new Date(base.getTime() + day * 24 * 60 * 60 * 1000 + minutes * 60 * 1000);
      if (at > fromShifted) candidates.push(at);
    });
  }
  candidates.sort((a, b) => a - b);
  return candidates.find((at) => isScheduledOpenAt(business, at) !== isScheduledOpenAt(business, new Date(at.getTime() - 60000))) || null;
}

/** Open now, honouring a seller's manual open/close switch until the schedule next changes. */
function isBusinessOpenNow(business = {}, now = new Date()) {
  const nowShifted = toNepal(now);
  const scheduled = isScheduledOpenAt(business, nowShifted);
  const manual = business.manualOpenOverride;
  if (manual === null || manual === undefined || !business.manualOverrideAt) return scheduled;
  const setAt = new Date(business.manualOverrideAt);
  if (Number.isNaN(setAt.getTime())) return scheduled;
  const until = nextScheduleChange(business, toNepal(setAt));
  const active = !until || nowShifted < until;
  return active ? Boolean(manual) : scheduled;
}

module.exports = { isBusinessOpenNow, parseHours, normalizeOpeningDays, NEPAL_OFFSET_MS, toNepal, fromNepal };
