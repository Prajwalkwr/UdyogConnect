import React, { useEffect, useState } from 'react';
import { FiCheckCircle, FiChevronLeft, FiChevronRight, FiShoppingCart, FiStar } from 'react-icons/fi';
import { businessImage } from './homeFormat';

const ROTATE_MS = 6000;

export default function FeaturedCarousel({ items = [], onVisit, onShop }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;
  const itemsKey = items.map((item) => item._id).join(',');

  useEffect(() => {
    setIndex(0);
  }, [itemsKey]);

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const go = (next) => setIndex((next + count) % count);

  return (
    <section
      className="relative h-[430px] overflow-hidden rounded-[24px] bg-[var(--mp-brown-deep)] shadow-[var(--shadow-md)] md:h-[250px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured local businesses"
    >
      {items.map((business, slide) => {
        const active = slide === index;
        const image = businessImage(business);
        const rating = Number(business.rating) || 0;
        const verified = business.verified === 'verified' || business.verified === 'approved';
        return (
          <article
            key={business._id}
            aria-hidden={!active}
            className={`absolute inset-0 grid grid-rows-[190px_1fr] transition-opacity duration-700 md:grid-cols-[1.1fr_1fr] md:grid-rows-1 ${
              active ? 'z-10 opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="relative overflow-hidden bg-[#3a281d]">
              {image ? (
                <img src={image} alt={business.name} className="h-full w-full object-cover" loading={slide === 0 ? 'eager' : 'lazy'} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl font-semibold text-white/40">
                  {String(business.name || 'B').charAt(0).toUpperCase()}
                </div>
              )}
              {rating > 0 && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-[var(--mp-ink)] shadow">
                  <FiStar className="h-3.5 w-3.5 fill-[var(--mp-gold)] text-[var(--mp-gold)]" />
                  {rating.toFixed(1)}
                </span>
              )}
            </div>
            <div className="flex flex-col justify-center px-6 py-5 text-white sm:px-8">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mp-display text-2xl font-semibold sm:text-3xl">{business.name}</h2>
                {verified && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    <FiCheckCircle className="h-3 w-3" /> Verified
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/80">
                {business.description || [business.category, business.location].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  tabIndex={active ? 0 : -1}
                  onClick={() => onVisit(business._id)}
                  className="rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[var(--mp-brown-deep)] transition hover:bg-[var(--mp-cream)]"
                >
                  Visit Profile
                </button>
                <button
                  type="button"
                  tabIndex={active ? 0 : -1}
                  onClick={() => onShop(business)}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--mp-gold)] px-5 py-2.5 text-xs font-bold text-[var(--mp-brown-deep)] transition hover:bg-[var(--mp-gold-soft)]"
                >
                  <FiShoppingCart className="h-3.5 w-3.5" /> Shop Now
                </button>
              </div>
            </div>
          </article>
        );
      })}

      {count > 1 && (
        <>
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5 md:left-[calc(55%+2rem)] md:translate-x-0">
            {items.map((business, slide) => (
              <button
                key={business._id}
                type="button"
                onClick={() => go(slide)}
                className={`h-1.5 rounded-full transition-all ${slide === index ? 'w-5 bg-[var(--mp-gold)]' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
                aria-label={`Show ${business.name}`}
                aria-current={slide === index}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-[95px] z-20 hidden h-8 w-8 items-center justify-center rounded-full bg-white/85 text-[var(--mp-brown-deep)] shadow transition hover:bg-white md:top-1/2 md:flex md:-translate-y-1/2"
            aria-label="Previous featured business"
          >
            <FiChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30 md:flex"
            aria-label="Next featured business"
          >
            <FiChevronRight />
          </button>
        </>
      )}
    </section>
  );
}
