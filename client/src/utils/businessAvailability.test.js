import { describe, expect, it } from 'vitest';
import { getBusinessAvailabilityMeta } from './businessAvailability';

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
