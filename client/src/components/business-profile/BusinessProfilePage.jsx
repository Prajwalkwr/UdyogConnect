import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Coffee, Heart, MapPin, Share2, Star, UtensilsCrossed } from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../../utils/submitProtection';
import ProductCard from './ProductCard';
import ServiceRow from './ServiceRow';
import ReviewsPanel from './ReviewsPanel';
import InfoSidebar from './InfoSidebar';
import { CAFE_XYZ_ID, formatRs, isOpenNow, mapsDirectionsUrl, normalizeProfile } from './cafeDemo';
import './businessProfile.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'about', label: 'About' },
];

function Modal({ title, children, onClose }) {
  return (
    <div className="bp-overlay" onClick={onClose} role="presentation">
      <div className="bp-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function BusinessProfilePage({
  user,
  searchQuery = '',
  onAddToCart,
  onToggleWishlist,
  onRequireAuth,
  onOpenChat,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(() => normalizeProfile(id || CAFE_XYZ_ID, null));
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [query, setQuery] = useState(searchQuery || '');
  const [sort, setSort] = useState('featured');
  const [category, setCategory] = useState('all');
  const [saved, setSaved] = useState(false);
  const [product, setProduct] = useState(null);
  const [booking, setBooking] = useState(null);
  const [bookingForm, setBookingForm] = useState({ date: '', slot: '10:00 AM' });
  const [contactOpen, setContactOpen] = useState(false);
  const [chat, setChat] = useState([{ from: 'them', text: 'Namaste! How can Cafe XYZ help you today?' }]);
  const [draftMessage, setDraftMessage] = useState('');
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: '' });
  const submitGuard = useMemo(() => createSubmissionGuard(), []);
  const openMeta = isOpenNow();

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id || id === CAFE_XYZ_ID) {
        setProfile(normalizeProfile(CAFE_XYZ_ID, null));
        return;
      }
      try {
        const { data } = await api.get(`/api/businesses/${id}`);
        if (active) setProfile(normalizeProfile(id, data));
      } catch {
        if (active) setProfile(normalizeProfile(CAFE_XYZ_ID, null));
      }
    };
    load();
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    setQuery(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    const items = user?.wishlist?.businesses;
    const bizId = String(profile.business._id);
    setSaved(Array.isArray(items) && items.some((item) => String(item?._id || item?.id || item) === bizId));
  }, [user, profile.business._id]);

  const requireUser = () => {
    if (user) return true;
    onRequireAuth?.();
    return false;
  };

  const products = useMemo(() => {
    const filtered = profile.products.filter((item) => {
      const haystack = `${item.name} ${item.description} ${item.category}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query.toLowerCase());
      const matchesCategory = category === 'all' || item.category === category;
      return matchesQuery && matchesCategory;
    });
    return filtered.sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price;
      if (sort === 'price-high') return b.price - a.price;
      if (sort === 'rating') return b.rating - a.rating;
      return 0;
    });
  }, [profile.products, query, sort, category]);

  const categories = useMemo(
    () => ['all', ...new Set(profile.products.map((item) => item.category).filter(Boolean))],
    [profile.products]
  );

  const changeTab = (next) => {
    setTab(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  };

  const cartPayload = (item) => ({
    id: item._id,
    name: item.name,
    price: item.price,
    stock: item.stock ?? 20,
    seller: profile.business.name,
    businessId: profile.business._id,
    image: item.imageUrl,
  });

  const addToCart = (item) => {
    onAddToCart?.(cartPayload(item));
    Swal.fire({ icon: 'success', title: 'Added to cart', text: `${item.name} was added to your cart.`, timer: 1200, showConfirmButton: false });
  };

  const buyNow = (item) => {
    onAddToCart?.(cartPayload(item));
    navigate('/checkout');
  };

  const toggleSave = async () => {
    if (!requireUser()) return;
    await onToggleWishlist?.('businesses', profile.business._id);
    setSaved((value) => !value);
  };

  const shareBusiness = async () => {
    const url = window.location.href;
    const payload = { title: profile.business.name, text: `Check out ${profile.business.name} on UdyogConnect`, url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      Swal.fire({ icon: 'success', title: 'Link copied', text: 'Business profile link copied to clipboard.', timer: 1400, showConfirmButton: false });
    } catch {
      Swal.fire({ icon: 'info', text: url });
    }
  };

  const submitBooking = async (event) => {
    event.preventDefault();
    if (!requireUser() || !booking) return;
    if (!submitGuard.begin()) return;
    try {
      if (!profile.fromDemo) {
        await api.post('/api/bookings', {
          businessId: profile.business._id,
          serviceId: booking._id,
          date: bookingForm.date,
          timeSlot: bookingForm.slot,
        }, { headers: { ...createIdempotencyHeader('booking-create') } });
      }
      Swal.fire({ icon: 'success', title: 'Booking requested', text: `${booking.name} on ${bookingForm.date} at ${bookingForm.slot}.` });
      setBooking(null);
    } catch {
      Swal.fire({ icon: 'error', text: 'Could not complete booking.' });
    } finally {
      submitGuard.finish();
    }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!requireUser()) return;
    if (!reviewDraft.comment.trim()) {
      Swal.fire({ icon: 'warning', text: 'Please write a short review.' });
      return;
    }
    const nextReview = {
      _id: `local-${Date.now()}`,
      userName: user?.name || user?.fullName || 'You',
      rating: reviewDraft.rating,
      comment: reviewDraft.comment,
      createdAt: new Date().toISOString(),
      imageUrl: profile.business.imageUrl,
    };
    setProfile((current) => ({ ...current, reviews: [nextReview, ...current.reviews] }));
    setReviewDraft({ rating: 5, comment: '' });
    Swal.fire({ icon: 'success', title: 'Review posted', timer: 1200, showConfirmButton: false });
  };

  const sendContact = (event) => {
    event.preventDefault();
    if (!draftMessage.trim()) return;
    if (!requireUser()) return;
    setChat((current) => [...current, { from: 'me', text: draftMessage }]);
    setDraftMessage('');
    window.setTimeout(() => {
      setChat((current) => [...current, { from: 'them', text: 'Thanks! We will get back to you shortly.' }]);
    }, 500);
    onOpenChat?.();
  };

  const featured = products.slice(0, 3);
  const business = profile.business;

  return (
    <div className="bp-page">
      <section className="bp-hero">
        <img className="bp-hero-img" src={business.coverUrl} alt={`${business.name} cover`} />
        <div className="bp-hero-overlay" />
        <div className="bp-hero-inner">
          <div className="bp-logo-card">
            <Coffee size={36} color="#f2b71d" />
            <span>{business.name.split(' ')[0]}</span>
          </div>
          <div className="bp-hero-copy">
            <h1>
              {business.name}
              {business.verified ? <BadgeCheck size={22} color="#60a5fa" fill="#2563eb" /> : null}
            </h1>
            <div className="bp-meta">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Star size={14} fill="#f2b71d" stroke="#f2b71d" /> {Number(business.rating).toFixed(1)} ({business.reviewCount || profile.reviews.length} Reviews)
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <UtensilsCrossed size={14} /> {business.category}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={14} /> {business.location}
              </span>
            </div>
            <div className="bp-status">
              <span className={`bp-pill ${openMeta.open ? '' : 'closed'}`}>{openMeta.label}</span>
              <span>{openMeta.until}</span>
            </div>
          </div>
          <div className="bp-hero-actions">
            <button type="button" className={`bp-ghost ${saved ? 'saved' : ''}`} onClick={toggleSave}>
              <Heart size={16} fill={saved ? '#e11d48' : 'none'} /> {saved ? 'Saved' : 'Save'}
            </button>
            <button type="button" className="bp-ghost" onClick={shareBusiness}>
              <Share2 size={16} /> Share
            </button>
          </div>
        </div>
      </section>

      <div className="bp-layout" style={{ marginTop: 16 }}>
        <div>
          <div className="bp-panel">
            <div className="bp-tabs">
              {TABS.map((item) => (
                <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="bp-section">
                <div className="bp-section-head">
                  <h2>Featured Products</h2>
                  <button type="button" className="bp-link" onClick={() => changeTab('products')}>View All</button>
                </div>
                <div className="bp-products">
                  {featured.map((item) => (
                    <ProductCard key={item._id} product={item} onOpen={setProduct} onAdd={addToCart} onBuy={buyNow} />
                  ))}
                </div>
                <div className="bp-section-head" style={{ marginTop: 18 }}>
                  <h2>Services</h2>
                  <button type="button" className="bp-link" onClick={() => changeTab('services')}>View All</button>
                </div>
                <div className="bp-review-list">
                  {profile.services.slice(0, 1).map((service) => (
                    <ServiceRow key={service._id} service={service} onBook={setBooking} />
                  ))}
                </div>
                <div className="bp-section-head" style={{ marginTop: 18 }}>
                  <h2>Customer Reviews</h2>
                  <button type="button" className="bp-link" onClick={() => changeTab('reviews')}>View All</button>
                </div>
                <ReviewsPanel
                  rating={business.rating}
                  count={business.reviewCount || profile.reviews.length}
                  distribution={profile.distribution}
                  reviews={profile.reviews}
                  preview
                  draft={reviewDraft}
                  setDraft={setReviewDraft}
                  onSubmit={submitReview}
                />
              </div>
            )}

            {tab === 'products' && (
              <div className="bp-section">
                <div className="bp-section-head"><h2>Products</h2></div>
                <div className="bp-toolbar">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categories.map((item) => (
                      <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>
                    ))}
                  </select>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="featured">Featured</option>
                    <option value="rating">Top rated</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                  </select>
                </div>
                {products.length ? (
                  <div className="bp-products">
                    {products.map((item) => (
                      <ProductCard key={item._id} product={item} onOpen={setProduct} onAdd={addToCart} onBuy={buyNow} />
                    ))}
                  </div>
                ) : <div className="bp-empty">No products match your search.</div>}
              </div>
            )}

            {tab === 'services' && (
              <div className="bp-section">
                <div className="bp-section-head"><h2>Services</h2></div>
                <div className="bp-review-list">
                  {profile.services.map((service) => (
                    <ServiceRow key={service._id} service={service} onBook={setBooking} />
                  ))}
                </div>
              </div>
            )}

            {tab === 'reviews' && (
              <div className="bp-section">
                <div className="bp-section-head"><h2>Reviews</h2></div>
                <ReviewsPanel
                  rating={business.rating}
                  count={business.reviewCount || profile.reviews.length}
                  distribution={profile.distribution}
                  reviews={profile.reviews}
                  draft={reviewDraft}
                  setDraft={setReviewDraft}
                  onSubmit={submitReview}
                />
              </div>
            )}

            {tab === 'about' && (
              <div className="bp-section bp-about">
                <h2>{business.name}</h2>
                <p>{business.description}</p>
                <p>
                  Visit us in {business.location}. We are {openMeta.open ? 'open now' : 'currently closed'} and typically close at {business.closesAt}.
                  Call <a href={`tel:${business.phone}`}>{business.phone}</a> or email <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a>.
                </p>
                <a className="bp-btn bp-btn-gold" href={mapsDirectionsUrl(business.latitude, business.longitude)} target="_blank" rel="noreferrer">Get Directions</a>
              </div>
            )}
          </div>
        </div>

        <InfoSidebar business={business} openMeta={openMeta} onContact={() => setContactOpen(true)} />
      </div>

      {product && (
        <Modal title={product.name} onClose={() => setProduct(null)}>
          <img className="bp-detail-img" src={product.imageUrl} alt={product.name} />
          <p style={{ color: '#6b7280', fontSize: 13 }}>{product.description}</p>
          <div className="bp-price-row">
            <strong>{formatRs(product.price)}</strong>
            <span className="bp-rating"><Star size={13} fill="#f2b71d" stroke="#f2b71d" /> {product.rating}</span>
          </div>
          <div className="bp-modal-actions">
            <button type="button" className="bp-btn bp-btn-outline" onClick={() => setProduct(null)}>Close</button>
            <button type="button" className="bp-btn bp-btn-gold" onClick={() => addToCart(product)}>Add to Cart</button>
            <button type="button" className="bp-btn bp-btn-outline" onClick={() => buyNow(product)}>Buy Now</button>
          </div>
        </Modal>
      )}

      {booking && (
        <Modal title={`Book ${booking.name}`} onClose={() => setBooking(null)}>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{booking.description}</p>
          <p><strong>{formatRs(booking.price)}</strong> · {booking.duration}</p>
          <form onSubmit={submitBooking}>
            <div className="bp-write">
              <input type="date" required value={bookingForm.date} onChange={(event) => setBookingForm((current) => ({ ...current, date: event.target.value }))} />
              <select value={bookingForm.slot} onChange={(event) => setBookingForm((current) => ({ ...current, slot: event.target.value }))}>
                {['10:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'].map((slot) => <option key={slot}>{slot}</option>)}
              </select>
            </div>
            <div className="bp-modal-actions">
              <button type="button" className="bp-btn bp-btn-outline" onClick={() => setBooking(null)}>Cancel</button>
              <button type="submit" className="bp-btn bp-btn-gold">Confirm Booking</button>
            </div>
          </form>
        </Modal>
      )}

      {contactOpen && (
        <Modal title={`Contact ${business.name}`} onClose={() => setContactOpen(false)}>
          <div className="bp-chat">
            {chat.map((message, index) => (
              <div key={index} className={`bp-bubble ${message.from}`}>{message.text}</div>
            ))}
          </div>
          <form onSubmit={sendContact}>
            <input value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} placeholder="Write a message..." />
            <div className="bp-modal-actions">
              <a className="bp-btn bp-btn-outline" href={`tel:${business.phone}`}>Call</a>
              <button type="submit" className="bp-btn bp-btn-gold">Send</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
