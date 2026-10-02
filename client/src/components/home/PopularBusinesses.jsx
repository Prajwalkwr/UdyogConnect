import React, { useMemo, useState } from 'react';
import { FiArrowRight, FiHome, FiScissors, FiShoppingBag, FiTool } from 'react-icons/fi';
import { UtensilsCrossed } from 'lucide-react';
import BusinessRecCard from './BusinessRecCard';
import { POPULAR_TABS, matchesPopularTab } from '../../utils/categoryGroups';

const TAB_ICONS = {
  restaurants: UtensilsCrossed,
  shops: FiShoppingBag,
  services: FiTool,
  wellness: FiScissors,
  hotels: FiHome,
};

const COLLAPSED_COUNT = 6;

export default function PopularBusinesses({ businesses = [], status, onOpenBusiness, onToggleSave, isSaved }) {
  const [tab, setTab] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(
    () => (tab ? businesses.filter((business) => matchesPopularTab(business, tab)) : businesses),
    [businesses, tab]
  );
  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const tabLabel = POPULAR_TABS.find((item) => item.key === tab)?.label;

  return (
    <section className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-labelledby="popular-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="popular-title" className="text-lg font-bold text-[var(--mp-ink)]">Popular Local Businesses</h2>
          <p className="mt-0.5 text-xs text-[var(--mp-muted)]">Discover local businesses near you</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {POPULAR_TABS.map((item) => {
            const Icon = TAB_ICONS[item.key];
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(active ? null : item.key);
                  setExpanded(false);
                }}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? 'border-[var(--mp-gold)] bg-[var(--mp-gold)] text-[var(--mp-ink)]'
                    : 'border-[var(--mp-border)] bg-white text-[var(--mp-brown)] hover:border-[var(--mp-gold)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setTab(null);
              setExpanded((open) => !(open && !tab));
            }}
            className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--mp-gold-ink)] hover:text-[var(--mp-brown)]"
          >
            {expanded && !tab ? 'Show less' : 'View All'} <FiArrowRight />
          </button>
        </div>
      </div>

      {status === 'loading' && !businesses.length && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-[#ece3d6]" />)}
        </div>
      )}

      {visible.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((business) => (
            <BusinessRecCard
              key={business._id}
              business={business}
              size="lg"
              saved={isSaved(business._id)}
              onOpen={onOpenBusiness}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      ) : (
        status !== 'loading' && (
          <p className="rounded-2xl bg-white py-8 text-center text-sm text-[var(--mp-muted)]">
            {tabLabel ? `No ${tabLabel.toLowerCase()} listed yet.` : 'No businesses listed yet.'}
          </p>
        )
      )}

      {!expanded && filtered.length > COLLAPSED_COUNT && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-full border border-[var(--mp-border)] bg-white px-5 py-2 text-xs font-bold text-[var(--mp-brown)] transition hover:border-[var(--mp-gold)]"
          >
            Show all {filtered.length} {tabLabel ? tabLabel.toLowerCase() : 'businesses'}
          </button>
        </div>
      )}
    </section>
  );
}
