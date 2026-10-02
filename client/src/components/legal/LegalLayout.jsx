import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SITE_INFO, POLICY_EFFECTIVE_DATE, operatorName } from '../../legal/siteInfo';

export const LEGAL_LINKS = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms & Conditions' },
  { to: '/cookies', label: 'Cookie Policy' },
  { to: '/refunds', label: 'Refund Policy' },
  { to: '/about', label: 'About & Contact' },
];

export function Section({ id, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mt-8 text-xl font-bold text-[var(--mp-ink)]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#3d3128]">{children}</div>
    </section>
  );
}

export function List({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-6">
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </ul>
  );
}

export function MailLink({ email = SITE_INFO.email }) {
  return <a className="font-semibold text-[#7E610C] underline underline-offset-2 hover:text-[var(--mp-brown)]" href={`mailto:${email}`}>{email}</a>;
}

/** Only the operator details that have actually been configured are shown. */
export function ContactDetails() {
  const rows = [
    ['Operator', operatorName()],
    ['Registration number', SITE_INFO.registrationNumber],
    ['PAN / VAT number', SITE_INFO.panVat],
    ['Address', SITE_INFO.address],
    ['Email', SITE_INFO.email && <MailLink />],
    ['Phone', SITE_INFO.phone && <a className="font-semibold text-[#7E610C] underline underline-offset-2" href={`tel:${SITE_INFO.phone.replace(/\s+/g, '')}`}>{SITE_INFO.phone}</a>],
    ['Support hours', SITE_INFO.hours],
  ].filter(([, value]) => value);

  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-2xl border border-[var(--mp-border)] bg-white p-5 text-[15px] sm:grid-cols-[auto_1fr]">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="font-semibold text-[var(--mp-ink)]">{label}</dt>
          <dd className="text-[#3d3128]">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export default function LegalLayout({ title, intro, children, showEffectiveDate = true }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${SITE_INFO.brand}`;
    window.scrollTo(0, 0);
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="min-h-screen bg-[var(--mp-cream)] px-4 py-10 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-6 shadow-[var(--shadow-sm)] sm:p-10">
        <nav aria-label="Legal pages" className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="font-semibold text-[#7E610C] underline-offset-2 hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
        <h1 className="text-3xl font-bold text-[var(--mp-ink)] sm:text-4xl">{title}</h1>
        {showEffectiveDate && (
          <p className="mt-2 text-sm text-[var(--mp-muted)]">Effective {POLICY_EFFECTIVE_DATE}</p>
        )}
        {intro && <p className="mt-5 text-[15px] leading-7 text-[#3d3128]">{intro}</p>}
        {children}
      </article>
    </div>
  );
}
