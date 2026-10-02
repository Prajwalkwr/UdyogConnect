/**
 * Public operator details shown on the legal, About and Contact pages.
 * These are public business facts (not secrets), set per deployment with VITE_ variables.
 * Leave a value empty rather than inventing one; empty values are simply not shown.
 */
const env = import.meta.env;
const clean = (value) => String(value || '').trim();

export const SITE_INFO = {
  brand: 'UdyogConnect',
  legalName: clean(env.VITE_LEGAL_NAME),
  registrationNumber: clean(env.VITE_LEGAL_REGISTRATION_NO),
  panVat: clean(env.VITE_LEGAL_PAN_VAT),
  address: clean(env.VITE_LEGAL_ADDRESS),
  email: clean(env.VITE_SUPPORT_EMAIL) || 'support@udyogconnect.np',
  phone: clean(env.VITE_SUPPORT_PHONE),
  hours: clean(env.VITE_SUPPORT_HOURS),
  grievanceOfficer: clean(env.VITE_GRIEVANCE_OFFICER_NAME),
  grievanceEmail: clean(env.VITE_GRIEVANCE_EMAIL) || clean(env.VITE_SUPPORT_EMAIL) || 'support@udyogconnect.np',
  country: 'Nepal',
};

/** Must match server/legal/policy.js. */
export const POLICY_VERSION = '2026-10-02';
export const POLICY_EFFECTIVE_DATE = '2 October 2026';

export const operatorName = () => SITE_INFO.legalName || SITE_INFO.brand;
