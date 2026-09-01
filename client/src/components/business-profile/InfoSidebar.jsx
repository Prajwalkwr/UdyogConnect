import React from 'react';
import { Briefcase, Mail, MapPin, Navigation, Phone, Globe, MessageCircle } from 'lucide-react';
import { mapsDirectionsUrl, mapsEmbedUrl } from './cafeDemo';

export default function InfoSidebar({ business, openMeta, onContact }) {
  const website = business.website || '';
  const websiteHref = website.startsWith('http') ? website : `https://${website.replace(/^www\./, 'www.')}`;
  const websiteLabel = website.replace(/^https?:\/\//, '');

  return (
    <aside className="bp-side">
      <section className="bp-side-card">
        <h3>Business Information</h3>
        <p>{business.description}</p>
        <div className="bp-info-row"><Briefcase size={14} /><b>Category</b><span>{business.category}</span></div>
        <div className="bp-info-row"><MapPin size={14} /><b>Location</b><span>{business.location}</span></div>
        <div className="bp-info-row">
          <Phone size={14} />
          <b>Phone</b>
          <a href={`tel:${String(business.phone || '').replace(/\s/g, '')}`}>{business.phone}</a>
        </div>
        <div className="bp-info-row">
          <Mail size={14} />
          <b>Email</b>
          <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a>
        </div>
        <div className="bp-info-row">
          <Globe size={14} />
          <b>Website</b>
          <a href={websiteHref} target="_blank" rel="noreferrer">{websiteLabel || 'Visit website'}</a>
        </div>
      </section>

      <section className="bp-side-card">
        <div className="bp-section-head">
          <h3>Opening Hours</h3>
          <span className={`bp-pill ${openMeta.open ? '' : 'closed'}`}>{openMeta.label}</span>
        </div>
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
        <div className="bp-section-head">
          <h3>Location</h3>
          <a
            className="bp-link"
            href={mapsDirectionsUrl(business.latitude, business.longitude, business.location)}
            target="_blank"
            rel="noreferrer"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Navigation size={13} /> Get Directions
            </span>
          </a>
        </div>
        <div className="bp-map">
          <iframe
            title={`${business.name} map`}
            src={mapsEmbedUrl(business.latitude, business.longitude)}
            loading="lazy"
          />
        </div>
      </section>

      <section className="bp-side-card">
        <h3>Contact Business</h3>
        <button type="button" className="bp-btn bp-btn-gold" style={{ width: '100%', marginTop: 10 }} onClick={onContact}>
          <MessageCircle size={16} /> Contact Now
        </button>
      </section>
    </aside>
  );
}
