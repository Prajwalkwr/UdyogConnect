import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { ContactDetails, List, MailLink, Section } from './LegalLayout';
import { SITE_INFO, operatorName } from '../../legal/siteInfo';
import { openPrivacyChoices } from '../../legal/privacyChoices';

export default function PrivacyPolicyPage() {
  const name = operatorName();
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={`This policy explains what personal data ${name} ("we", "us") collects when you use the UdyogConnect marketplace, why we collect it, who we share it with, how long we keep it and the choices and rights you have. We only collect what we need to run the marketplace.`}
    >
      <Section id="who" title="1. Who is responsible for your data">
        <p>
          {name} operates UdyogConnect, an online marketplace in {SITE_INFO.country} that connects customers with independent local
          businesses. We decide how personal data on the platform is used and are responsible for it. Each business you buy from also
          receives the details it needs to fulfil your order or booking, and is responsible for how it uses them.
        </p>
        <ContactDetails />
      </Section>

      <Section id="collect" title="2. What we collect">
        <p><strong>Account details.</strong> Your name, email address, phone number and password when you register. We store your password only as a one-way hash (bcrypt); we cannot see it. A profile photo is optional.</p>
        <p><strong>Business sellers.</strong> Business name, category, location, opening hours, contact email and phone, description and delivery settings. To be listed you must upload a business registration document for our team to review. Registration and PAN/VAT numbers are optional. Documents and tax numbers are used only to review your application and are not shown on your public profile or in public listings.</p>
        <p><strong>Orders and bookings.</strong> The delivery name, email, phone and address you enter at checkout, the items, prices and totals, your payment method and payment transaction IDs, and booking dates and times. You can also save up to 10 delivery addresses.</p>
        <p><strong>Things you post.</strong> Reviews (rating, comment, optional photo), reports, chat messages and attachments with businesses, and support requests.</p>
        <p><strong>Security records.</strong> For each of your last 10 sign-ins we keep the date, time, IP address and browser type, to protect your account. Our servers also keep short-lived technical logs of requests.</p>
        <p><strong>Location (only if you allow it).</strong> If you let your browser share your location, we use it to show nearby businesses and distances. We do not save your location to your account or our database.</p>
        <p><strong>Personalisation (only if you allow it).</strong> If you choose “Allow personalisation”, we record which businesses and products you view, linked to your account or to a random ID stored in your browser, to recommend similar places. These records are deleted automatically after 90 days, and you can reset them at any time.</p>
        <p><strong>AI assistant.</strong> The questions you ask the UdyogConnect AI assistant. Your recent chat is kept only in your current browser tab.</p>
        <p>We do not collect your date of birth, gender, citizenship or national ID number, or card numbers. Card payments, if offered, are entered on the payment provider’s page, not ours.</p>
      </Section>

      <Section id="use" title="3. Why we use it">
        <List items={[
          'To create and secure your account, and to let you sign in and reset your password.',
          'To take orders and bookings, pass them to the business, generate official bills on our server and send them by email.',
          'To verify payments with eSewa (or the card provider, if enabled) before an order is marked as paid.',
          'To review business registrations before a business is listed.',
          'To show reviews, run chat between customers and businesses, and handle reports and support requests.',
          'To show nearby businesses (only with location permission) and personalised recommendations (only with your permission).',
          'To answer your questions in the AI assistant.',
          'To prevent fraud and abuse, keep the platform secure and meet our legal obligations.',
        ]} />
        <p>We rely on your consent for optional features (location, personalisation), and on what is necessary to provide the service you asked for, to keep it secure and to comply with law for everything else. We do not sell your personal data and we do not use it for third-party advertising.</p>
      </Section>

      <Section id="share" title="4. Who we share it with">
        <List items={[
          <><strong>Businesses you order from or book with</strong> receive your name, phone number, email and delivery address for that order or booking.</>,
          <><strong>The public</strong> can see the name on your reviews and your review content, and public business profile details.</>,
          <><strong>eSewa</strong> receives the amount and transaction ID when you pay with eSewa. <strong>Stripe</strong> receives your email and order amount if card payment is enabled.</>,
          <><strong>Cloudinary</strong> stores uploaded images and documents.</>,
          <><strong>Email providers</strong> (Brevo or our SMTP email provider) deliver password reset emails, bills and order emails.</>,
          <><strong>OpenAI</strong> receives the text of your AI assistant questions, together with public marketplace information, to write answers. We do not send your name, email or exact location.</>,
          <><strong>Hosting providers</strong> (Render for our server, Vercel for the website, and our database host) store and process data on our behalf.</>,
          <><strong>OpenStreetMap</strong> loads the map on business profile pages, which shares your IP address with it. The Google Maps directions link only opens if you click it.</>,
          <><strong>Authorities</strong> when the law requires it, or to protect the rights and safety of users.</>,
        ]} />
        <p>Some of these providers process data outside {SITE_INFO.country}, for example in the United States or the European Union. We only share what each provider needs for its task.</p>
      </Section>

      <Section id="retention" title="5. How long we keep it">
        <List items={[
          'Account and profile data: while your account is open. When you ask us to close your account, we delete or anonymise it unless we must keep it.',
          'Orders, bills and payment records: as long as Nepalese tax and accounting law requires.',
          'Personalisation view records: 90 days, or sooner if you reset them or turn personalisation off.',
          'Sign-in records: only your last 10 sign-ins.',
          'AI assistant chat: only in your browser tab, cleared when you close it.',
          'Reviews, chat messages and reports: while your account is open, unless removed earlier by you or by moderation.',
        ]} />
      </Section>

      <Section id="rights" title="6. Your choices and rights">
        <p>You can:</p>
        <List items={[
          'see and correct your name, phone, photo and saved addresses in your account;',
          <>turn personalisation on or off at any time in <button type="button" onClick={openPrivacyChoices} className="font-semibold text-[#7E610C] underline underline-offset-2">Privacy choices</button>, and reset your recommendation history from the home page;</>,
          'block location access in your browser settings;',
          'ask us for a copy of your personal data, to correct or delete it, or to close your account;',
          'withdraw consent you have given, without affecting anything done before;',
          'complain to us, and if you are not satisfied, to the relevant authority.',
        ]} />
        <p>To make a request, email <MailLink email={SITE_INFO.grievanceEmail} /> from the email address on your account. We will reply within 30 days.</p>
      </Section>

      <Section id="security" title="7. Security">
        <p>We use HTTPS, hash passwords and password-reset tokens, check permissions on the server for every request, verify payments with the payment provider and limit who can see business documents. No online service is perfectly secure. If a breach affects your personal data, we will tell you and the relevant authorities as the law requires.</p>
      </Section>

      <Section id="children" title="8. Children">
        <p>UdyogConnect is for people aged 18 and over. We do not knowingly collect data from children. If you believe a child has created an account, please contact us and we will delete it.</p>
      </Section>

      <Section id="cookies" title="9. Cookies and browser storage">
        <p>We do not use advertising or analytics cookies. See our <Link to="/cookies" className="font-semibold text-[#7E610C] underline underline-offset-2">Cookie Policy</Link> for the browser storage we use and why.</p>
      </Section>

      <Section id="laws" title="10. Laws we follow">
        <p>We handle personal data in line with the Privacy Act, 2075 (2018) of Nepal and related laws. Where India’s Digital Personal Data Protection Act, 2023 applies to someone using the platform from India, we also respect the rights it gives, including access, correction, erasure, grievance redressal and nominating another person to exercise your rights.</p>
      </Section>

      <Section id="grievance" title="11. Grievance officer and contact">
        <p>
          {SITE_INFO.grievanceOfficer ? `Our grievance officer is ${SITE_INFO.grievanceOfficer}. ` : ''}
          For privacy questions, requests or complaints, email <MailLink email={SITE_INFO.grievanceEmail} />.
        </p>
      </Section>

      <Section id="changes" title="12. Changes to this policy">
        <p>If we change this policy in a way that matters, we will update the date at the top and tell you on the site or by email before the change takes effect. Where the law requires it, we will ask for your consent again.</p>
      </Section>
    </LegalLayout>
  );
}
