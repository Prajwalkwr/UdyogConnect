import { describe, expect, it } from 'vitest';
import { resolveCheckoutBusinessId } from './checkout';

describe('resolveCheckoutBusinessId', () => {
  it('returns the first cart item business id when present', () => {
    expect(resolveCheckoutBusinessId([{ businessId: 'b2', quantity: 1 }])).toBe('b2');
  });

  it('falls back to the first available business identifier', () => {
    expect(resolveCheckoutBusinessId([{ sellerId: 's3' }])).toBe('s3');
  });
});
