import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { ContactDetails, List, MailLink, Section } from './LegalLayout';
import { SITE_INFO, operatorName } from '../../legal/siteInfo';

const linkClass = 'font-semibold text-[#7E610C] underline underline-offset-2';

export default function TermsPage() {
  const name = operatorName();
  return (
    <LegalLayout
      title="Terms & Conditions"
      intro={`These terms apply when you use UdyogConnect, operated by ${name}. By creating an account or placing an order you agree to them. Please read them together with our Privacy Policy and Refund Policy.`}
    >
      <Section id="service" title="1. What UdyogConnect is">
        <p>
          UdyogConnect is a marketplace that helps you find independent local businesses and buy their products or book their services.
          The businesses are not owned or run by us. When you place an order or booking, your contract for the product or service is with
          that business. We provide the platform, generate the bill and, for eSewa payments, verify the payment with eSewa before an
          order is marked as paid.
        </p>
      </Section>

      <Section id="accounts" title="2. Accounts">
        <List items={[
          'You must be at least 18 years old to create an account.',
          'Give accurate details and keep them up to date. One person or business per account.',
          'Keep your password private. You are responsible for activity on your account; tell us straight away if you think someone else has used it.',
          'We may suspend or close accounts that break these terms or the law, or that put other users at risk.',
        ]} />
      </Section>

      <Section id="orders" title="3. Orders, prices and payments">
        <List items={[
          'Businesses set their own prices, discounts, delivery fees and stock. The amount you pay is the total calculated on our server from the business’s current prices when you place the order; prices changed in your browser are ignored.',
          'Payment options depend on the business: cash on delivery or pickup, eSewa paid directly to the business, scanning the business’s own QR code, and card payment where we have enabled it.',
          'An eSewa order is only marked as paid after eSewa confirms the payment. For QR payments, the business confirms that it received your money.',
          'Bills show VAT as calculated by the platform. Each business is responsible for its own tax registration and for issuing tax invoices where the law requires.',
          'You can cancel an order from your dashboard while it is still placed or accepted. A business may reject an order it cannot fulfil. Refunds are covered by our Refund Policy.',
          'Service bookings depend on the business’s availability. You can cancel a booking from your dashboard; the business confirms, completes or rejects it.',
        ]} />
      </Section>

      <Section id="deals" title="4. Deals">
        <p>Discounts are set by each business and stay in place until the business changes them or the item sells out. “Top Local Deals” lists the largest discounts currently available; it is not a limited-time offer unless the business says so.</p>
      </Section>

      <Section id="sellers" title="5. Rules for businesses">
        <List items={[
          'Your business must be real and lawfully operating, and the documents you upload must be genuine and yours.',
          'Describe products and services accurately, including prices, discounts, stock, opening hours and delivery areas, and honour the orders you accept.',
          'Only upload photos, logos and text that you own or have permission to use.',
          'Do not list illegal, counterfeit, stolen, dangerous or age-restricted items, or anything the law does not allow you to sell.',
          'Handle customer data only to fulfil orders and bookings, keep it secure, and do not use it for marketing without the customer’s consent.',
          'You are responsible for your own licences, taxes (including VAT and PAN registration), refunds you owe and customer service.',
        ]} />
        <p>
          A “Verified” badge means our team reviewed the registration document the business submitted and approved the listing. It is not a guarantee
          of quality, an endorsement, or a promise that every detail on the profile is correct.
        </p>
      </Section>

      <Section id="reviews" title="6. Reviews and content you post">
        <List items={[
          'Reviews must describe your own genuine experience with the business. Do not post reviews in exchange for payment, discounts or gifts, and do not review your own business or a competitor’s.',
          'Do not post anything unlawful, abusive, hateful, misleading, or that shares someone else’s personal information.',
          'Your name is shown with your review. You keep ownership of what you post, and you give us permission to display it on UdyogConnect for as long as it is published.',
          'We may remove content or accounts that break these rules. Business ratings are calculated only from published customer reviews.',
        ]} />
        <p>To report a review, listing or message, use the report button or email <MailLink />.</p>
      </Section>

      <Section id="ip" title="7. Intellectual property and takedowns">
        <p>The UdyogConnect name, design and software belong to {name}. Business listings, photos and descriptions belong to the businesses that posted them. If you believe something on UdyogConnect infringes your copyright or trademark, email <MailLink /> with the link, proof of your rights and your contact details, and we will review it promptly.</p>
      </Section>

      <Section id="ai" title="8. AI assistant and recommendations">
        <p>The AI assistant and the recommendations on the home page help you search. Rankings such as “cheapest” or “highest rated” are calculated from current marketplace data, but answers can still be incomplete or out of date. Always check the price, availability and details on the business page before ordering.</p>
      </Section>

      <Section id="liability" title="9. Our responsibility">
        <p>
          We work to keep UdyogConnect available, accurate and secure, but we cannot promise it will always be uninterrupted or error-free.
          Businesses are responsible for their products, services, prices and delivery. To the extent the law allows, we are not liable for
          indirect or consequential losses, or for the acts of businesses or other users. Nothing in these terms limits rights you have under
          the Consumer Protection Act, 2075 (2018) of Nepal or any other law that cannot be excluded.
        </p>
      </Section>

      <Section id="law" title="10. Governing law and complaints">
        <p>These terms are governed by the laws of {SITE_INFO.country}. Please contact us first so we can try to resolve any problem. If we cannot, disputes will be handled by the competent courts of {SITE_INFO.country}.</p>
      </Section>

      <Section id="changes" title="11. Changes">
        <p>We may update these terms. If a change matters, we will update the date above and tell you before it takes effect. Continuing to use UdyogConnect after that means you accept the new terms.</p>
      </Section>

      <Section id="contact" title="12. Contact">
        <ContactDetails />
        <p className="text-sm">See also: <Link to="/privacy" className={linkClass}>Privacy Policy</Link> · <Link to="/refunds" className={linkClass}>Refund Policy</Link> · <Link to="/cookies" className={linkClass}>Cookie Policy</Link></p>
      </Section>
    </LegalLayout>
  );
}
