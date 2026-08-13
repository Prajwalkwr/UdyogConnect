import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from './demoAccounts';

describe('demo accounts', () => {
  it('does not expose demo credentials in the client app', () => {
    expect(DEMO_ACCOUNTS).toEqual({});
  });
});
