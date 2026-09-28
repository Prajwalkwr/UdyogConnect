const nodemailer = require('nodemailer');
const { formatRs } = require('../billing/billData');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedTransport = null;
let cachedTransportKey = '';

function resolveMailConfig() {
  const gmailUser = String(process.env.GMAIL_USER || '').trim();
  // Google displays app passwords in groups of four; spaces are not part of the secret.
  const gmailPass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const fromName = String(process.env.GMAIL_FROM_NAME || 'UdyogConnect').trim() || 'UdyogConnect';

  if (gmailUser && gmailPass) {
    return {
      key: `gmail:${gmailUser}`,
      transport: { service: 'gmail', auth: { user: gmailUser, pass: gmailPass } },
      from: { name: fromName, address: gmailUser },
    };
  }

  // Older setups name the same Gmail App Password settings EMAIL_USER / EMAIL_PASS.
  const legacyUser = String(process.env.EMAIL_USER || '').trim();
  const legacyPass = String(process.env.EMAIL_PASS || '').replace(/\s+/g, '');
  const legacyService = String(process.env.EMAIL_SERVICE || 'gmail').trim().toLowerCase() || 'gmail';
  if (legacyUser && legacyPass) {
    return {
      key: `${legacyService}:${legacyUser}`,
      transport: { service: legacyService, auth: { user: legacyUser, pass: legacyPass } },
      from: { name: fromName, address: legacyUser },
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

function isBillEmailConfigured() {
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

function buildEmailContent(bill) {
  const total = formatRs(bill.totals.total);
  const name = bill.customer.name || 'Customer';
  const text = [
    `Hello ${name},`,
    '',
    'Thank you for placing your order through UdyogConnect.',
    '',
    'Your order has been successfully processed.',
    '',
    'Order ID:',
    bill.orderId,
    '',
    'Bill Number:',
    bill.billNumber,
    '',
    'Total Amount:',
    total,
    '',
    'Payment Status:',
    bill.paymentStatusLabel,
    '',
    'Your official UdyogConnect bill is attached to this email as a PDF.',
    '',
    'Thank you for using UdyogConnect.',
    '',
    'Regards,',
    'UdyogConnect',
    'Local Business Marketplace',
  ].join('\n');

  const row = (label, value, strong = false) => `
    <tr>
      <td style="padding:8px 0;color:#68778c;font-size:13px;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;text-align:right;color:#102341;font-size:13px;${strong ? 'font-weight:700;' : ''}">${escapeHtml(value)}</td>
    </tr>`;

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
            <p style="margin:0 0 12px;">Hello ${escapeHtml(name)},</p>
            <p style="margin:0 0 12px;">Thank you for placing your order through UdyogConnect.</p>
            <p style="margin:0 0 18px;">Your order has been successfully processed.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e5ebf2;border-bottom:1px solid #e5ebf2;margin-bottom:18px;">
              ${row('Order ID', bill.orderId)}
              ${row('Bill Number', bill.billNumber, true)}
              ${row('Total Amount', total, true)}
              ${row('Payment Status', bill.paymentStatusLabel, true)}
            </table>
            <p style="margin:0 0 12px;">Your official UdyogConnect bill is attached to this email as a PDF.</p>
            <p style="margin:0 0 18px;">Thank you for using UdyogConnect.</p>
            <p style="margin:0;">Regards,<br><strong>UdyogConnect</strong><br><span style="color:#68778c;">Local Business Marketplace</span></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

/**
 * Emails the bill PDF to the customer. Throws on any failure so callers can record it;
 * it never marks anything as sent itself.
 */
async function sendBillEmail({ to, bill, pdfBuffer }) {
  const recipient = String(to || '').trim();
  if (!EMAIL_PATTERN.test(recipient)) {
    const err = new Error('Customer email address is missing or invalid.');
    err.code = 'INVALID_RECIPIENT';
    throw err;
  }
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new Error('Bill PDF is empty.');
  }
  const config = resolveMailConfig();
  if (!config) {
    const err = new Error('Email service is not configured (set GMAIL_USER and GMAIL_APP_PASSWORD).');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const { text, html } = buildEmailContent(bill);
  return getTransport(config).sendMail({
    from: config.from,
    to: recipient,
    subject: `UdyogConnect Bill - Order ${bill.orderId}`,
    text,
    html,
    attachments: [{
      filename: `UdyogConnect-Bill-${bill.billNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}

module.exports = { sendBillEmail, isBillEmailConfigured, buildEmailContent };
