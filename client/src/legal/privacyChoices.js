import { POLICY_VERSION } from './siteInfo';

const CHOICE_KEY = 'uc-privacy-choice';
const VISITOR_KEY = 'udyog_visitor_id';
export const PRIVACY_CHOICE_EVENT = 'udyog:privacy-choice';
export const OPEN_PRIVACY_CHOICES_EVENT = 'udyog:open-privacy-choices';

/** Returns { personalization: boolean, decidedAt, version } or null when the visitor has not chosen yet. */
export function getPrivacyChoice() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CHOICE_KEY) || 'null');
    if (!stored || typeof stored.personalization !== 'boolean') return null;
    return stored;
  } catch {
    return null;
  }
}

/** View tracking and the anonymous visitor ID are off until the visitor opts in. */
export function personalizationAllowed() {
  return getPrivacyChoice()?.personalization === true;
}

export function setPrivacyChoice(personalization) {
  if (typeof window === 'undefined') return;
  const choice = { personalization: Boolean(personalization), decidedAt: new Date().toISOString(), version: POLICY_VERSION };
  try {
    window.localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
    if (!choice.personalization) window.localStorage.removeItem(VISITOR_KEY);
  } catch {
    // Storage can be unavailable (private mode); the banner will simply ask again.
  }
  window.dispatchEvent(new CustomEvent(PRIVACY_CHOICE_EVENT, { detail: choice }));
}

export function openPrivacyChoices() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT));
}
