import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Store } from 'lucide-react';
import api from '../../utils/api';
import { formatRs } from './cafeDemo';

function SuggestionCard({ item, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <button type="button" className="bp-suggest-card" onClick={() => onOpen(item)} aria-label={`View ${item.name} from ${item.businessName}`}>
      <span className="bp-suggest-media">
        {item.imageUrl && !imageFailed ? (
          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
        ) : (
          <span className="bp-product-placeholder">No image</span>
        )}
        {item.discount > 0 ? <span className="bp-suggest-off">-{item.discount}%</span> : null}
        {item.kind === 'service' ? <span className="bp-suggest-kind">Service</span> : null}
      </span>
      <span className="bp-suggest-body">
        <span className="bp-suggest-name">{item.name}</span>
        <span className="bp-suggest-price">
          {item.priceLabel || formatRs(item.price)}
          {item.originalPrice ? <s>{formatRs(item.originalPrice)}</s> : null}
        </span>
        <span className="bp-suggest-meta">
          <span className="bp-suggest-shop"><Store size={11} /> {item.businessName}</span>
          {item.rating > 0 ? (
            <span className="bp-suggest-rating"><Star size={11} fill="#f2b71d" stroke="#f2b71d" /> {item.rating.toFixed(1)}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export default function SuggestionsRow({ businessId }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!businessId) return undefined;
    let active = true;
    setStatus('loading');
    api.get(`/api/businesses/${businessId}/suggestions`)
      .then(({ data }) => {
        if (!active) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setStatus('error');
      });
    return () => { active = false; };
  }, [businessId]);

  if (status !== 'loading' && items.length === 0) return null;

  const openItem = (item) => {
    navigate(`/business-profile/${item.businessId}?tab=${item.kind === 'service' ? 'services' : 'products'}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section className="bp-card bp-suggest" aria-labelledby="bp-suggest-title">
      <div className="bp-section-head">
        <h2 id="bp-suggest-title">You may also like</h2>
        <span className="bp-suggest-sub">
          {status === 'ready' && items.every((item) => item.match === 'popular')
            ? 'Popular picks from local businesses'
            : 'Similar picks from other local businesses'}
        </span>
      </div>
      <div className="bp-suggest-grid">
        {status === 'loading'
          ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="bp-suggest-skeleton" aria-hidden />)
          : items.map((item) => <SuggestionCard key={`${item.kind}-${item._id}`} item={item} onOpen={openItem} />)}
      </div>
    </section>
  );
}
