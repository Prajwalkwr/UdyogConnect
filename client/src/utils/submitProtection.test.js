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

  it('blocks a second async request until the first one finishes and resets on error', async () => {
    const guard = createSubmissionGuard();

    let finished = false;
    const first = guard.runExclusive(async () => {
      expect(guard.begin()).toBe(false);
      await Promise.resolve();
      finished = true;
    });

    const second = guard.runExclusive(async () => {
      throw new Error('should not run');
    });

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(finished).toBe(true);
    expect(guard.isLocked()).toBe(false);
  });
});
