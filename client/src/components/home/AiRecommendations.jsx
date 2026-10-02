import React, { useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { FiArrowRight, FiHelpCircle, FiRotateCcw, FiX } from 'react-icons/fi';
import { Bot, Sparkles } from 'lucide-react';
import BusinessRecCard from './BusinessRecCard';
import { AI_MESSAGES, fetchHomeSummary, openAssistant, resetRecommendationHistory } from '../../utils/aiAssistant';

const SLOTS = [
  { key: 'forYou', label: 'Recommended for You' },
  { key: 'nearYou', label: 'Based on Your Location' },
  { key: 'alsoViewed', label: 'People Also Viewed' },
  { key: 'trending', label: 'Trending in Your Area' },
  { key: 'newLocal', label: 'New Local Business' },
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function HowItWorks({ feed, user, onClose, onReset }) {
  const ref = useRef(null);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const s = feed?.signals || {};
  const place = feed?.location?.label || 'your area';
  const locationSource = {
    gps: 'your current location',
    area: 'the location you entered',
    profile: 'your saved address',
    orders: 'your last delivery address',
    default: 'Kathmandu (default)',
  }[feed?.location?.source] || 'your area';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="How recommendations work"
      className="absolute right-0 top-8 z-30 w-[min(340px,85vw)] rounded-2xl border border-[var(--mp-border)] bg-white p-4 text-left text-xs leading-relaxed text-[var(--mp-ink)] shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">How recommendations work</p>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-[var(--mp-muted)] hover:bg-slate-100" aria-label="Close">
          <FiX />
        </button>
      </div>
      <ul className="space-y-1.5 text-[var(--mp-muted)]">
        <li><b className="text-[var(--mp-ink)]">Recommended for You</b> matches the kinds of places you order from, book, save, review and view.</li>
        <li><b className="text-[var(--mp-ink)]">Based on Your Location</b> shows the closest businesses to {place}, using {locationSource}.</li>
        <li><b className="text-[var(--mp-ink)]">People Also Viewed</b> comes from shoppers who liked the same places as you.</li>
        <li><b className="text-[var(--mp-ink)]">Trending in Your Area</b> ranks businesses by this week&apos;s orders, bookings, reviews, saves and views.</li>
        <li><b className="text-[var(--mp-ink)]">New Local Business</b> promotes businesses that joined in the last 30 days, newest and closest first.</li>
      </ul>
      <p className="mt-3 rounded-xl bg-[var(--mp-cream)] px-3 py-2 text-[11px] text-[var(--mp-brown)]">
        {user
          ? `Your picks use ${plural(s.orders || 0, 'order')}, ${plural(s.bookings || 0, 'booking')}, ${s.saved || 0} saved, ${plural(s.reviews || 0, 'review')} and ${plural(s.views || 0, 'recent view')}.`
          : 'Browsing as a guest: picks use what you view on this device. Sign in to include your orders, bookings and wishlist.'}
      </p>
      <p className="mt-2 text-[10px] text-[var(--mp-muted)]">Only live, admin-approved businesses are recommended. We never use sensitive personal details.</p>
      <button
        type="button"
        disabled={resetting}
        onClick={async () => {
          setResetting(true);
          await onReset();
          setResetting(false);
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--mp-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--mp-brown)] transition hover:border-[var(--mp-gold)] hover:text-[var(--mp-gold)] disabled:opacity-50"
      >
        <FiRotateCcw /> {resetting ? 'Resetting…' : 'Reset my recommendation history'}
      </button>
      <p className="mt-1 text-[10px] text-[var(--mp-muted)]">Clears the pages you viewed. Orders, bookings and saved businesses stay in your account.</p>
    </div>
  );
}

/** Optional one-line AI intro. The section works the same without it. */
function useAiSummary({ area, coords, userId, enabled }) {
  const [state, setState] = useState({ status: 'idle', summary: null });
  const lat = coords?.lat;
  const lng = coords?.lng;
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: 'loading' }));
    const timer = setTimeout(() => {
      fetchHomeSummary({ area, coords: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null, signal: controller.signal })
        .then((result) => !controller.signal.aborted && setState(result));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [area, lat, lng, userId, enabled]);
  return state;
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-[#ece3d6]" />)}
    </div>
  );
}

