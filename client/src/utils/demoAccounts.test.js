import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from './demoAccounts';

describe('demo accounts', () => {
  it('uses the seeded admin credentials', () => {
    expect(DEMO_ACCOUNTS.admin.email).toBe('admin@udyog.np');
    expect(DEMO_ACCOUNTS.admin.password).toBe('password');
  });

  it('uses the seeded seller credentials', () => {
    expect(DEMO_ACCOUNTS.seller.email).toBe('seller@udyog.np');
    expect(DEMO_ACCOUNTS.seller.password).toBe('password');
  });
});
