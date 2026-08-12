import { describe, expect, it } from 'vitest';
import { normalizeUser } from './authFlow';

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
});
