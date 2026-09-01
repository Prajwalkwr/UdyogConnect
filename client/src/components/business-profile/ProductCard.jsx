import React from 'react';
import { Star } from 'lucide-react';
import { formatRs } from './cafeDemo';

export default function ProductCard({ product, onOpen, onAdd, onBuy }) {
  return (
    <article className="bp-product">
      <button type="button" className="bp-product-media" onClick={() => onOpen(product)} aria-label={`View ${product.name}`}>
        {product.badge ? <span className="bp-badge">{product.badge}</span> : null}
        <img src={product.imageUrl} alt={product.name} />
      </button>
      <div className="bp-product-body">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <div className="bp-price-row">
          <strong>{formatRs(product.price)}</strong>
          <span className="bp-rating">
            <Star size={13} fill="#f2b71d" stroke="#f2b71d" />
            {Number(product.rating || 0).toFixed(1)}
          </span>
        </div>
        <div className="bp-product-actions">
          <button type="button" className="bp-btn bp-btn-gold" onClick={() => onAdd(product)}>Add to Cart</button>
          <button type="button" className="bp-btn bp-btn-outline" onClick={() => onBuy(product)}>Buy Now</button>
        </div>
      </div>
    </article>
  );
}
