const DEFAULT_SUPPORT_EMAIL = 'support@udyogconnect.np';

const clean = (value, max = 120) => String(value || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);

/** UdyogConnect's own customer care details. Set them on the server (Render) so they can change without a deploy. */
function getSupportContact() {
  return {
    kind: 'support',
    title: 'UdyogConnect Customer Care',
    email: clean(process.env.SUPPORT_EMAIL) || DEFAULT_SUPPORT_EMAIL,
    phone: clean(process.env.SUPPORT_PHONE, 40),
    whatsapp: clean(process.env.SUPPORT_WHATSAPP, 40),
    hours: clean(process.env.SUPPORT_HOURS),
    address: clean(process.env.SUPPORT_ADDRESS, 200),
  };
}

module.exports = { getSupportContact, DEFAULT_SUPPORT_EMAIL };
