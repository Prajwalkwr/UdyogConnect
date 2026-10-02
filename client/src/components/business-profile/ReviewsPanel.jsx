import React, { useMemo, useState } from 'react';
import { Flag, Star } from 'lucide-react';
import { timeAgo } from './cafeDemo';

function Stars({ value, size = 14 }) {
  const filled = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span className="bp-rating" style={{ color: '#f2b71d' }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={size}
          fill={index < filled ? '#f2b71d' : 'transparent'}
          stroke="#f2b71d"
        />
      ))}
    </span>
  );
}

export default function ReviewsPanel({
  rating,
  count,
  reviews,
  filters,
  preview,
  draft,
  setDraft,
  isSubmitting,
  onSubmit,
  onReport,
  currentUserId = '',
}) {
  const [filter, setFilter] = useState('all');
  const reviewCount = Number(count) || (Array.isArray(reviews) ? reviews.length : 0);
  const score = reviewCount > 0 ? Number(rating || 0) : 0;

  const chips = filters?.length
    ? filters
    : [
        { id: 'all', label: 'All', count: reviewCount },
        { id: 'Food', label: 'Food', count: 0 },
        { id: 'Service', label: 'Service', count: 0 },
        { id: 'Ambience', label: 'Ambience', count: 0 },
      ];

  const filtered = useMemo(() => {
    const list = Array.isArray(reviews) ? reviews : [];
    if (filter === 'all') return list;
    return list.filter((review) => (review.category || 'Food') === filter);
  }, [reviews, filter]);

  const list = preview ? filtered.slice(0, 1) : filtered;

  return (
    <div className="bp-reviews-panel">
      <div className="bp-reviews-head">
        <div className="bp-score">
          <strong>{score.toFixed(1)}<span>/5</span></strong>
          <Stars value={score} size={16} />
          <div className="bp-score-meta">Based on {reviewCount} reviews</div>
        </div>
        <div className="bp-review-filters">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`bp-filter-chip ${filter === chip.id ? 'active' : ''}`}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>
      </div>

      <div className="bp-review-list">
        {list.length === 0 ? (
          <div className="bp-empty">No customer reviews yet. Be the first to share your experience.</div>
        ) : (
          list.map((review) => (
            <article className="bp-review-card" key={review._id}>
              <div className="bp-review-top">
                <span className="bp-avatar">{String(review.userName || 'C').charAt(0).toUpperCase()}</span>
                <div className="bp-review-who">
                  <strong>{review.userName}</strong>
                  <div className="bp-review-meta">
                    <Stars value={review.rating} />
                    <small>{timeAgo(review.createdAt)}</small>
                  </div>
                </div>
                {onReport && !String(review._id).startsWith('r-') && (!currentUserId || review.customerId !== String(currentUserId)) ? (
                  <button
                    type="button"
                    className="bp-review-report"
                    onClick={() => onReport(review)}
                    title="Report this review"
                    aria-label={`Report review by ${review.userName}`}
                  >
                    <Flag size={13} /> Report
                  </button>
                ) : null}
              </div>
              <p>{review.comment}</p>
              {Array.isArray(review.photos) && review.photos.length > 0 ? (
                <div className="bp-review-photos">
                  {review.photos.slice(0, 3).map((photo, index) => (
                    <img key={`${review._id}-p-${index}`} src={photo} alt="" loading="lazy" decoding="async" />
                  ))}
                </div>
              ) : review.imageUrl ? (
                <div className="bp-review-photos">
                  <img src={review.imageUrl} alt="" loading="lazy" decoding="async" />
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      {!preview && (
        <form className="bp-write" onSubmit={onSubmit}>
          <div role="group" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={`bp-star-btn ${star <= draft.rating ? 'on' : ''}`}
                onClick={() => setDraft((current) => ({ ...current, rating: star }))}
                aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                aria-pressed={draft.rating === star}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            aria-label="Your review"
            rows={3}
            placeholder="Share your experience with this business..."
            value={draft.comment}
            onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))}
          />
          <p className="bp-muted" style={{ fontSize: 11, margin: 0 }}>
            Your name, rating and review are shown publicly. Only review a business you have actually used, and do not include personal details.
          </p>
          <div className="bp-modal-actions">
            <button type="submit" className="bp-btn bp-btn-gold" disabled={isSubmitting}>
              {isSubmitting ? 'Posting...' : 'Post Review'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
