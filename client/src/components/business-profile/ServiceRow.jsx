import React from 'react';
import { Clock } from 'lucide-react';
import { formatRs } from './cafeDemo';

export default function ServiceRow({ service, onBook }) {
  const photo = service.imageUrl || service.image || service.images?.[0] || '';
  return (
    <article className="bp-service">
      {photo ? <img src={photo} alt={service.name} /> : <div className="bp-service-fallback" />}
      <div>
        <h3>{service.name}</h3>
        <p>{service.description}</p>
        <div className="bp-service-meta">
          <span>{service.priceLabel || formatRs(service.price, { plus: service.price > 0 })}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280', fontWeight: 600 }}>
            <Clock size={13} /> {service.duration}
          </span>
        </div>
      </div>
      <button type="button" className="bp-btn bp-btn-gold" onClick={() => onBook(service)}>
        Book Now
      </button>
    </article>
  );
}
