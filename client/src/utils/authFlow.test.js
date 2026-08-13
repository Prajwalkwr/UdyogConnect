import { describe, expect, it } from 'vitest';
import { normalizeUser, getDashboardLabel, isValidNepalPhone, isCouponExpired } from './authFlow';

describe('normalizeUser', () => {
  it('creates a stable _id field from the server id field', () => {
    const normalized = normalizeUser({ id: 'u123', role: 'seller' });

    expect(normalized.id).toBe('u123');
    expect(normalized._id).toBe('u123');
    expect(normalized.role).toBe('seller');
  });

  it('preserves an existing _id value', () => {
    const normalized = normalizeUser({ _id: 'u456', role: 'admin' });

    expect(normalized._id).toBe('u456');
    expect(normalized.id).toBe('u456');
  });

  it('keeps the registered display name for each logged-in user', () => {
    const normalized = normalizeUser({ fullName: 'Praa', email: 'praa@G.com', role: 'seller' });

    expect(normalized.name).toBe('Praa');
    expect(normalized.email).toBe('praa@G.com');
  });
});

describe('getDashboardLabel', () => {
  it('returns the correct dashboard name for each role', () => {
    expect(getDashboardLabel('customer', 'en')).toBe('User Dashboard');
    expect(getDashboardLabel('seller', 'en')).toBe('Seller Dashboard');
    expect(getDashboardLabel('admin', 'en')).toBe('Admin Dashboard');
  });

  it('returns the Nepali version for each role', () => {
    expect(getDashboardLabel('customer', 'ne')).toBe('प्रयोगकर्ता ड्यासबोर्ड');
    expect(getDashboardLabel('seller', 'ne')).toBe('बेचेउँता ड्यासबोर्ड');
    expect(getDashboardLabel('admin', 'ne')).toBe('एडमिन ड्यासबोर्ड');
  });
});

describe('phone and coupon validation', () => {
  it('requires Nepal mobile numbers to start with 9', () => {
    expect(isValidNepalPhone('9841234567')).toBe(true);
    expect(isValidNepalPhone('1234567890')).toBe(false);
    expect(isValidNepalPhone('+9779841234567')).toBe(false);
  });

  it('flags expired coupons', () => {
    const expiredDate = '2020-01-01';
    const futureDate = '2099-12-31';

    expect(isCouponExpired(expiredDate)).toBe(true);
    expect(isCouponExpired(futureDate)).toBe(false);
  });
});
