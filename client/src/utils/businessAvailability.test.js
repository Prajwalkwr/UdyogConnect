import { describe, expect, it } from 'vitest';
import { getBusinessAvailabilityMeta, getNextScheduleChange } from './businessAvailability';

describe('getBusinessAvailabilityMeta', () => {
  it('returns open and delivery values from business data', () => {
    const meta = getBusinessAvailabilityMeta({ isOpen: true, deliveryAvailable: true, deliveryRadiusKm: 8 });
    expect(meta.isOpen).toBe(true);
    expect(meta.deliveryAvailable).toBe(true);
    expect(meta.deliveryRadiusKm).toBe(8);
    expect(meta.openLabel).toBe('Open');
    expect(meta.deliveryLabel).toBe('Delivery up to 8 km');
  });

  it('falls back to defaults when flags are missing', () => {
    const meta = getBusinessAvailabilityMeta({});
    expect(meta.isOpen).toBe(true);
    expect(meta.deliveryAvailable).toBe(true);
    expect(meta.deliveryRadiusKm).toBe(5);
    expect(meta.openLabel).toBe('Open');
  });

  it('marks business closed when today is not an opening day', () => {
    // 2024-01-07 is Sunday
    const meta = getBusinessAvailabilityMeta(
      { hours: '09:00 - 18:00', openingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      new Date('2024-01-07T12:00:00')
    );
    expect(meta.openToday).toBe(false);
    expect(meta.isOpen).toBe(false);
    expect(meta.openLabel).toBe('Closed today');
  });
});

describe('automatic hours and the manual open/close switch', () => {
  // 2024-01-08 is a Monday
  const shop = { hours: '09:00 - 18:00', openingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] };
  const at = (iso) => new Date(`2024-01-${iso}`);

  it('opens and closes on schedule', () => {
    expect(getBusinessAvailabilityMeta(shop, at('08T08:59:00')).isOpen).toBe(false);
    expect(getBusinessAvailabilityMeta(shop, at('08T09:00:00')).isOpen).toBe(true);
    expect(getBusinessAvailabilityMeta(shop, at('08T17:59:00')).isOpen).toBe(true);
    expect(getBusinessAvailabilityMeta(shop, at('08T18:00:00')).isOpen).toBe(false);
    expect(getBusinessAvailabilityMeta(shop, at('08T12:00:00')).mode).toBe('auto');
  });

  it('understands AM/PM hours', () => {
    const ampm = { hours: '9:00 AM - 5:30 PM' };
    expect(getBusinessAvailabilityMeta(ampm, at('08T17:00:00')).isOpen).toBe(true);
    expect(getBusinessAvailabilityMeta(ampm, at('08T17:30:00')).isOpen).toBe(false);
  });

  it('reports the next automatic change, skipping closed days', () => {
    expect(getNextScheduleChange(shop, at('08T12:00:00'))).toEqual(at('08T18:00:00'));
    expect(getNextScheduleChange(shop, at('12T19:00:00'))).toEqual(at('15T09:00:00'));
  });

  it('a manual close holds until the next scheduled change, then automatic hours resume', () => {
    const closedEarly = { ...shop, manualOpenOverride: false, manualOverrideAt: at('08T14:00:00').toISOString() };
    const during = getBusinessAvailabilityMeta(closedEarly, at('08T15:00:00'));
    expect(during.isOpen).toBe(false);
    expect(during.mode).toBe('manual');
    expect(during.manualUntil).toEqual(at('08T18:00:00'));

    const nextMorning = getBusinessAvailabilityMeta(closedEarly, at('09T10:00:00'));
    expect(nextMorning.isOpen).toBe(true);
    expect(nextMorning.mode).toBe('auto');
  });

  it('a manual open outside hours holds until the next opening time', () => {
    const openLate = { ...shop, manualOpenOverride: true, manualOverrideAt: at('08T19:00:00').toISOString() };
    expect(getBusinessAvailabilityMeta(openLate, at('08T22:00:00')).isOpen).toBe(true);
    expect(getBusinessAvailabilityMeta(openLate, at('09T08:00:00')).isOpen).toBe(true);
    expect(getBusinessAvailabilityMeta(openLate, at('09T09:00:00')).mode).toBe('auto');
  });

  it('ignores an old switch that has no timestamp', () => {
    const legacy = { ...shop, manualOpenOverride: false };
    expect(getBusinessAvailabilityMeta(legacy, at('08T12:00:00')).isOpen).toBe(true);
  });

  it('holds a manual switch indefinitely when the schedule never changes', () => {
    const alwaysOpen = { manualOpenOverride: false, manualOverrideAt: at('08T12:00:00').toISOString() };
    expect(getBusinessAvailabilityMeta(alwaysOpen, at('20T12:00:00')).isOpen).toBe(false);
  });
});
