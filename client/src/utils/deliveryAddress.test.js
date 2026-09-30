import { describe, expect, it } from 'vitest';
import {
  checkoutLocationOf,
  prefillAddressDraft,
  toAddressDraft,
  validateDeliveryAddress,
} from './deliveryAddress';

const draft = {
  fullName: 'Prajwal Kunwor',
  phone: '9861763879',
  landmark: '',
  province: 'Bagmati Province',
  city: 'Kathmandu Metro 10 - New Baneshwor Area',
  address: 'Shrijana Chowk',
  label: 'Home',
};

describe('delivery address helpers', () => {
  it('accepts a complete address and flags each invalid field', () => {
    expect(validateDeliveryAddress(draft)).toEqual({});
    const errors = validateDeliveryAddress({ ...draft, fullName: 'Ram 2', phone: '9512345678', province: 'Nowhere', city: 'Pokhara', address: '12', landmark: 'Gate #2' });
    expect(Object.keys(errors).sort()).toEqual(['address', 'city', 'fullName', 'landmark', 'phone', 'province']);
  });

  it('fills a new address from what the customer saved before', () => {
    const user = { name: 'Prajwal Kunwor', phone: '9861763879' };
    expect(prefillAddressDraft(user, [])).toMatchObject({ fullName: 'Prajwal Kunwor', phone: '9861763879', province: '', city: '' });
    expect(prefillAddressDraft(user, [{ ...draft, fullName: 'Sita Rai', phone: '9712345678' }]))
      .toMatchObject({ fullName: 'Sita Rai', phone: '9712345678', province: 'Bagmati Province', city: draft.city, address: '' });
    expect(prefillAddressDraft({ name: 'R2D2', phone: '12345' }, [])).toMatchObject({ fullName: 'RD', phone: '' });
  });

  it('reads older addresses and turns the city into a checkout location', () => {
    expect(toAddressDraft({ title: 'office', location: 'Banepa', address: 'Main Road' })).toMatchObject({ label: 'Office', city: 'Banepa', address: 'Main Road' });
    expect(checkoutLocationOf(draft)).toBe('Kathmandu Metro New Baneshwor Area');
    expect(checkoutLocationOf({ city: 'Galchhi', province: 'Bagmati Province' })).toBe('Galchhi Bagmati');
    expect(checkoutLocationOf({ city: 'Sunkoshi (Sindhuli) - Khurkot' })).toBe('Sunkoshi Sindhuli Khurkot');
  });
});
