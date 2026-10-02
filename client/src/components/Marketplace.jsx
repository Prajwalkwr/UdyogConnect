import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMapPin, FiClock, FiArrowRight, FiX, FiNavigation } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { matchesSearchQuery } from '../utils/search';
import { QUICK_FILTER_GROUP, matchesCategoryGroup } from '../utils/categoryGroups';
import useHomeFeed from './home/useHomeFeed';
import FeaturedCarousel from './home/FeaturedCarousel';
import AiRecommendations from './home/AiRecommendations';
import TopDeals from './home/TopDeals';
import RecentActivity from './home/RecentActivity';
import CustomerReviews from './home/CustomerReviews';
import PopularBusinesses from './home/PopularBusinesses';
import BusinessRecCard from './home/BusinessRecCard';
import { HERO_IMAGE_EVENT, cachedHeroImage, fetchHeroImage, heroBackground } from '../utils/siteAppearance';

const DEFAULT_LOCATION = 'Kathmandu, Nepal';

export default function Marketplace({
  user,
  businesses,
  products,
  lang,
  onOpenProduct,
  onOpenBusiness,
  onAddToCart,
  onOpenDashboard,
  onToggleWishlist,
  initialCategory = 'All',
  initialSearchQuery = '',
  catalogStatus = 'ready',
  onRetryCatalog,
}) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION);
  const [feedArea, setFeedArea] = useState('');
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customerReviews, setCustomerReviews] = useState([]);
  const [heroImage, setHeroImage] = useState(cachedHeroImage);

  const { feed, status: feedStatus, reload: reloadFeed } = useHomeFeed({ user, area: feedArea, coords });

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  const isSavedBusiness = useCallback((id) => {
    const items = user?.wishlist?.businesses;
    return Array.isArray(items) && items.some((item) => String(item?._id || item?.id || item) === String(id));
  }, [user?.wishlist?.businesses]);

  const toggleSaved = useCallback((id) => onToggleWishlist?.('businesses', id), [onToggleWishlist]);

  const categories = [
    { name: 'Grocery', icon: '🍎' },
    { name: 'Restaurants', icon: '🍴' },
    { name: 'Electronics', icon: '⚡' },
    { name: 'Clothing', icon: '👗' },
    { name: 'Pharmacy', icon: '💊' },
    { name: 'Beauty Salon', icon: '✂️' },
    { name: 'Gym', icon: '🏋️' },
    { name: 'Hotels', icon: '🛏️' },
    { name: 'Home Services', icon: '🛋️', label: 'Home' },
  ];

  useEffect(() => {
    const categoryAliases = {
      'Food & Restaurant': 'Restaurants',
      Fashion: 'Clothing',
      'Beauty & Health': 'Beauty Salon',
      'Home & Kitchen': 'Home Services',
      Services: 'Home Services',
      More: 'All',
    };
    setSelectedCategory(categoryAliases[initialCategory] || initialCategory || 'All');
  }, [initialCategory]);

  useEffect(() => {
    const query = String(initialSearchQuery || '');
    setSearchQuery(query);
    setSearchTrigger(query);
  }, [initialSearchQuery]);

  useEffect(() => {
    let active = true;
    fetchHeroImage().then((url) => active && setHeroImage(url)).catch(() => {});
    const onHeroChange = (event) => setHeroImage(event.detail);
    window.addEventListener(HERO_IMAGE_EVENT, onHeroChange);
    return () => {
      active = false;
      window.removeEventListener(HERO_IMAGE_EVENT, onHeroChange);
    };
  }, []);

  // The typed location drives "Based on Your Location"; wait until the user stops typing.
  useEffect(() => {
    const typed = locationQuery.trim();
    const timer = setTimeout(() => {
      setFeedArea(typed && typed !== DEFAULT_LOCATION ? typed : '');
    }, 600);
    return () => clearTimeout(timer);
  }, [locationQuery]);

  // Use GPS silently only when the visitor has already granted permission.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return;
    let active = true;
    navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (!active || permission.state !== 'granted') return;
      navigator.geolocation.getCurrentPosition(
        (position) => active && setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => {},
        { maximumAge: 10 * 60 * 1000, timeout: 8000 }
      );
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      Swal.fire({ icon: 'info', text: translate('Location is not available in this browser.', 'यो ब्राउजरमा स्थान उपलब्ध छैन।') });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationQuery(DEFAULT_LOCATION);
        setLocating(false);
      },
      () => {
        setLocating(false);
        Swal.fire({ icon: 'info', text: translate('Allow location access to see businesses near you, or type your area.', 'नजिकका व्यवसाय हेर्न स्थान अनुमति दिनुहोस् वा आफ्नो क्षेत्र लेख्नुहोस्।') });
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const safeString = (value) => (typeof value === 'string' ? value : '');
  const safeNumber = (value, fallback = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };
  const triggerSearch = (value = '') => {
    const nextQuery = String(value ?? '').trim();
    setSearchQuery(nextQuery);
    setSearchTrigger(nextQuery);
  };
  const isLiveBusiness = (business) => {
    if (!business) return false;
    if (business.approvalStatus === 'approved') return true;
    if (business.isVerified === true) return true;
    return business.verified === 'verified';
  };

  useEffect(() => {
    let active = true;
    const refreshReviews = async () => {
      try {
        const response = await api.get('/api/reviews?limit=12');
        if (!active) return;
        const reviews = (Array.isArray(response.data) ? response.data : [])
          .filter((review) => typeof review.comment === 'string' && review.comment.trim())
          .slice(0, 3);
        setCustomerReviews(reviews);
      } catch {
        if (active) setCustomerReviews([]);
      }
    };
    refreshReviews();
    window.addEventListener('review-created', refreshReviews);
    return () => {
      active = false;
      window.removeEventListener('review-created', refreshReviews);
    };
  }, []);

  const activeSearchQuery = searchTrigger || searchQuery;
  const typedLocation = locationQuery && locationQuery !== DEFAULT_LOCATION
    ? locationQuery.toLowerCase().replace(', nepal', '').trim()
    : '';
  const filtersActive = selectedCategory !== 'All' || Boolean(activeSearchQuery) || Boolean(typedLocation);

  const filteredBizs = useMemo(() => {
    let list = (Array.isArray(businesses) ? businesses : []).filter((b) => isLiveBusiness(b));
    if (selectedCategory !== 'All') {
      const group = QUICK_FILTER_GROUP[selectedCategory];
      list = list.filter((b) => (group
        ? matchesCategoryGroup(b, group)
        : safeString(b.category).toLowerCase().includes(selectedCategory.toLowerCase())));
    }
    if (activeSearchQuery) {
      list = list.filter((b) => matchesSearchQuery(b, activeSearchQuery, ['name', 'description', 'category', 'location']));
    }
    if (typedLocation) {
      list = list.filter((b) => safeString(b.location).toLowerCase().includes(typedLocation));
    }
    return list.sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
  }, [businesses, selectedCategory, activeSearchQuery, typedLocation]);

  // Feed cards carry distance, price range and reasons; fall back to the catalog entry otherwise.
  const feedCardById = useMemo(() => {
    const map = new Map();
    (feed?.popular || []).forEach((card) => map.set(String(card._id), card));
    return map;
  }, [feed]);

  const clearFilters = () => {
    setSelectedCategory('All');
    triggerSearch('');
    setLocationQuery(DEFAULT_LOCATION);
  };

  const dealCount = Array.isArray(feed?.deals?.items) ? feed.deals.items.length : null;

  const handleShopNow = (business) => {
    const tab = business.offeringType === 'services' ? 'services' : 'products';
    navigate(`/business-profile/${business._id}?tab=${tab}`);
  };

  const handleFindGems = () => {
    triggerSearch(searchQuery);
    document.getElementById('businesses')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="mp-home w-full min-h-screen">
      {catalogStatus === 'error' && (
        <div className="flex items-center justify-between gap-3 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>Some marketplace data could not be loaded.</span>
          <button type="button" onClick={onRetryCatalog} className="rounded-full bg-white px-3 py-1 text-xs font-bold">Retry</button>
        </div>
      )}

      {/* HERO — full bleed */}
      <section
        id="home"
        className="mp-hero"
        style={{ backgroundImage: heroBackground(heroImage) }}
      >
        <div className="mp-hero-inner">
          <div className="max-w-2xl">
            <h1 className="mp-display text-[clamp(2.4rem,5.5vw,4.4rem)] font-semibold leading-[1.05] tracking-[-0.02em] text-white">
              {translate('CONNECT WITH THE HEART OF YOUR COMMUNITY', 'समुदायको मुटुसँग जोडिनुहोस्')}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-base">
              {translate(
                'Discover local businesses, products, and services from all over from Nepal.',
                'नेपालभरिका स्थानीय व्यवसाय, उत्पादन र सेवाहरू पत्ता लगाउनुहोस्।'
              )}
            </p>

            <div className="mt-7 flex max-w-xl items-center gap-3 rounded-full bg-white px-4 py-3 shadow-lg">
              <FiMapPin className="h-5 w-5 shrink-0 text-[var(--mp-gold)]" />
              <input
                type="text"
                value={locationQuery}
                onChange={(e) => {
                  setLocationQuery(e.target.value);
                  setCoords(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleFindGems()}
                className="w-full bg-transparent text-sm font-medium text-[var(--mp-ink)] outline-none placeholder:text-[var(--mp-muted)]"
                placeholder={DEFAULT_LOCATION}
                aria-label="Location"
              />
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                  coords ? 'bg-emerald-50 text-emerald-700' : 'text-[var(--mp-brown)] hover:bg-[var(--mp-cream)]'
                }`}
                title={translate('Use my current location', 'मेरो हालको स्थान प्रयोग गर्नुहोस्')}
              >
                <FiNavigation className="h-3.5 w-3.5" />
                {locating ? translate('Locating…', 'खोज्दै…') : coords ? translate('Near me', 'नजिकै') : translate('Use my location', 'मेरो स्थान')}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleFindGems}
                className="rounded-full bg-[var(--mp-gold)] px-7 py-3 text-sm font-semibold text-[var(--mp-ink)] shadow-md transition hover:bg-[var(--accent-hover)]"
              >
                {translate('Find Local Gems', 'स्थानीय रत्न खोज्नुहोस्')}
              </button>
              <button
                type="button"
                onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
                className="rounded-full border border-white/70 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                {translate('See How It Works', 'कसरी काम गर्छ')}
              </button>
            </div>
          </div>

          <div className="mp-deals-ring" role="group" aria-label="Local deals available now">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--mp-muted)]">
                Local Deals Live
              </p>
              <p className="mp-display mt-1 text-[clamp(2.2rem,3.6vw,3rem)] font-semibold tabular-nums text-[var(--mp-ink)]">
                {dealCount === null ? '—' : dealCount}
              </p>
              <p className="text-[10px] font-semibold text-[var(--mp-muted)]">
                {dealCount === 1 ? 'discount' : 'discounts'} from local shops
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORY QUICK-FILTERS */}
      <section id="categories" className="w-full border-b border-[var(--mp-border)] bg-[var(--mp-cream)] px-4 py-5 sm:px-6 lg:px-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--mp-brown)]">
            Category Quick-Filters
          </h2>
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mp-gold-ink)] hover:text-[var(--mp-brown)]"
          >
            View All
          </button>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {categories.map((cat) => {
            const active = selectedCategory.toLowerCase() === cat.name.toLowerCase();
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategory(active ? 'All' : cat.name)}
                aria-pressed={active}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
                  active
                    ? 'border-[var(--mp-gold)] bg-[var(--mp-gold)] text-[var(--mp-ink)]'
                    : 'border-[var(--mp-border)] bg-[var(--mp-paper)] text-[var(--mp-brown)] hover:border-[var(--mp-gold)]'
                }`}
              >
                <span className="text-sm" aria-hidden>{cat.icon}</span>
                <span>{cat.label || cat.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* MAIN: featured + recommendations + popular | deals + activity */}
      <div id="businesses" className="w-full px-4 py-6 sm:px-6 lg:px-10">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {filtersActive ? (
              <section className="rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-4 shadow-[var(--shadow-sm)] sm:p-5" aria-live="polite">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[var(--mp-ink)]">
                      {filteredBizs.length} {filteredBizs.length === 1 ? 'business' : 'businesses'} found
                    </h2>
                    <p className="text-xs text-[var(--mp-muted)]">
                      {[
                        selectedCategory !== 'All' && (categories.find((c) => c.name === selectedCategory)?.label || selectedCategory),
                        activeSearchQuery && `“${activeSearchQuery}”`,
                        typedLocation && `in ${locationQuery}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--mp-border)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--mp-brown)] hover:border-[var(--mp-gold)]"
                  >
                    <FiX /> Clear filters
                  </button>
                </div>
                {catalogStatus === 'loading' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
                    {[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-[#ece3d6]" />)}
                  </div>
                ) : filteredBizs.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredBizs.map((biz) => (
                      <BusinessRecCard
                        key={biz._id}
                        business={{ ...biz, ...(feedCardById.get(String(biz._id)) || {}), reason: '' }}
                        size="lg"
                        saved={isSavedBusiness(biz._id)}
                        onOpen={onOpenBusiness}
                        onToggleSave={toggleSaved}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white py-12 text-center text-[var(--mp-muted)]">
                    <FiClock className="mx-auto h-8 w-8 opacity-50" />
                    <p className="mt-3 text-sm">{translate('No businesses match your filters yet.', 'हालका फिल्टरमा कुनै पसल मेल खाँदैन।')}</p>
                  </div>
                )}
              </section>
            ) : (
              <>
                {feedStatus === 'loading' && !feed && (
                  <div className="h-[430px] animate-pulse rounded-[24px] bg-[#e4d9c8] md:h-[250px]" aria-hidden />
                )}
                <FeaturedCarousel items={feed?.featured || []} onVisit={onOpenBusiness} onShop={handleShopNow} />
              </>
            )}

            <AiRecommendations
              feed={feed}
              status={feedStatus}
              user={user}
              onOpenBusiness={onOpenBusiness}
              onToggleSave={toggleSaved}
              isSaved={isSavedBusiness}
              onRetry={reloadFeed}
              area={feedArea}
              coords={coords}
            />

            <PopularBusinesses
              businesses={feed?.popular || []}
              status={feedStatus}
              onOpenBusiness={onOpenBusiness}
              onToggleSave={toggleSaved}
              isSaved={isSavedBusiness}
            />
          </div>

          <aside className="space-y-6 xl:sticky xl:top-24 xl:h-fit">
            <TopDeals deals={feed?.deals} status={feedStatus} onOpenProduct={onOpenProduct} />
            <CustomerReviews
              reviews={customerReviews}
              businesses={businesses}
              title={translate('What Our Customers Say', 'हाम्रा ग्राहकहरू के भन्छन्')}
              onOpenBusiness={onOpenBusiness}
            />
            <RecentActivity
              user={user}
              activity={feed?.activity || []}
              status={feedStatus}
              onOpenBusiness={onOpenBusiness}
              onViewAll={() => onOpenDashboard('customer-dashboard')}
              onSignIn={() => onOpenDashboard('account')}
            />
          </aside>
        </div>

        {/* How it works + CTA */}
        <section id="how" className="mt-12 grid gap-4 rounded-[28px] bg-[var(--mp-brown-deep)] px-6 py-10 text-white sm:grid-cols-[1.4fr_auto] sm:items-center sm:px-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mp-gold-soft)]">Grow with your community</p>
            <h2 className="mp-display mt-2 text-3xl font-semibold sm:text-4xl">Be a Part of UdyogConnect</h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">List your business. Reach more customers. Grow together.</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenDashboard('dashboard')}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mp-gold)] px-6 py-3 text-sm font-bold text-[var(--mp-ink)] transition hover:bg-[var(--accent-hover)]"
          >
            Register Your Business <FiArrowRight />
          </button>
        </section>

        <section id="contact" className="mt-10 pb-8 text-center text-xs text-[var(--mp-muted)]">
          UdyogConnect · Shop Local · Support Local
        </section>
      </div>
    </div>
  );
}
