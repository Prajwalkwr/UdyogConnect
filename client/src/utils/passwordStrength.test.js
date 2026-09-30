import { describe, expect, it } from 'vitest';
import { getPasswordStrength } from './passwordStrength';

describe('getPasswordStrength', () => {
  it('rates passwords as weak, medium or strong', () => {
    expect(getPasswordStrength('')).toEqual({ level: 0, label: '' });
    expect(getPasswordStrength('short1').label).toBe('Weak');
    expect(getPasswordStrength('onlyletters').label).toBe('Weak');
    expect(getPasswordStrength('password1').label).toBe('Weak');
    expect(getPasswordStrength('Password1').label).toBe('Medium');
    expect(getPasswordStrength('Password123!').label).toBe('Strong');
  });
});
