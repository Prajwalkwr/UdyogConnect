const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { User, AuditLog } = require('../db');
const { sendEmail, escapeHtml } = require('../utils/mailer');
const { forgetPasswordChange } = require('../middleware/authMiddleware');

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 30;
const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 72; // bcrypt only uses the first 72 bytes

const MESSAGES = {
  requested: 'If an account with this email exists, a password reset link has been sent.',
  invalidEmail: 'Please enter a valid email address.',
  unavailable: "We couldn't process the request right now. Please try again later.",
  tooMany: 'Too many requests. Please try again later.',
  invalidLink: 'This password reset link is invalid or has expired.',
  expiredLink: 'Your password reset link has expired.',
  resetDone: 'Your password has been successfully changed.',
};

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

function createWindowLimiter({ windowMs, max }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      if (hits.size > 10000) {
        for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSec: 0 };
      }
      entry.count += 1;
      return { allowed: entry.count <= max, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    },
  };
}

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const isValidEmail = (email) => Boolean(email) && email.length <= MAX_EMAIL_LENGTH && EMAIL_REGEX.test(email);
const hashResetToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const createResetToken = () => crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
const isWellFormedToken = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);

function validateNewPassword(password, confirmPassword) {
  if (typeof password !== 'string' || !password.trim()) return 'Please enter a new password.';
  if (password.length < 8) return 'Password must be at least 8 characters long.';
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) return 'Password must be 72 characters or fewer.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  if (confirmPassword !== undefined && password !== confirmPassword) return 'Passwords do not match.';
  return '';
}

const isLocalOrigin = (value) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);

/**
 * The reset link must point at the real website. Request headers are never trusted in
 * production: an attacker could otherwise make the email link point at their own site.
 */
function resolveFrontendUrl(req) {
  const configured = String(process.env.FRONTEND_URL || process.env.CLIENT_URL || '').trim().replace(/\/+$/, '');
  const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  if (configured) {
    if (!/^https?:\/\/[^\s/]+/.test(configured)) return null;
    if (isProduction && isLocalOrigin(configured)) return null;
    return configured;
  }
  if (isProduction) return null;
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  return isLocalOrigin(origin) ? origin : 'http://localhost:5174';
}

