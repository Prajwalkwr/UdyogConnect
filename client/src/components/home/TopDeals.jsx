import React, { useEffect, useState } from 'react';
import { FiArrowRight, FiClock } from 'react-icons/fi';
import { formatCountdown, formatRupees } from './homeFormat';

const COLLAPSED_COUNT = 3;

export default function TopDeals({ deals, status, onOpenProduct }) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const items = deals?.items || [];
  const endsAt = deals?.endsAt ? new Date(deals.endsAt).getTime() : 0;

  useEffect(() => {
    if (!endsAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const countdown = endsAt ? formatCountdown(endsAt - now) : '';

  return (
    <section id="products" className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)]" aria-labelledby="deals-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="deals-title" className="text-base font-bold text-[var(--mp-ink)]">Top Local Deals</h3>
        {items.length > COLLAPSED_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--mp-gold)] hover:text-[var(--mp-brown)]"
          >
            {expanded ? 'Show less' : 'View All'} <FiArrowRight />
          </button>
        )}
      </div>

      {status === 'loading' && !deals && (
        <div className="space-y-2.5" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-[#ece3d6]" />)}
        </div>
      )}

      <div className="space-y-2.5">
        {visible.map((deal) => (
          <button
            key={deal._id}
            type="button"
            onClick={() => onOpenProduct(deal._id)}
            className="flex w-full items-center gap-3 rounded-2xl border border-[var(--mp-border)] bg-white p-2.5 text-left transition hover:border-[var(--mp-gold)]"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#eee4d6]">
              {deal.image ? (
                <img src={deal.image} alt={deal.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg" aria-hidden>🛍️</div>
              )}
              <span className="absolute left-1 top-1 rounded bg-[#c0392b] px-1.5 py-0.5 text-[9px] font-bold text-white">
                -{deal.discount}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[var(--mp-ink)]">{deal.businessName} Deal</p>
              <p className="truncate text-[10px] text-[var(--mp-muted)]">{deal.name}</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-[var(--mp-ink)]">{formatRupees(deal.finalPrice)}</span>
                <span className="text-[10px] text-[var(--mp-muted)] line-through">{formatRupees(deal.price)}</span>
              </div>
              {countdown && (
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-[var(--mp-gold)]" title="Deals refresh at midnight (Nepal time)">
                  <FiClock className="h-3 w-3" /> {countdown}
                </p>
              )}
            </div>
          </button>
        ))}
        {deals && items.length === 0 && (
          <p className="py-6 text-center text-xs text-[var(--mp-muted)]">No discounts right now. Check back soon!</p>
        )}
      </div>
    </section>
  );
}
