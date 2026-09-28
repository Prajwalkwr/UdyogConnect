import React from 'react';
import { FiHeart, FiMapPin, FiStar } from 'react-icons/fi';
import { getBusinessAvailabilityMeta } from '../../utils/businessAvailability';
import { businessImage, formatPriceRange } from './homeFormat';

const TAG_STYLES = {
  forYou: 'bg-emerald-50 text-emerald-700',
  nearYou: 'bg-sky-50 text-sky-700',
  alsoViewed: 'bg-violet-50 text-violet-700',
  trending: 'bg-amber-50 text-amber-700',
};

export default function BusinessRecCard({ business, tag, tagKey, saved, onOpen, onToggleSave, size = 'sm' }) {
  const image = businessImage(business);
  const availability = getBusinessAvailabilityMeta(business);
  const price = formatPriceRange(business.priceRange);
  const rating = Number(business.rating) || 0;
  const reviewCount = Number(business.reviewCount) || 0;
  const place = [business.category, business.location].filter(Boolean).join(' • ');

  const open = () => onOpen?.(business._id);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      className="group flex h-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-[var(--mp-border)] bg-white shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mp-gold)]"
    >
      <div className={`relative overflow-hidden bg-[#ebe2d4] ${size === 'lg' ? 'h-44' : 'h-32'}`}>
        {image ? (
          <img src={image} alt={business.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[var(--mp-muted)]">
            {String(business.name || 'B').charAt(0).toUpperCase()}
          </div>
        )}
        {tag && (
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${TAG_STYLES[tagKey] || 'bg-white text-[var(--mp-brown)]'}`}>
            {tag}
          </span>
        )}
        {onToggleSave && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSave(business._id);
            }}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[var(--mp-brown)] shadow transition hover:scale-105"
            aria-label={saved ? `Remove ${business.name} from wishlist` : `Save ${business.name} to wishlist`}
            aria-pressed={saved}
          >
            <FiHeart className={`h-3.5 w-3.5 ${saved ? 'text-rose-500' : ''}`} fill={saved ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h4 className={`truncate font-bold text-[var(--mp-ink)] ${size === 'lg' ? 'text-base' : 'text-sm'}`}>{business.name}</h4>
        {place && <p className="truncate text-[11px] text-[var(--mp-muted)]">{place}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--mp-muted)]">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--mp-ink)]">
            <FiStar className={`h-3 w-3 ${rating > 0 ? 'fill-[var(--mp-gold)] text-[var(--mp-gold)]' : 'text-[var(--mp-muted)]'}`} />
            {reviewCount > 0 ? (
              <>
                {rating.toFixed(1)} <span className="font-normal text-[var(--mp-muted)]">({reviewCount})</span>
              </>
            ) : (
              <span className="font-normal text-[var(--mp-muted)]">No reviews yet</span>
            )}
          </span>
          {business.distanceKm != null && (
            <span className="inline-flex items-center gap-0.5">
              <FiMapPin className="h-3 w-3" /> {business.distanceKm} km
            </span>
          )}
        </div>
        {business.reason && (
          <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--mp-brown)]" title={business.reason}>
            ✦ {business.reason}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="truncate text-[11px] font-semibold text-[var(--mp-ink)]">{price}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              availability.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {availability.isOpen ? 'Open Now' : availability.openLabel}
          </span>
        </div>
      </div>
    </article>
  );
}