function buildResetEmail(resetUrl) {
  const subject = 'Reset Your UdyogConnect Password';
  const text = [
    'Hello,',
    '',
    'We received a request to reset your UdyogConnect password.',
    '',
    'Open the link below to create a new password:',
    resetUrl,
    '',
    `This link will expire in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    '',
    'For security, never share this link with anyone.',
    '',
    'Regards,',
    'UdyogConnect Team',
  ].join('\n');

  const safeUrl = escapeHtml(resetUrl);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1f2a3d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fa;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5ebf2;">
          <tr><td style="background:#102341;padding:22px 28px;border-bottom:4px solid #f2b71d;">
            <div style="color:#ffffff;font-size:22px;font-weight:700;">UdyogConnect</div>
            <div style="color:#f2b71d;font-size:12px;margin-top:4px;">Local Business Marketplace</div>
          </td></tr>
          <tr><td style="padding:26px 28px;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 12px;">Hello,</p>
            <p style="margin:0 0 12px;">We received a request to reset your UdyogConnect password.</p>
            <p style="margin:0 0 22px;">Click the button below to create a new password.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
              <tr><td style="border-radius:10px;background:#f2b71d;">
                <a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:13px 28px;color:#102341;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">Reset Password</a>
              </td></tr>
            </table>
            <p style="margin:0 0 12px;">This link will expire in <strong>${RESET_TOKEN_TTL_MINUTES} minutes</strong>.</p>
            <p style="margin:0 0 12px;">If you did not request a password reset, you can safely ignore this email.</p>
            <p style="margin:0 0 18px;color:#68778c;">For security, never share this link with anyone.</p>
            <p style="margin:0 0 18px;">Regards,<br><strong>UdyogConnect Team</strong></p>
            <p style="margin:0;padding-top:14px;border-top:1px solid #e5ebf2;color:#68778c;font-size:12px;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${safeUrl}" style="color:#102341;word-break:break-all;">${safeUrl}</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}

async function recordAudit(userId, action, details) {
  try {
    const AuditLogMDL = AuditLog();
    if (AuditLogMDL) await AuditLogMDL.create({ userId: String(userId), action, details });
  } catch (err) {
    console.warn(`[password-reset] Audit log skipped (${action}):`, err && err.message);
  }
}

const clearedResetFields = { passwordResetTokenHash: null, passwordResetExpires: null, passwordResetRequestedAt: null };

async function findUserByToken(token) {
  if (!isWellFormedToken(token)) return { status: 'invalid' };
  const user = await User().findOne({ passwordResetTokenHash: hashResetToken(token) });
  if (!user) return { status: 'invalid' };
  const expiresAt = user.passwordResetExpires ? new Date(user.passwordResetExpires).getTime() : 0;
  if (!expiresAt || expiresAt <= Date.now()) return { status: 'expired', user };
  return { status: 'valid', user, expiresAt };
}

const linkProblem = (status) => ({
  valid: false,
  reason: status,
  message: status === 'expired' ? MESSAGES.expiredLink : MESSAGES.invalidLink,
});

function createPasswordResetRoutes() {
  const router = express.Router();
  const window15m = 15 * 60 * 1000;
  const requestIpLimiter = createWindowLimiter({ windowMs: window15m, max: envNumber('PASSWORD_RESET_IP_LIMIT', 10) });
  const requestEmailLimiter = createWindowLimiter({ windowMs: 60 * 60 * 1000, max: envNumber('PASSWORD_RESET_EMAIL_LIMIT', 5) });
  const tokenIpLimiter = createWindowLimiter({ windowMs: window15m, max: envNumber('PASSWORD_RESET_TOKEN_IP_LIMIT', 30) });

  const limitTokenChecks = (req, res, next) => {
    const { allowed, retryAfterSec } = tokenIpLimiter.hit(req.ip || 'unknown');
    if (allowed) return next();
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ message: MESSAGES.tooMany });
  };

  router.post('/forgot-password', async (req, res) => {
    const ipCheck = requestIpLimiter.hit(req.ip || 'unknown');
    if (!ipCheck.allowed) {
      res.set('Retry-After', String(ipCheck.retryAfterSec));
      return res.status(429).json({ message: MESSAGES.tooMany });
    }

    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return res.status(400).json({ message: MESSAGES.invalidEmail });

    // Counted for every address, registered or not, so the limit reveals nothing.
    const emailCheck = requestEmailLimiter.hit(hashResetToken(email));
    if (!emailCheck.allowed) {
      res.set('Retry-After', String(emailCheck.retryAfterSec));
      return res.status(429).json({ message: MESSAGES.tooMany });
    }

    const frontendUrl = resolveFrontendUrl(req);
    if (!frontendUrl) {
      console.error('[password-reset] FRONTEND_URL is not set (or points at localhost) in production; cannot build reset links.');
      return res.status(503).json({ message: MESSAGES.unavailable });
    }

    let userId = null;
    let tokenHash = null;
    try {
      const UserMDL = User();
      const user = await UserMDL.findOne({ email });
      if (!user || user.status === 'suspended') return res.json({ success: true, message: MESSAGES.requested });

      const token = createResetToken();
      tokenHash = hashResetToken(token);
      const now = new Date();
      // Claiming the slot atomically means a double click sends one email, and a new link
      // replaces (invalidates) the previous one.
      const claimed = await UserMDL.findOneAndUpdate(
        {
          _id: user._id,
          $or: [
            { passwordResetRequestedAt: null },
            { passwordResetRequestedAt: { $lt: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
          ],
        },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
            passwordResetRequestedAt: now,
          },
        },
        { new: true }
      );
      if (!claimed) return res.json({ success: true, message: MESSAGES.requested });
      userId = user._id;

      const { subject, text, html } = buildResetEmail(`${frontendUrl}/reset-password/${token}`);
      await sendEmail({ to: user.email, subject, text, html });
      await recordAudit(userId, 'PASSWORD_RESET_REQUESTED', 'Password reset link emailed');
      return res.json({ success: true, message: MESSAGES.requested });
    } catch (err) {
      console.error('[password-reset] Could not send reset email:', err && (err.code || ''), err && err.message);
      if (userId && tokenHash) {
        try {
          await User().findOneAndUpdate({ _id: userId, passwordResetTokenHash: tokenHash }, { $set: clearedResetFields });
        } catch (cleanupErr) {
          console.error('[password-reset] Could not clear unsent reset token:', cleanupErr && cleanupErr.message);
        }
      }
      return res.status(503).json({ message: MESSAGES.unavailable });
    }
  });

  router.get('/reset-password/verify/:token', limitTokenChecks, async (req, res) => {
    try {
      const result = await findUserByToken(req.params.token);
      if (result.status !== 'valid') return res.status(400).json(linkProblem(result.status));
      return res.json({ valid: true, expiresAt: new Date(result.expiresAt).toISOString() });
    } catch (err) {
      console.error('[password-reset] Token check failed:', err && err.message);
      return res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
  });

  router.post('/reset-password', limitTokenChecks, async (req, res) => {
    try {
      const { token, password, confirmPassword } = req.body || {};
      const result = await findUserByToken(token);
      if (result.status !== 'valid') return res.status(400).json(linkProblem(result.status));

      const passwordError = validateNewPassword(password, confirmPassword);
      if (passwordError) return res.status(400).json({ message: passwordError, errors: { password: passwordError } });

      const hashedPassword = await bcrypt.hash(password, 10);
      // Only succeeds while this exact token is still stored, so a link works once.
      const updated = await User().findOneAndUpdate(
        { _id: result.user._id, passwordResetTokenHash: hashResetToken(token) },
        {
          $set: {
            ...clearedResetFields,
            password: hashedPassword,
            passwordChangedAt: new Date(),
            resetOtp: '',
            failedLoginAttempts: 0,
            lockUntil: null,
          },
        },
        { new: true }
      );
      if (!updated) return res.status(400).json(linkProblem('invalid'));

      forgetPasswordChange(result.user._id);
      await recordAudit(result.user._id, 'PASSWORD_RESET_COMPLETED', 'Password changed with a reset link');
      return res.json({ success: true, message: MESSAGES.resetDone });
    } catch (err) {
      console.error('[password-reset] Reset failed:', err && err.message);
      return res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
  });

  return router;
}

module.exports = {
  createPasswordResetRoutes,
  buildResetEmail,
  hashResetToken,
  validateNewPassword,
  resolveFrontendUrl,
  RESET_TOKEN_TTL_MINUTES,
  SENSITIVE_USER_FIELDS: ['password', 'resetOtp', 'verificationOtp', 'passwordResetTokenHash', 'passwordResetExpires', 'passwordResetRequestedAt'],
};
