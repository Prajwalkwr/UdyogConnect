import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout, { MailLink, Section } from './LegalLayout';
import { openPrivacyChoices } from '../../legal/privacyChoices';

const STORAGE = [
  { name: 'token, user', where: 'Session storage', purpose: 'Keeps you signed in and remembers your basic account details for this browser tab.', kept: 'Until you sign out or close the tab', type: 'Essential' },
  { name: 'cart:…', where: 'Local storage', purpose: 'Remembers the items in your cart.', kept: 'Until you empty your cart or clear browser data', type: 'Essential' },
  { name: 'uc-privacy-choice', where: 'Local storage', purpose: 'Remembers whether you allowed personalisation, so we do not ask again on every page.', kept: 'Until you change it or clear browser data', type: 'Essential' },
  { name: 'uc-hero-image', where: 'Local storage', purpose: 'Caches the home page banner address so the page loads faster. Contains no personal data.', kept: 'Until replaced', type: 'Essential' },
  { name: 'udyog_ai_chat:…', where: 'Session storage', purpose: 'Keeps your recent AI assistant conversation while the tab is open.', kept: 'Until you close the tab', type: 'Functional' },
  { name: 'udyog_visitor_id', where: 'Local storage', purpose: 'A random ID that links your product and business views so we can personalise recommendations. Created only if you allow personalisation.', kept: 'Until you turn personalisation off or clear browser data; view records are deleted after 90 days', type: 'Personalisation (optional)' },
];

const cell = 'border-b border-[var(--mp-border)] px-3 py-2.5 align-top';

export default function CookiePolicyPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      intro="UdyogConnect does not set cookies and does not use advertising, analytics or social media trackers. We use a small amount of browser storage (local storage and session storage) to make the site work, and one optional item for personalised recommendations that we only create if you allow it."
    >
      <Section id="storage" title="1. What we store in your browser">
        <div className="overflow-x-auto rounded-2xl border border-[var(--mp-border)] bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Browser storage used by UdyogConnect</caption>
            <thead className="bg-[var(--mp-cream)] text-[var(--mp-ink)]">
              <tr>
                <th scope="col" className={cell}>Name</th>
                <th scope="col" className={cell}>Where</th>
                <th scope="col" className={cell}>Purpose</th>
                <th scope="col" className={cell}>How long</th>
                <th scope="col" className={cell}>Type</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE.map((row) => (
                <tr key={row.name}>
                  <td className={`${cell} font-mono text-xs`}>{row.name}</td>
                  <td className={cell}>{row.where}</td>
                  <td className={cell}>{row.purpose}</td>
                  <td className={cell}>{row.kept}</td>
                  <td className={cell}>{row.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="consent" title="2. Do we ask for consent?">
        <p>
          Essential storage is needed for sign-in, your cart and remembering your choice, so it is always on. Personalisation is optional:
          when you first visit we ask whether to allow it, and nothing is tracked until you choose “Allow personalisation”.
          Choosing “Essential only” works just as well for browsing and ordering.
        </p>
        <p>
          You can change your mind at any time in{' '}
          <button type="button" onClick={openPrivacyChoices} className="font-semibold text-[#7E610C] underline underline-offset-2">Privacy choices</button>
          {' '}(also linked in the footer). Turning personalisation off deletes the browser ID and asks our server to delete your view history.
        </p>
      </Section>

      <Section id="third-parties" title="3. Content loaded from other services">
        <p>Some pages load content from other services. Like any website, they can see your IP address and browser type when they deliver it, and they handle that under their own privacy policies.</p>
        <ul className="list-disc space-y-1.5 pl-6">
          <li><strong>OpenStreetMap</strong>: the map on business profile pages.</li>
          <li><strong>Cloudinary</strong>: business, product and review photos.</li>
          <li><strong>Unsplash</strong>: the default home page banner photo.</li>
          <li><strong>eSewa</strong> or <strong>Stripe</strong>: only when you choose to pay with them, on their own pages.</li>
        </ul>
        <p>Our fonts are served from our own website, not from Google.</p>
      </Section>

      <Section id="control" title="4. Controlling browser storage">
        <p>You can delete local and session storage at any time in your browser’s settings (usually under “Site data” or “Cookies and site data”). This will sign you out and empty your cart.</p>
      </Section>

      <Section id="contact" title="5. Questions">
        <p>Email <MailLink />. For how we use personal data in general, see our <Link to="/privacy" className="font-semibold text-[#7E610C] underline underline-offset-2">Privacy Policy</Link>.</p>
      </Section>
    </LegalLayout>
  );
}
