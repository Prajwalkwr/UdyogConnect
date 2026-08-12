import { describe, expect, it } from 'vitest';
import { createSubmissionGuard } from './submitProtection';

describe('createSubmissionGuard', () => {
  it('allows only the first submission while a request is in progress', () => {
    const guard = createSubmissionGuard();

    expect(guard.begin()).toBe(true);
    expect(guard.begin()).toBe(false);
    expect(guard.isLocked()).toBe(true);

    guard.finish();

    expect(guard.isLocked()).toBe(false);
    expect(guard.begin()).toBe(true);
  });
});
