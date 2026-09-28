import React from 'react';
import { Star } from 'lucide-react';
import { formatRs } from './cafeDemo';

export default function ProductCard({ product, onOpen, onAdd }) {
  return (
    <article className="bp-product">
      <div className="bp-product-media-wrap">
        <button type="button" className="bp-product-media" onClick={() => onOpen?.(product)} aria-label={`View ${product.name}`}>
          {product.badge ? <span className="bp-badge">{product.badge}</span> : null}
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <span className="bp-product-placeholder">No image</span>
          )}
        </button>
      </div>
      <div className="bp-product-body">
        <h3>{product.name}</h3>
        <p className="bp-product-cat">{product.category}</p>
        <div className="bp-price-row">
          <strong>{formatRs(product.price)}</strong>
          <span className="bp-rating">
            <Star size={13} fill="#f2b71d" stroke="#f2b71d" />
            {Number(product.rating || 0).toFixed(1)}
          </span>
        </div>
        <button type="button" className="bp-btn bp-btn-gold bp-btn-block" onClick={() => onAdd(product)}>
          Add to Cart
        </button>
      </div>
    </article>
  );
}
