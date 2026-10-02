import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { ContactDetails, List, MailLink, Section } from './LegalLayout';
import { SITE_INFO, operatorName } from '../../legal/siteInfo';

const linkClass = 'font-semibold text-[#7E610C] underline underline-offset-2';

export default function AboutContactPage() {
  return (
    <LegalLayout
      title="About & Contact"
      showEffectiveDate={false}
      intro={`UdyogConnect is an online marketplace operated by ${operatorName()} that helps people in ${SITE_INFO.country} find local shops, restaurants and service providers, order from them and book appointments.`}
    >
      <Section id="how" title="How UdyogConnect works">
        <List items={[
          'Businesses register, upload a business registration document and are reviewed by our team before they appear on the marketplace.',
          'Customers browse, order products or book services. Each order goes to the business, which prepares, delivers or hands it over.',
          'Prices are set by the businesses. Your bill is calculated on our server from their current prices.',
          'Payments are made by cash on delivery or pickup, by eSewa or a QR code paid directly to the business, or by card where enabled.',
          'Ratings come only from reviews posted by signed-in customers.',
        ]} />
      </Section>

      <Section id="contact" title="Contact us">
        <ContactDetails />
        <p>For help with an order, first message the business through chat on its profile page. For anything else, including account, privacy or safety concerns, email <MailLink />.</p>
        <p>To report a listing, review or message, use its report button.</p>
      </Section>

      <Section id="policies" title="Policies">
        <p>
          <Link to="/terms" className={linkClass}>Terms & Conditions</Link> · <Link to="/privacy" className={linkClass}>Privacy Policy</Link> ·{' '}
          <Link to="/cookies" className={linkClass}>Cookie Policy</Link> · <Link to="/refunds" className={linkClass}>Refund Policy</Link>
        </p>
      </Section>
    </LegalLayout>
  );
}
