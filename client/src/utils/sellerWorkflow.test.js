import { describe, it, expect } from 'vitest';
import { buildSellerProfilePayload } from './sellerWorkflow';

describe('buildSellerProfilePayload', () => {
  it('maps seller profile form values into the API payload', () => {
    const payload = buildSellerProfilePayload({
      name: 'Fresh Basket',
      location: 'Pokhara',
      category: 'Grocery',
      hours: '09:00 - 18:00',
      phone: '9800000000',
      contactEmail: 'fresh@udyog.np',
      description: 'Fresh produce and staples',
      offeringType: 'both',
    });

    expect(payload).toEqual({
      name: 'Fresh Basket',
      location: 'Pokhara',
      category: 'Grocery',
      hours: '09:00 - 18:00',
      phone: '9800000000',
      contactEmail: 'fresh@udyog.np',
      description: 'Fresh produce and staples',
      offeringType: 'both',
    });
  });
});
