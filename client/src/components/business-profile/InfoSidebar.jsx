import React from 'react';
import {
  Cake,
  CheckCircle2,
  CreditCard,
  Navigation,
  PartyPopper,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import { formatRs, mapsDirectionsUrl, mapsEmbedUrl } from './cafeDemo';

const SERVICE_ICONS = {
  table: UtensilsCrossed,
  cake: Cake,
  party: PartyPopper,
};

const PAYMENT_ICONS = {
  'Cash on Delivery': Wallet,
  eSewa: Wallet,
  'Card Payment': CreditCard,
};

export default function InfoSidebar({ business, services = [], showServices = true, onBook, onViewOffer }) {
  const lat = business.latitude;
  const lng = business.longitude;
  const hasMap = Number.isFinite(lat) && Number.isFinite(lng);

  return (
    <aside className="bp-side">
      {business.whyChooseUs?.length ? (
        <section className="bp-side-card">
          <h3>Why Choose Us?</h3>
          <ul className="bp-why-list">
            {business.whyChooseUs.map((item) => (
              <li key={item}>
                <CheckCircle2 size={16} color="#16a34a" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showServices && (
      <section className="bp-side-card">
        <h3>Services</h3>
        <div className="bp-side-services">
          {services.map((service) => {
            const Icon = SERVICE_ICONS[service.icon] || UtensilsCrossed;
            return (
              <button
                key={service._id}
                type="button"
                className="bp-side-service"
                onClick={() => onBook?.(service)}
              >
                <span className="bp-side-service-icon">
                  <Icon size={16} />
                </span>
                <span className="bp-side-service-copy">
                  <strong>{service.name}</strong>
                  <small>{service.priceLabel || formatRs(service.price, { plus: service.price > 0 })}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      )}

      <section className="bp-side-card">
        <h3>Location</h3>
        {hasMap ? (
          <div className="bp-map">
            <iframe
              title={`${business.name} map`}
              src={mapsEmbedUrl(lat, lng)}
              loading="lazy"
            />
          </div>
        ) : (
          <p className="bp-muted">{business.location || 'Location coming soon'}</p>
        )}
        {hasMap ? (
          <a
            className="bp-btn bp-btn-navy bp-btn-block"
            href={mapsDirectionsUrl(lat, lng)}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={15} /> Get Directions
          </a>
        ) : null}
      </section>

      <section className="bp-side-card">
        <h3>Business Hours</h3>
        <div className="bp-hours">
          {(business.openingHours || []).map((row) => (
            <div key={row.label} className={`bp-hour ${row.closed ? 'closed' : ''}`}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="bp-side-card">
        <h3>Payment Methods</h3>
        <div className="bp-payments">
          {(business.paymentMethods || []).map((method) => {
            const Icon = PAYMENT_ICONS[method] || Wallet;
            return (
              <div key={method} className="bp-payment">
                <Icon size={16} />
                <span>{method}</span>
              </div>
            );
          })}
        </div>
      </section>

      {business.specialOffer ? (
        <section className="bp-offer-card">
          <div className="bp-offer-copy">
            <h3>{business.specialOffer.title}</h3>
            {business.specialOffer.subtitle ? <p>{business.specialOffer.subtitle}</p> : null}
            <button type="button" className="bp-btn bp-btn-gold" onClick={onViewOffer}>
              {business.specialOffer.cta || 'View Offer'}
            </button>
          </div>
          {business.specialOffer.imageUrl ? (
            <img src={business.specialOffer.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
