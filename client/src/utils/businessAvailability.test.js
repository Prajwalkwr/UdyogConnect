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

  it('derives open state from business hours', () => {
    const openMeta = getBusinessAvailabilityMeta({ hours: '09:00 - 18:00' }, new Date('2024-01-01T12:00:00'));
    const closedMeta = getBusinessAvailabilityMeta({ hours: '09:00 - 18:00' }, new Date('2024-01-01T20:00:00'));

    expect(openMeta.isOpen).toBe(true);
    expect(openMeta.openLabel).toBe('Open');
    expect(closedMeta.isOpen).toBe(false);
    expect(closedMeta.openLabel).toBe('Closed');
  });
});
