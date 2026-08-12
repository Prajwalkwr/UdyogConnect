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
    async runAsync(callback) {
      if (!this.begin()) return false;
      try {
        await callback();
      } finally {
        this.finish();
      }
      return true;
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
