import React from 'react';
import { FiStar } from 'react-icons/fi';

const initials = (name) => String(name || 'C')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || 'C';

export default function CustomerReviews({ reviews = [], businesses = [], title = 'What Our Customers Say', onOpenBusiness }) {
  if (!reviews.length) return null;

  const businessNameFor = (review) => review.businessName
    || (Array.isArray(businesses) ? businesses.find((b) => String(b._id) === String(review.businessId))?.name : '')
    || '';

  return (
    <section id="community" className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)]" aria-labelledby="reviews-title">
      <h3 id="reviews-title" className="mb-3 text-base font-bold text-[var(--mp-ink)]">{title}</h3>
      <ul className="space-y-2.5">
        {reviews.map((review) => {
          const rating = Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)));
          const businessName = businessNameFor(review);
          return (
            <li key={review._id} className="rounded-2xl bg-white p-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                  {initials(review.customerName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[var(--mp-ink)]">{review.customerName || 'Customer'}</p>
                  {businessName && (
                    <button
                      type="button"
                      onClick={() => review.businessId && onOpenBusiness?.(review.businessId)}
                      className="block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[10.5px] text-[var(--mp-muted)] hover:text-[var(--mp-brown)]"
                    >
                      {businessName}
                    </button>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <FiStar
                      key={star}
                      className={`h-3 w-3 ${star <= rating ? 'fill-[var(--mp-gold)] text-[var(--mp-gold)]' : 'text-[#d8cdbd]'}`}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--mp-ink)]">“{review.comment}”</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
