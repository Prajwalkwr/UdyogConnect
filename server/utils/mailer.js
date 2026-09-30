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

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function resolveMailConfig() {
  const fromName = String(process.env.GMAIL_FROM_NAME || 'UdyogConnect').trim() || 'UdyogConnect';

  // An HTTPS email API is required on hosts that block SMTP ports (e.g. Render's free plan).
  const brevoKey = String(process.env.BREVO_API_KEY || '').trim();
  if (brevoKey) {
    const configuredFrom = String(process.env.EMAIL_FROM || '').trim();
    const fromMatch = configuredFrom.match(/^(.*)<([^>]+)>\s*$/);
    const senderEmail = fromMatch
      ? fromMatch[2].trim()
      : configuredFrom || String(process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim();
    const senderName = (fromMatch && fromMatch[1].trim().replace(/^"|"$/g, '')) || fromName;
    if (EMAIL_PATTERN.test(senderEmail)) {
      return { key: 'brevo', api: 'brevo', apiKey: brevoKey, sender: { name: senderName, email: senderEmail } };
    }
  }

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

const toBase64 = (content, encoding) => {
  if (Buffer.isBuffer(content)) return content.toString('base64');
  if (encoding === 'base64') return String(content);
  return Buffer.from(String(content ?? ''), 'utf8').toString('base64');
};

async function sendWithBrevo(config, { to, subject, text, html, attachments }) {
  const payload = {
    sender: config.sender,
    to: [{ email: to }],
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(text ? { textContent: text } : {}),
  };
  if (Array.isArray(attachments) && attachments.length) {
    payload.attachment = attachments.map((file, index) => ({
      name: file.filename || `attachment-${index + 1}`,
      content: toBase64(file.content, file.encoding),
    }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: { 'api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (cause) {
    const err = new Error(cause && cause.name === 'AbortError' ? 'Email API request timed out.' : 'Email API request failed.');
    err.code = 'EMAIL_API_UNREACHABLE';
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(`Email API rejected the message (HTTP ${response.status}${body.message ? `: ${body.message}` : ''}).`);
    err.code = body.code || `EMAIL_API_${response.status}`;
    throw err;
  }
  return { messageId: body.messageId, accepted: [to], provider: 'brevo' };
}

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
    const err = new Error('Email service is not configured (set BREVO_API_KEY, or GMAIL_USER and GMAIL_APP_PASSWORD).');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  if (config.api === 'brevo') return sendWithBrevo(config, { to: recipient, subject, text, html, attachments });
  return getTransport(config).sendMail({ from: config.from, to: recipient, subject, text, html, attachments });
}

module.exports = { sendEmail, isEmailConfigured, escapeHtml, EMAIL_PATTERN };
