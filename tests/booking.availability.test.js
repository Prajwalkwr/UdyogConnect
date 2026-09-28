import { describe, expect, it } from 'vitest';
import {
  evaluateBookingAvailability,
  isValidCalendarDate,
  getNepalParts,
} from '../server/booking/availability.js';

const NOW = new Date('2026-09-26T08:00:00.000Z'); // Sat 13:45 NPT-ish

const business = {
  hours: '09:00 AM - 05:00 PM',
  openingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  holidays: ['2026-10-01'],
  blockedDates: ['2026-10-02'],
  minBookingNoticeMinutes: 30,
  maxAdvanceBookingDays: 60,
  bookingSlotIntervalMinutes: 30,
};

const service = {
  _id: 'svc1',
  duration: 60,
  availability: true,
};

const openBusiness = {
  ...business,
  openingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};

describe('booking availability engine', () => {
  it('rejects invalid calendar dates like Feb 30', () => {
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-02-28')).toBe(true);
  });

  it('rejects past dates using Nepal time', () => {
    const result = evaluateBookingAvailability({
      business,
      service,
      date: '2020-01-01',
      existingBookings: [],
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PAST_DATE');
    expect(result.message).toMatch(/future date/i);
  });

  it('rejects closed weekdays', () => {
    // 2026-09-27 is Sunday
    const result = evaluateBookingAvailability({
      business,
      service,
      date: '2026-09-27',
      existingBookings: [],
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('CLOSED_DAY');
  });

  it('rejects holidays and blocked dates', () => {
    const holiday = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: '2026-10-01',
      existingBookings: [],
      now: NOW,
    });
    expect(holiday.ok).toBe(false);
    expect(holiday.code).toBe('BLOCKED_DATE');

    const blocked = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: '2026-10-02',
      existingBookings: [],
      now: NOW,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('BLOCKED_DATE');
  });

  it('enforces minimum notice for today in Nepal time', () => {
    // 2026-09-26 08:40 UTC ≈ 14:25 NPT
    const now = new Date('2026-09-26T08:40:00.000Z');
    const nepal = getNepalParts(now);
    expect(nepal.dateKey).toBe('2026-09-26');

    const result = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: nepal.dateKey,
      timeSlot: '2:30 PM',
      existingBookings: [],
      now,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('MIN_NOTICE');
  });

  it('blocks overlapping bookings by duration', () => {
    // 2026-09-28 is Monday
    const result = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: '2026-09-28',
      timeSlot: '10:00 AM',
      existingBookings: [{
        _id: 'b1',
        date: '2026-09-28',
        timeSlot: '10:30 AM',
        durationMinutes: 60,
        status: 'confirmed',
      }],
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SLOT_TAKEN');
  });

  it('returns available future slots within business hours', () => {
    const result = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: '2026-09-28',
      existingBookings: [],
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].label).toMatch(/AM|PM/);
    const last = result.slots[result.slots.length - 1];
    expect(last.endMinutes).toBeLessThanOrEqual(17 * 60);
  });

  it('parses string durations like 1 Hour', () => {
    const result = evaluateBookingAvailability({
      business: openBusiness,
      service: { duration: '1 Hour', availability: true },
      date: '2026-09-28',
      existingBookings: [],
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.duration).toBe(60);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('falls back to business hours when legacy service slots are all past', () => {
    const result = evaluateBookingAvailability({
      business: {
        ...openBusiness,
        hours: '09:00 AM - 08:00 PM',
      },
      service: {
        duration: 60,
        availability: true,
        slots: ['09:00 - 10:00', '11:00 - 12:00'],
      },
      date: '2026-09-26',
      existingBookings: [],
      now: new Date('2026-09-26T10:00:00.000Z'), // ~15:45 NPT
    });
    expect(result.ok).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('ignores cancelled bookings when computing conflicts', () => {
    const result = evaluateBookingAvailability({
      business: openBusiness,
      service,
      date: '2026-09-28',
      timeSlot: '10:00 AM',
      existingBookings: [{
        _id: 'b1',
        date: '2026-09-28',
        timeSlot: '10:00 AM',
        durationMinutes: 60,
        status: 'cancelled',
      }],
      now: NOW,
    });
    expect(result.ok).toBe(true);
  });
});
