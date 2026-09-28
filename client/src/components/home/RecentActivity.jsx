import React, { useEffect, useState } from 'react';
import { FiArrowRight, FiCalendar, FiHeart, FiShoppingBag, FiStar, FiXCircle } from 'react-icons/fi';
import { formatRelativeTime } from './homeFormat';

const ICONS = {
  order: { Icon: FiShoppingBag, className: 'bg-violet-100 text-violet-600' },
  booking: { Icon: FiCalendar, className: 'bg-sky-100 text-sky-600' },
  wishlist: { Icon: FiHeart, className: 'bg-rose-100 text-rose-500' },
  review: { Icon: FiStar, className: 'bg-amber-100 text-amber-600' },
  cancelled: { Icon: FiXCircle, className: 'bg-slate-100 text-slate-500' },
};

export default function RecentActivity({ user, activity = [], status, onOpenBusiness, onViewAll, onSignIn }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)]" aria-labelledby="activity-title">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="activity-title" className="text-base font-bold text-[var(--mp-ink)]">Recent Activity</h3>
        {user && (
          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--mp-gold)] hover:text-[var(--mp-brown)]"
          >
            View All <FiArrowRight />
          </button>
        )}
      </div>

      {!user && (
        <div className="rounded-2xl bg-white px-3 py-5 text-center">
          <p className="text-xs text-[var(--mp-muted)]">Sign in to see your orders, saved places and reviews here.</p>
          <button
            type="button"
            onClick={onSignIn}
            className="mt-3 rounded-full bg-[var(--mp-gold)] px-4 py-1.5 text-[11px] font-bold text-white transition hover:bg-[var(--accent-hover)]"
          >
            Sign in
          </button>
        </div>
      )}

      {user && status === 'loading' && !activity.length && (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#ece3d6]" />)}
        </div>
      )}

      {user && status !== 'loading' && activity.length === 0 && (
        <p className="rounded-2xl bg-white px-3 py-5 text-center text-xs text-[var(--mp-muted)]">
          No activity yet. Place an order, save a business or leave a review to see it here.
        </p>
      )}

      {user && activity.length > 0 && (
        <ul className="divide-y divide-[var(--mp-border)]/60">
          {activity.map((item) => {
            const cancelled = item.type === 'order' && /cancelled/i.test(item.title);
            const { Icon, className } = ICONS[cancelled ? 'cancelled' : item.type] || ICONS.order;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => item.businessId && onOpenBusiness(item.businessId)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-[var(--mp-ink)]">{item.title}</span>
                    <span className="block truncate text-[10.5px] text-[var(--mp-muted)]">{item.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--mp-muted)]">{formatRelativeTime(item.at, now)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
