const { formatRs } = require('../billing/billData');
const { sendEmail, isEmailConfigured, escapeHtml, EMAIL_PATTERN } = require('./mailer');

const isBillEmailConfigured = isEmailConfigured;

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

  const { text, html } = buildEmailContent(bill);
  return sendEmail({
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