export default function AiRecommendations({ feed, status, user, onOpenBusiness, onToggleSave, isSaved, onRetry, area = '', coords = null }) {
  const [expanded, setExpanded] = useState(false);
  const [activeSlot, setActiveSlot] = useState('forYou');
  const [showHelp, setShowHelp] = useState(false);
  const highlights = feed?.highlights || [];
  const recommendations = feed?.recommendations || {};
  const aiSummary = useAiSummary({ area, coords, userId: user?._id || user?.id || '', enabled: highlights.length > 0 });

  const resetHistory = async () => {
    const result = await resetRecommendationHistory();
    Swal.fire({ icon: result.ok ? 'success' : 'error', title: result.message });
    if (result.ok) {
      setShowHelp(false);
      onRetry?.();
    }
  };

  const openAll = (slot = activeSlot) => {
    setActiveSlot(slot);
    setExpanded(true);
  };

  return (
    <section className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby="ai-recs-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ai-recs-title" className="flex items-center gap-2 text-lg font-bold text-[var(--mp-ink)]">
            <Sparkles className="uc-sparkle h-5 w-5 text-[var(--mp-gold)]" /> Udyog Recommends
          </h2>
          <p className="mt-0.5 text-xs text-[var(--mp-muted)]">
            {feed?.personalized
              ? 'Personalized picks just for you based on your interests, location and activity.'
              : 'Picks based on your location and what shoppers love right now. They get smarter as you explore.'}
          </p>
          {aiSummary.status === 'ai' && aiSummary.summary && (
            <p className="mt-2 flex max-w-2xl items-start gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs text-[var(--mp-brown)]">
              <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mp-gold)]" /> {aiSummary.summary}
            </p>
          )}
          {aiSummary.status === 'unavailable' && (
            <p className="mt-2 text-[11px] text-[var(--mp-muted)]">{AI_MESSAGES.recommendationsUnavailable}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHelp((open) => !open)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--mp-brown)] hover:text-[var(--mp-gold)]"
              aria-expanded={showHelp}
            >
              <FiHelpCircle /> How it works?
            </button>
            {showHelp && <HowItWorks feed={feed} user={user} onClose={() => setShowHelp(false)} onReset={resetHistory} />}
          </div>
          {highlights.length > 0 && (
            <button
              type="button"
              onClick={() => (expanded ? setExpanded(false) : openAll('forYou'))}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--mp-gold-ink)] hover:text-[var(--mp-brown)]"
            >
              {expanded ? 'Show less' : 'View All'} <FiArrowRight />
            </button>
          )}
        </div>
      </div>

      {status === 'loading' && !feed && <SkeletonCards />}

      {status === 'error' && !feed && (
        <div className="rounded-2xl bg-white py-8 text-center text-sm text-[var(--mp-muted)]">
          Recommendations could not be loaded.
          <button type="button" onClick={onRetry} className="ml-2 font-bold text-[var(--mp-gold-ink)] hover:underline">Retry</button>
        </div>
      )}

      {feed && highlights.length === 0 && (
        <p className="rounded-2xl bg-white py-8 text-center text-sm text-[var(--mp-muted)]">
          Recommendations will appear here as soon as local businesses are listed.
        </p>
      )}

      {feed && highlights.length > 0 && !expanded && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {highlights.map((item) => (
            <BusinessRecCard
              key={item.slot}
              business={item.business}
              tag={item.label}
              tagKey={item.slot}
              saved={isSaved(item.business._id)}
              onOpen={onOpenBusiness}
              onToggleSave={onToggleSave}
            />
          ))}
          <div className={`${highlights.length % 2 ? 'col-span-1' : 'col-span-2'} flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef2ff] to-[#f5f0ff] p-4 text-center md:col-span-1`}>
            <span className="uc-bot" aria-hidden>
              <span className="uc-bot-ring" />
              <span className="uc-bot-ring" />
              <span className="uc-bot-tile flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                <Bot className="uc-bot-icon h-6 w-6" />
                <span className="uc-bot-live" />
              </span>
            </span>
            <p className="mt-2 text-xs font-bold text-indigo-700">Udyog Sathi</p>
            <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
              Ask in your own words, like &quot;a quiet cafe near me&quot; or &quot;electronics under NPR 5000&quot;.
            </p>
            <button
              type="button"
              onClick={() => openAssistant()}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-1.5 text-[11px] font-bold text-white transition hover:bg-indigo-700"
            >
              Ask UdyogConnect AI
            </button>
            <button
              type="button"
              onClick={() => openAll('forYou')}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
            >
              Explore More <FiArrowRight />
            </button>
          </div>
        </div>
      )}

      {feed && highlights.length > 0 && expanded && (
        <div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Recommendation types">
            {SLOTS.map((slot) => (
              <button
                key={slot.key}
                type="button"
                role="tab"
                aria-selected={activeSlot === slot.key}
                onClick={() => setActiveSlot(slot.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  activeSlot === slot.key
                    ? 'border-[var(--mp-gold)] bg-[var(--mp-gold)] text-[var(--mp-ink)]'
                    : 'border-[var(--mp-border)] bg-white text-[var(--mp-brown)] hover:border-[var(--mp-gold)]'
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>
          {(recommendations[activeSlot] || []).length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {recommendations[activeSlot].map((business) => (
                <BusinessRecCard
                  key={business._id}
                  business={business}
                  saved={isSaved(business._id)}
                  onOpen={onOpenBusiness}
                  onToggleSave={onToggleSave}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-white py-8 text-center text-sm text-[var(--mp-muted)]">Nothing to show here yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
