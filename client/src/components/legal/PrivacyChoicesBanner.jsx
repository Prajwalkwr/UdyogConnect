import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  OPEN_PRIVACY_CHOICES_EVENT,
  getPrivacyChoice,
  setPrivacyChoice,
} from '../../legal/privacyChoices';
import { resetRecommendationHistory } from '../../utils/aiAssistant';

const buttonClass = 'flex-1 rounded-full px-4 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-brown)]';

export default function PrivacyChoicesBanner() {
  const [open, setOpen] = useState(() => getPrivacyChoice() === null);
  const [saving, setSaving] = useState(false);
  const headingRef = useRef(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, show);
    return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, show);
  }, []);

  useEffect(() => {
    if (open && getPrivacyChoice() !== null) headingRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const choose = async (personalization) => {
    if (saving) return;
    setSaving(true);
    // Delete server-side view history while the visitor ID still exists, then forget the ID.
    if (!personalization && getPrivacyChoice()?.personalization) await resetRecommendationHistory();
    setPrivacyChoice(personalization);
    setSaving(false);
    setOpen(false);
  };

  return (
    <section
      role="region"
      aria-labelledby="privacy-choices-title"
      className="fixed bottom-4 left-4 right-4 z-[70] max-w-md rounded-3xl border border-[var(--mp-border)] bg-white p-5 shadow-2xl sm:right-auto"
    >
      <h2 id="privacy-choices-title" ref={headingRef} tabIndex={-1} className="text-base font-bold text-[var(--mp-ink)] outline-none">
        Your privacy choices
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#3d3128]">
        We don’t use cookies, ads or analytics trackers. If you allow personalisation, we remember which businesses and products
        you view for 90 days to recommend places you may like. You can change this at any time.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => choose(false)}
          disabled={saving}
          className={`${buttonClass} border border-[var(--mp-brown)] bg-white text-[var(--mp-brown)] hover:bg-[var(--mp-cream)]`}
        >
          Essential only
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          disabled={saving}
          className={`${buttonClass} border border-[var(--mp-brown)] bg-[var(--mp-brown)] text-white hover:bg-[var(--mp-brown-deep)]`}
        >
          Allow personalisation
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--mp-muted)]">
        Read our <Link to="/cookies" className="font-semibold text-[#7E610C] underline underline-offset-2">Cookie Policy</Link> and{' '}
        <Link to="/privacy" className="font-semibold text-[#7E610C] underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </section>
  );
}
