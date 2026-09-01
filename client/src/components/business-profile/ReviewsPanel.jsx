import React from 'react';
import { Star } from 'lucide-react';
import { timeAgo } from './cafeDemo';

function Stars({ value }) {
  return (
    <span className="bp-rating" style={{ color: '#f2b71d' }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={14} fill={index < Math.round(value) ? '#f2b71d' : 'transparent'} stroke="#f2b71d" />
      ))}
    </span>
  );
}

export default function ReviewsPanel({
  rating,
  count,
  distribution,
  reviews,
  preview,
  draft,
  setDraft,
  onSubmit,
}) {
  const list = preview ? reviews.slice(0, 1) : reviews;

  return (
    <div>
      <div className="bp-reviews">
        <div className="bp-score">
          <strong>{Number(rating || 0).toFixed(1)}</strong>
          <Stars value={rating} />
          <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>{count} Reviews</div>
        </div>
        <div className="bp-bars">
          {[5, 4, 3, 2, 1].map((star) => (
            <div className="bp-bar-row" key={star}>
              <span>{star} ★</span>
              <div className="bp-bar"><span style={{ width: `${distribution[star] || 0}%` }} /></div>
              <b>{distribution[star] || 0}%</b>
            </div>
          ))}
        </div>
        <div className="bp-review-list">
          {list.map((review) => (
            <article className="bp-review-card" key={review._id}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="bp-avatar">{String(review.userName || 'C').charAt(0).toUpperCase()}</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13 }}>{review.userName}</strong>
                    <small style={{ color: '#9ca3af' }}>{timeAgo(review.createdAt)}</small>
                  </div>
                </div>
                <div style={{ margin: '8px 0 6px' }}><Stars value={review.rating} /></div>
                <p style={{ margin: 0, fontSize: 13, color: '#374151' }}>{review.comment}</p>
              </div>
              {review.imageUrl ? <img src={review.imageUrl} alt="" /> : <div />}
            </article>
          ))}
        </div>
      </div>

      {!preview && (
        <form className="bp-write" onSubmit={onSubmit}>
          <div>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                className={`bp-star-btn ${star <= draft.rating ? 'on' : ''}`}
                onClick={() => setDraft((current) => ({ ...current, rating: star }))}
                aria-label={`${star} stars`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            placeholder="Share your experience with this business..."
            value={draft.comment}
            onChange={(event) => setDraft((current) => ({ ...current, comment: event.target.value }))}
          />
          <div className="bp-modal-actions">
            <button type="submit" className="bp-btn bp-btn-gold">Post Review</button>
          </div>
        </form>
      )}
    </div>
  );
}
