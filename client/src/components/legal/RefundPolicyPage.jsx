import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { List, MailLink, Section } from './LegalLayout';
import { SITE_INFO } from '../../legal/siteInfo';

const linkClass = 'font-semibold text-[#7E610C] underline underline-offset-2';

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      intro="Products and services on UdyogConnect are sold by independent local businesses, and most payments go directly to the business. This policy explains how cancellations and refunds work and what we do to help if something goes wrong."
    >
      <Section id="cancel-orders" title="1. Cancelling an order">
        <List items={[
          'You can cancel an order yourself from your dashboard while its status is “placed” or “accepted”.',
          'Once the business starts preparing or dispatching the order, it can no longer be cancelled online. Contact the business through chat straight away; it may still agree to cancel.',
          'A business can reject an order it cannot fulfil, for example if an item is out of stock.',
        ]} />
      </Section>

      <Section id="cancel-bookings" title="2. Cancelling a service booking">
        <p>You can cancel a booking from your dashboard before the appointment. Appointments made with the “Book” button are not paid online, so no refund is needed; please cancel as early as you can as a courtesy to the business. If you paid for a service through checkout, the refund rules below apply.</p>
      </Section>

      <Section id="refunds" title="3. Refunds by payment method">
        <List items={[
          <><strong>Cash on delivery or pickup:</strong> you pay nothing until you receive your order, so a cancelled or rejected order needs no refund.</>,
          <><strong>eSewa:</strong> your payment goes to the business’s own eSewa merchant account. If a paid order is cancelled or rejected, the business must refund the full amount to you through eSewa.</>,
          <><strong>QR payment:</strong> you pay the business directly, so the business refunds you by the same method or another method you agree with it.</>,
          <><strong>Card:</strong> where card payment is enabled, refunds go back to the original card through the card payment provider.</>,
        ]} />
        <p>Businesses should issue refunds for cancelled or rejected paid orders within 7 days. The time the money takes to reach you also depends on eSewa, your bank or your card issuer.</p>
      </Section>

      <Section id="problems" title="4. Wrong, damaged, missing or not-as-described items">
        <List items={[
          'Contact the business through chat as soon as possible, ideally within 48 hours of delivery or pickup, with your order number and photos of the problem.',
          'The business may offer a replacement, a repair, a partial refund or a full refund, depending on the problem.',
          'Perishable goods (such as food and fresh groceries), personalised items and services already performed usually cannot be returned unless they were faulty or not as described.',
        ]} />
      </Section>

      <Section id="help" title="5. If the business does not respond">
        <p>
          If a business does not reply within 3 days, or you cannot agree on a solution, email <MailLink /> with your order number,
          what happened and any photos or messages. We will contact the business and help both sides reach a fair outcome. We can warn,
          suspend or remove businesses that repeatedly fail to refund customers.
        </p>
      </Section>

      <Section id="rights" title="6. Your legal rights">
        <p>This policy does not reduce any rights you have under the Consumer Protection Act, 2075 (2018) or other laws of {SITE_INFO.country}.</p>
        <p className="text-sm">See also: <Link to="/terms" className={linkClass}>Terms & Conditions</Link> · <Link to="/privacy" className={linkClass}>Privacy Policy</Link></p>
      </Section>
    </LegalLayout>
  );
}
