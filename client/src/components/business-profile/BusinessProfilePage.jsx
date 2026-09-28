import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Camera,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../../utils/submitProtection';
import { uploadFilesToCloudinary } from '../../utils/mediaUpload';
import { trackView } from '../../utils/activityTracking';
import { openReportDialog } from '../../utils/reports';
import ProductCard from './ProductCard';
import ServiceRow from './ServiceRow';
import ReviewsPanel from './ReviewsPanel';
import InfoSidebar from './InfoSidebar';
import ServiceBookingForm from '../ServiceBookingForm';
import { emptyProfile, formatRs, isOpenNow, mapsDirectionsUrl, mapsEmbedUrl, normalizeProfile } from './cafeDemo';
import './businessProfile.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'services', label: 'Services' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'location', label: 'Location' },
  { id: 'about', label: 'About' },
];

const HIGHLIGHT_ICONS = {
  zap: Zap,
  shield: ShieldCheck,
  utensils: UtensilsCrossed,
  store: Store,
  sparkles: Sparkles,
};

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
  onOpenMessages,
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState(() => emptyProfile(id || ''));
  const [unavailable, setUnavailable] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [query, setQuery] = useState(searchQuery || '');
  const [sort, setSort] = useState('featured');
  const [category, setCategory] = useState('all');
  const [saved, setSaved] = useState(false);
  const [product, setProduct] = useState(null);
  const [booking, setBooking] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [chatStarting, setChatStarting] = useState(false);
  const [chat, setChat] = useState([{ from: 'them', text: 'Namaste! How can we help you today?' }]);
  const [draftMessage, setDraftMessage] = useState('');
  const [reviewDraft, setReviewDraft] = useState({ rating: 5, comment: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuard = useMemo(() => createSubmissionGuard(), []);
  const openMeta = isOpenNow(profile.business);
  const isOwner = user?.role === 'seller' && String(profile?.business?.ownerId) === String(user._id || user.id);
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file || !isOwner) return;

    if (!submitGuard.begin()) return;
    setIsUploading(true);
    try {
      Swal.fire({
        title: 'Uploading...',
        text: 'Please wait...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const fd = new FormData();
      const uploadedUrls = await uploadFilesToCloudinary([file]);
      if (uploadedUrls && uploadedUrls[0]) {
        fd.append(type === 'cover' ? 'coverUrl' : 'logoUrl', uploadedUrls[0]);
      }
      fd.append(type === 'cover' ? 'cover' : 'logo', file);

      const response = await api.put(`/api/businesses/${profile.business._id}`, fd, {
        headers: createIdempotencyHeader(`update-biz-${type}`),
      });

      if (response.data?.business) {
        setProfile((prev) => ({ ...prev, business: { ...prev.business, ...response.data.business } }));
      }

      Swal.fire({ icon: 'success', title: 'Updated!', timer: 1200, showConfirmButton: false });
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: 'error', text: 'Failed to update image.' });
    } finally {
      setIsUploading(false);
      submitGuard.finish();
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!id) {
        setUnavailable(true);
        setLoadingProfile(false);
        return;
      }
      setLoadingProfile(true);
      try {
        const { data } = await api.get(`/api/businesses/${id}`);
        if (!active) return;
        const business = data?.business || data;
        const isLive = business?.approvalStatus === 'approved'
          || business?.isVerified === true
          || business?.verified === 'verified'
          || business?.verified === 'approved';
        if (!isLive && !(user?.role === 'admin' || String(business?.ownerId || '') === String(user?._id || user?.id || ''))) {
          setUnavailable(true);
          setLoadingProfile(false);
          return;
        }
        const next = normalizeProfile(id, data);
        if (!next) {
          setUnavailable(true);
          setLoadingProfile(false);
          return;
        }
        setUnavailable(false);
        setProfile(next);
        if (isLive) trackView({ businessId: id });
      } catch {
        if (active) setUnavailable(true);
      } finally {
        if (active) setLoadingProfile(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id, user?._id, user?.id, user?.role]);

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
    const nextSaved = await onToggleWishlist?.('businesses', profile.business._id);
    if (typeof nextSaved === 'boolean') {
      setSaved(nextSaved);
    }
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

  const startBusinessChat = async () => {
    if (!requireUser()) return;
    if (user?.role !== 'customer') {
      Swal.fire({ icon: 'info', text: 'Only customers can chat with businesses from this page.' });
      return;
    }
    if (chatStarting) return;
    setChatStarting(true);
    try {
      const businessId = profile.business._id || profile.business.id;
      if (!businessId) {
        Swal.fire({ icon: 'error', text: 'Business id missing. Please refresh the page.' });
        return;
      }
      const { data } = await api.post('/api/conversations', { businessId: String(businessId) });
      const conversationId = data?.conversation?._id;
      if (!conversationId) {
        Swal.fire({ icon: 'error', text: 'Chat opened but no conversation id was returned.' });
        return;
      }
      if (onOpenMessages) {
        onOpenMessages(conversationId);
      } else {
        navigate(`/customer/messages?c=${conversationId}`);
      }
    } catch (error) {
      const message = error.response?.data?.message
        || error.message
        || 'Could not open chat.';
      console.error('Chat open failed:', error.response?.status, error.response?.data || error);
      Swal.fire({ icon: 'error', text: message });
    } finally {
      setChatStarting(false);
    }
  };

  const reportBusiness = () => {
    if (!requireUser()) return;
    openReportDialog({ targetType: 'business', targetId: profile.business._id, targetLabel: profile.business.name });
  };

  const reportReview = (review) => {
    if (!requireUser()) return;
    openReportDialog({
      targetType: 'review',
      targetId: review._id,
      targetLabel: `${review.userName}: "${review.comment}"`,
    });
  };

  const handleBookingSuccess = ({ date, slot, service }) => {
    Swal.fire({
      icon: 'success',
      title: 'Booking requested',
      text: `${service.name} on ${date} at ${slot}.`,
    });
    setBooking(null);
  };

  const submitReview = async (event) => {
    event.preventDefault();
    if (!requireUser()) return;
    if (!reviewDraft.comment.trim()) {
      Swal.fire({ icon: 'warning', text: 'Please write a short review.' });
      return;
    }
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const response = await api.post('/api/reviews', {
        businessId: profile.business._id,
        targetId: profile.business._id,
        targetType: 'business',
        rating: reviewDraft.rating,
        comment: reviewDraft.comment.trim(),
      });
      const savedReview = response.data?.review;
      const nextReview = {
        ...savedReview,
        userName: savedReview?.userName || savedReview?.customerName || user?.name || user?.fullName || 'You',
        rating: Number(savedReview?.rating ?? reviewDraft.rating),
        category: savedReview?.category || 'Food',
        comment: savedReview?.comment || reviewDraft.comment.trim(),
        createdAt: savedReview?.createdAt || new Date().toISOString(),
        imageUrl: savedReview?.imageUrl || '',
        photos: savedReview?.photos || [],
      };
      setProfile((current) => ({
        ...current,
        reviews: [nextReview, ...current.reviews.filter((review) => review._id !== nextReview._id)],
        business: { ...current.business, reviewCount: (current.business.reviewCount ?? current.reviews.length) + 1 },
      }));
      window.dispatchEvent(new CustomEvent('review-created', { detail: { businessId: profile.business._id } }));
      setReviewDraft({ rating: 5, comment: '' });
      Swal.fire({ icon: 'success', title: 'Review posted', timer: 1200, showConfirmButton: false });
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.response?.data?.message || 'Could not post review.' });
    } finally {
      submitGuard.finish();
      setIsSubmitting(false);
    }
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

  const viewOffer = () => {
    Swal.fire({
      icon: 'info',
      title: profile.business.specialOffer?.title || 'Special Offer',
      text: profile.business.specialOffer?.subtitle || 'Ask the business about this offer when you visit.',
      confirmButtonColor: '#f2b71d',
    });
  };

  if (loadingProfile) {
    return (
      <div className="bp-page" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#102341' }}>Loading business…</h2>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="bp-page" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#102341' }}>Business unavailable</h2>
        <p style={{ marginTop: 8, color: '#64748b' }}>This business is not live yet. It will appear after admin approval.</p>
      </div>
    );
  }

  const popularProducts = [...products]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 4);
  const business = profile?.business;
  if (!business) {
    return (
      <div className="bp-page" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#102341' }}>Business unavailable</h2>
        <p style={{ marginTop: 8, color: '#64748b' }}>This business could not be loaded.</p>
      </div>
    );
  }

  const categoryLine = [business.category, business.subcategory].filter(Boolean).join(' • ');
  const reviewTotal = business.reviewCount || profile.reviews.length;

  return (
    <div className="bp-page">
      <section className="bp-hero">
        <div className="bp-cover" style={{ position: 'relative' }}>
          {business.coverUrl ? (
            <img className="bp-cover-img" src={business.coverUrl} alt={`${business.name} cover`} />
          ) : (
            <div className="bp-cover-fallback" />
          )}
          {isOwner && (
            <label className="bp-edit-cover">
              <Camera size={16} /> Edit Cover
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'cover')} disabled={isUploading} />
            </label>
          )}
        </div>

        <div className="bp-identity">
          <div className="bp-logo" style={{ position: 'relative' }}>
            {business.imageUrl ? (
              <img src={business.imageUrl} alt={business.name} />
            ) : (
              <span className="bp-logo-fallback">{String(business.name || 'B').charAt(0)}</span>
            )}
            {isOwner && (
              <label className="bp-edit-logo">
                <Camera size={20} color="white" />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e, 'logo')} disabled={isUploading} />
              </label>
            )}
          </div>

          <div className="bp-identity-main">
            <div className="bp-title-row">
              <h1>{business.name}</h1>
              {business.verified ? <BadgeCheck size={22} color="#60a5fa" fill="#2563eb" aria-label="Verified" /> : null}
            </div>
            <p className="bp-category-line">{categoryLine}</p>
            <div className="bp-meta-row">
              <span className="bp-rating-inline">
                <Star size={14} fill="#f2b71d" stroke="#f2b71d" />
                {Number(business.rating || 0).toFixed(1)} ({reviewTotal} reviews)
              </span>
              {business.verified ? (
                <span className="bp-verified-tag">
                  <ShieldCheck size={13} /> Verified Business
                </span>
              ) : null}
            </div>
            <div className="bp-highlights">
              {(business.highlights || []).map((item) => {
                const Icon = HIGHLIGHT_ICONS[item.icon] || Sparkles;
                return (
                  <span key={item.id || item.label} className="bp-highlight">
                    <Icon size={14} /> {item.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="bp-identity-aside">
            {business.distanceLabel ? (
              <div className="bp-distance">
                <MapPin size={14} /> {business.distanceLabel}
              </div>
            ) : business.location ? (
              <div className="bp-distance">
                <MapPin size={14} /> {business.location}
              </div>
            ) : null}
            <div className="bp-status-row">
              <span className={`bp-pill ${openMeta.open ? '' : 'closed'}`}>{openMeta.label}</span>
              <span className="bp-hours-inline">{openMeta.until}</span>
            </div>
            <div className="bp-hero-actions">
              <button type="button" className={`bp-btn bp-btn-gold ${saved ? 'bp-followed' : ''}`} onClick={toggleSave}>
                <Heart size={16} fill={saved ? '#e11d48' : 'none'} color={saved ? '#e11d48' : '#0b1a30'} />
                {saved ? 'Saved' : 'Save'}
              </button>
              <button type="button" className="bp-btn bp-btn-navy" onClick={startBusinessChat} disabled={chatStarting}>
                <MessageCircle size={16} />
                {chatStarting ? 'Opening…' : 'Chat with Business'}
              </button>
              <button type="button" className="bp-btn bp-btn-outline" onClick={shareBusiness}>
                <Share2 size={16} /> Share
              </button>
            </div>
            {!isOwner && user?.role !== 'admin' ? (
              <button type="button" className="bp-report-link" onClick={reportBusiness}>
                <Flag size={13} /> Report this business
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="bp-tabs-wrap">
        <div className="bp-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => changeTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`bp-layout ${tab === 'overview' ? '' : 'bp-layout-single'}`}>
        <div className="bp-main">
          {tab === 'overview' && (
            <>
              <section className="bp-card">
                <h2>About This Business</h2>
                <p className="bp-about-text">{business.description}</p>
                {(business.tags || []).length > 0 ? (
                  <div className="bp-tags">
                    {business.tags.map((tag) => (
                      <span key={tag} className="bp-tag">{tag}</span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="bp-card">
                <div className="bp-section-head">
                  <h2>Featured Products</h2>
                  <button type="button" className="bp-link" onClick={() => changeTab('products')}>View All</button>
                </div>
                {popularProducts.length > 0 ? (
                  <div className="bp-products">
                    {popularProducts.map((item) => (
                      <ProductCard
                        key={item._id}
                        product={item}
                        onOpen={setProduct}
                        onAdd={addToCart}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bp-empty">No products available for this business yet.</div>
                )}
              </section>

              <section className="bp-card">
                <div className="bp-section-head">
                  <h2>Customer Reviews</h2>
                  <button type="button" className="bp-link" onClick={() => changeTab('reviews')}>View All</button>
                </div>
                <ReviewsPanel
                  rating={business.rating}
                  count={reviewTotal}
                  reviews={profile.reviews}
                  filters={profile.reviewFilters}
                  preview
                  draft={reviewDraft}
                  setDraft={setReviewDraft}
                  onSubmit={submitReview}
                  isSubmitting={isSubmitting}
                  onReport={user?.role === 'admin' ? undefined : reportReview}
                  currentUserId={user?._id || user?.id || ''}
                />
              </section>
            </>
          )}

          {tab === 'products' && (
            <section className="bp-card">
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
                <div className="bp-products bp-products-full">
                  {products.map((item) => (
                    <ProductCard
                      key={item._id}
                      product={item}
                      onOpen={setProduct}
                      onAdd={addToCart}
                    />
                  ))}
                </div>
              ) : <div className="bp-empty">No products match your search.</div>}
            </section>
          )}

          {tab === 'services' && (
            <section className="bp-card">
              <div className="bp-section-head"><h2>Services</h2></div>
              <div className="bp-service-list">
                {profile.services.length ? profile.services.map((service) => (
                  <ServiceRow key={service._id} service={service} onBook={setBooking} />
                )) : <div className="bp-empty">No services listed yet.</div>}
              </div>
            </section>
          )}

          {tab === 'reviews' && (
            <section className="bp-card">
              <div className="bp-section-head"><h2>Reviews</h2></div>
              <ReviewsPanel
                rating={business.rating}
                count={reviewTotal}
                reviews={profile.reviews}
                filters={profile.reviewFilters}
                draft={reviewDraft}
                setDraft={setReviewDraft}
                onSubmit={submitReview}
                isSubmitting={isSubmitting}
                onReport={user?.role === 'admin' ? undefined : reportReview}
                currentUserId={user?._id || user?.id || ''}
              />
            </section>
          )}

          {tab === 'location' && (
            <section className="bp-card">
              <div className="bp-section-head"><h2>Location</h2></div>
              <p className="bp-about-text">{business.location || 'Location details coming soon.'}</p>
              {Number.isFinite(business.latitude) && Number.isFinite(business.longitude) ? (
                <>
                  <div className="bp-map bp-map-large">
                    <iframe
                      title={`${business.name} map`}
                      src={mapsEmbedUrl(business.latitude, business.longitude)}
                      loading="lazy"
                    />
                  </div>
                  <a
                    className="bp-btn bp-btn-navy"
                    href={mapsDirectionsUrl(business.latitude, business.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginTop: 12, width: 'fit-content' }}
                  >
                    Get Directions
                  </a>
                </>
              ) : null}
            </section>
          )}

          {tab === 'about' && (
            <section className="bp-card bp-about">
              <h2>{business.name}</h2>
              <p>{business.description}</p>
              <p>
                Visit us in {business.location}. We are {openMeta.open ? 'open now' : 'currently closed'}
                {openMeta.until ? ` (${openMeta.until})` : ''}.
                {business.phone ? <> Call <a href={`tel:${business.phone}`}>{business.phone}</a></> : null}
                {business.contactEmail ? <> or email <a href={`mailto:${business.contactEmail}`}>{business.contactEmail}</a></> : null}.
              </p>
              {(business.tags || []).length > 0 ? (
                <div className="bp-tags">
                  {business.tags.map((tag) => (
                    <span key={tag} className="bp-tag">{tag}</span>
                  ))}
                </div>
              ) : null}
              {Number.isFinite(business.latitude) && Number.isFinite(business.longitude) ? (
                <a className="bp-btn bp-btn-gold" href={mapsDirectionsUrl(business.latitude, business.longitude)} target="_blank" rel="noreferrer" style={{ marginTop: 12, width: 'fit-content' }}>
                  Get Directions
                </a>
              ) : null}
            </section>
          )}
        </div>

        {tab === 'overview' ? (
          <InfoSidebar
            business={business}
            services={profile.services}
            onBook={setBooking}
            onViewOffer={viewOffer}
          />
        ) : null}
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
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>{booking.description}</p>
          <ServiceBookingForm
            businessId={profile.business._id}
            service={booking}
            user={user}
            variant="light"
            onCancel={() => setBooking(null)}
            onSuccess={handleBookingSuccess}
          />
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
