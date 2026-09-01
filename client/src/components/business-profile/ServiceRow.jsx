import React from 'react';
import { Clock } from 'lucide-react';
import { formatRs } from './cafeDemo';

export default function ServiceRow({ service, onBook }) {
  return (
    <article className="bp-service">
      <img src={service.imageUrl} alt={service.name} />
      <div>
        <h3>{service.name}</h3>
        <p>{service.description}</p>
        <div className="bp-service-meta">
          <span>{formatRs(service.price)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6b7280', fontWeight: 600 }}>
            <Clock size={13} /> {service.duration}
          </span>
        </div>
      </div>
      <button type="button" className="bp-btn bp-btn-gold" onClick={() => onBook(service)}>Book Now</button>
    </article>
  );
}
