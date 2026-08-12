import { describe, expect, it } from 'vitest';
import { buildAdminSettingsPayload, getBusinessStatusMeta, normalizeAdminSettings } from './admin';

describe('admin helpers', () => {
  it('builds the payload expected by the admin settings API', () => {
    const payload = buildAdminSettingsPayload({
      taxRate: '13',
      deliveryFee: '70',
      commissionRate: '5',
      paymentMethods: ['COD', 'Card'],
    });

    expect(payload).toEqual({
      taxRate: 13,
      deliveryFee: 70,
      commissionRate: 5,
      paymentMethods: ['COD', 'Card'],
    });
  });

  it('normalizes payment methods from object values into a list', () => {
    const normalized = normalizeAdminSettings({
      taxRate: 13,
      deliveryFee: 70,
      commissionRate: 5,
      paymentMethods: { cod: true, stripe: false, esewa: true },
    });

    expect(normalized.paymentMethods).toEqual(['cod', 'esewa']);
  });

  it('returns the correct badge metadata for statuses', () => {
    expect(getBusinessStatusMeta('verified')).toMatchObject({ label: 'Verified', tone: 'cyan' });
    expect(getBusinessStatusMeta('pending')).toMatchObject({ label: 'Pending', tone: 'amber' });
    expect(getBusinessStatusMeta('suspended')).toMatchObject({ label: 'Suspended', tone: 'rose' });
  });
});
