import { validatePassword } from './validation';

export const PASSWORD_STRENGTH_LEVELS = ['', 'Weak', 'Medium', 'Strong'];

/** Rates a password as Weak / Medium / Strong. Anything that fails the password rules is Weak. */
export function getPasswordStrength(password) {
  if (!password) return { level: 0, label: '' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  let level = 3;
  if (validatePassword(password) || score <= 2) level = 1;
  else if (score === 3) level = 2;
  return { level, label: PASSWORD_STRENGTH_LEVELS[level] };
}
