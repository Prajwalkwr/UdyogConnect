const nodemailer = require('nodemailer');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedTransport = null;
let cachedTransportKey = '';

// Google displays app passwords in groups of four; spaces are not part of the secret.
const cleanSecret = (value) => String(value || '').replace(/\s+/g, '');

function resolveFrom(fallbackAddress, fromName) {
  const configured = String(process.env.EMAIL_FROM || '').trim();
  if (!configured) return { name: fromName, address: fallbackAddress };
  return configured.includes('<') ? configured : { name: fromName, address: configured };
}

function resolveMailConfig() {
  const fromName = String(process.env.GMAIL_FROM_NAME || 'UdyogConnect').trim() || 'UdyogConnect';

  const gmailUser = String(process.env.GMAIL_USER || '').trim();
  const gmailPass = cleanSecret(process.env.GMAIL_APP_PASSWORD);
  if (gmailUser && gmailPass) {
    return {
      key: `gmail:${gmailUser}`,
      transport: { service: 'gmail', auth: { user: gmailUser, pass: gmailPass } },
      from: { name: fromName, address: gmailUser },
    };
  }

  const emailUser = String(process.env.EMAIL_USER || '').trim();
  const emailPass = cleanSecret(process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS);
  const emailHost = String(process.env.EMAIL_HOST || '').trim();
  if (emailHost && emailUser && emailPass) {
    const port = Number(process.env.EMAIL_PORT || 587);
    return {
      key: `host:${emailHost}:${port}:${emailUser}`,
      transport: {
        host: emailHost,
        port,
        secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : port === 465,
        auth: { user: emailUser, pass: emailPass },
      },
      from: resolveFrom(emailUser, fromName),
    };
  }

  // Older setups name the same Gmail App Password settings EMAIL_USER / EMAIL_PASS.
  const legacyService = String(process.env.EMAIL_SERVICE || 'gmail').trim().toLowerCase() || 'gmail';
  if (emailUser && emailPass) {
    return {
      key: `${legacyService}:${emailUser}`,
      transport: { service: legacyService, auth: { user: emailUser, pass: emailPass } },
      from: resolveFrom(emailUser, fromName),
    };
  }

  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return {
      key: `smtp:${SMTP_HOST}:${SMTP_USER}`,
      transport: {
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      },
      from: process.env.SMTP_FROM || { name: fromName, address: SMTP_USER },
    };
  }
  return null;
}

function isEmailConfigured() {
  return Boolean(resolveMailConfig());
}

function getTransport(config) {
  if (!cachedTransport || cachedTransportKey !== config.key) {
    cachedTransport = nodemailer.createTransport({
      ...config.transport,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    cachedTransportKey = config.key;
  }
  return cachedTransport;
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Sends one email through the configured provider. Throws on any failure so callers
 * can decide what to tell the user.
 */
async function sendEmail({ to, subject, text, html, attachments }) {
  const recipient = String(to || '').trim();
  if (!EMAIL_PATTERN.test(recipient)) {
    const err = new Error('Recipient email address is missing or invalid.');
    err.code = 'INVALID_RECIPIENT';
    throw err;
  }
  const config = resolveMailConfig();
  if (!config) {
    const err = new Error('Email service is not configured (set GMAIL_USER and GMAIL_APP_PASSWORD).');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  return getTransport(config).sendMail({ from: config.from, to: recipient, subject, text, html, attachments });
}

module.exports = { sendEmail, isEmailConfigured, escapeHtml, EMAIL_PATTERN };
