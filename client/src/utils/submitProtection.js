export function createSubmissionGuard() {
  let locked = false;

  return {
    begin() {
      if (locked) return false;
      locked = true;
      return true;
    },
    finish() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
    async runExclusive(callback) {
      if (!this.begin()) return false;
      try {
        await callback();
        return true;
      } catch (error) {
        throw error;
      } finally {
        this.finish();
      }
    },
    async runAsync(callback) {
      return this.runExclusive(callback);
    },
  };
}

export function createIdempotencyKey(prefix = 'req') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createIdempotencyHeader(prefix = 'req') {
  return { 'Idempotency-Key': createIdempotencyKey(prefix) };
}
