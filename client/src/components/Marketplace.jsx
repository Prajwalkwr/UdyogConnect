import React, { useState, useEffect } from 'react';
import {
  FiSearch, FiMic, FiMapPin, FiStar, FiClock, FiHeart, FiHome,
  FiArrowRight, FiCheckCircle, FiUser, FiShoppingBag,
} from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { matchesSearchQuery } from '../utils/search';
import { getBusinessAvailabilityMeta } from '../utils/businessAvailability';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=2000&q=80';

const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80',
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [locationQuery, setLocationQuery] = useState('Kathmandu, Nepal');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [distanceFilter] = useState(50);
  const [minRating] = useState(0);
  const [openNow] = useState(false);
  const [deliveryOnly] = useState(false);
  const [sortBy] = useState('popular');
  const [isListening, setIsListening] = useState(false);
  const [aiRecs, setAiRecs] = useState({ businesses: [], products: [] });
  const [customerReviews, setCustomerReviews] = useState([]);
  const [timeLeft, setTimeLeft] = useState('07:24:07');
  const [dealTimers, setDealTimers] = useState({});

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  const isWishlisted = (type, id) => {
    const items = user?.wishlist?.[type];
    return Array.isArray(items) && items.some((item) => String(item?._id || item?.id || item) === String(id));
  };

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
    const timer = setInterval(() => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight - now;
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);
      setTimeLeft(
        `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) {
      setAiRecs({ businesses: [], products: [] });
      return;
    }
    api.get('/api/ai/recommendations')
      .then((res) => setAiRecs(res.data))
      .catch(() => setAiRecs({ businesses: [], products: [] }));
  }, [user]);

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
  const displayPrice = (val) => `Rs. ${Number(val || 0).toLocaleString('en-IN')}`;
  const safeText = (value, fallback = '') => {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  };
  const isLiveBusiness = (business) => {
    if (!business) return false;
    if (business.approvalStatus === 'approved') return true;
    if (business.isVerified === true) return true;
    return business.verified === 'verified';
  };
  const safeName = (entity) => safeText(entity?.name, 'Unknown');
  const businessImage = (business, index = 0) =>
    business?.imageUrl || business?.logoUrl || business?.logo || business?.coverUrl || business?.image || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length];

  const safeProducts = (Array.isArray(products) ? products : []).filter((p) => {
    const parentBiz = Array.isArray(businesses) ? businesses.find((b) => b._id === p.businessId) : null;
    return isLiveBusiness(parentBiz);
  });

  const popularProducts = [...safeProducts]
    .filter((p) => safeNumber(p.discount) > 0 || safeNumber(p.rating) >= 3.5)
    .sort((a, b) => safeNumber(b.discount) - safeNumber(a.discount) || safeNumber(b.rating) - safeNumber(a.rating));

  const verifiedBusinesses = Array.isArray(businesses) ? businesses.filter((b) => isLiveBusiness(b)) : [];

  useEffect(() => {
    let active = true;
    const refreshReviews = async () => {
      try {
        const response = await api.get('/api/reviews?limit=12');
        if (!active) return;
        const reviews = (Array.isArray(response.data) ? response.data : [])
          .filter((review) => safeText(review.comment))
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

  useEffect(() => {
    const ids = popularProducts.slice(0, 4).map((p) => p._id);
    setDealTimers((prev) => {
      const next = { ...prev };
      ids.forEach((id, i) => {
        if (!next[id]) {
          const base = 3 * 3600 + 20 * 60 + 7 - i * 417;
          next[id] = Math.max(900, base);
        }
      });
      return next;
    });
  }, [popularProducts.map((p) => p._id).join(',')]);

  useEffect(() => {
    const id = setInterval(() => {
      setDealTimers((prev) => {
        const next = {};
        Object.entries(prev).forEach(([key, val]) => {
          next[key] = Math.max(0, Number(val) - 1);
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const formatDealTimer = (seconds) => {
    const total = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`;
  };

  const activeSearchQuery = searchTrigger || searchQuery;
  let filteredBizs = Array.isArray(businesses) ? [...businesses] : [];
  filteredBizs = filteredBizs.filter((b) => isLiveBusiness(b));

  if (selectedCategory !== 'All') {
    const cat = selectedCategory.toLowerCase();
    filteredBizs = filteredBizs.filter((b) => {
      const bc = safeString(b.category).toLowerCase();
      if (cat === 'restaurants') return bc.includes('restaurant') || bc.includes('food');
      if (cat === 'home services') return bc.includes('home') || bc.includes('service');
      if (cat === 'beauty salon') return bc.includes('beauty') || bc.includes('health');
      return bc.includes(cat) || bc === cat;
    });
  }

  if (activeSearchQuery) {
    filteredBizs = filteredBizs.filter((b) =>
      matchesSearchQuery(b, activeSearchQuery, ['name', 'description', 'category', 'location'])
    );
  }

  if (locationQuery && locationQuery !== 'Kathmandu, Nepal') {
    const loc = locationQuery.toLowerCase().replace(', nepal', '').trim();
    if (loc) {
      filteredBizs = filteredBizs.filter((b) => safeString(b.location).toLowerCase().includes(loc));
    }
  }

  filteredBizs = filteredBizs.filter((b) => {
    if (!b?.distance) return true;
    const distanceVal = parseFloat(b.distance);
    if (Number.isNaN(distanceVal)) return true;
    return distanceVal <= distanceFilter;
  });

  if (minRating > 0) filteredBizs = filteredBizs.filter((b) => safeNumber(b.rating) >= minRating);
  if (openNow) filteredBizs = filteredBizs.filter((b) => getBusinessAvailabilityMeta(b).isOpen);
  if (deliveryOnly) filteredBizs = filteredBizs.filter((b) => b.deliveryAvailable !== false);

  filteredBizs.sort((a, b) => {
    if (sortBy === 'popular') return safeNumber(b.rating) - safeNumber(a.rating);
    if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    return 0;
  });

  const featured = filteredBizs[0];
  const gridBizs = filteredBizs.slice(1, 4);
  const dealProducts = (popularProducts.length ? popularProducts : safeProducts).slice(0, 4);

  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Swal.fire({
        icon: 'error',
        title: translate('Voice Search Unavailable', 'आवाज खोजी अनुपलब्ध'),
        text: translate("Your browser doesn't support speech recognition.", 'तपाईंको ब्राउजरले आवाज पहिचान समर्थन गर्दैन।'),
      });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'en' ? 'en-US' : 'ne-NP';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript;
      triggerSearch(result);
    };
    recognition.start();
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
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
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
                onChange={(e) => setLocationQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFindGems()}
                className="w-full bg-transparent text-sm font-medium text-[var(--mp-ink)] outline-none placeholder:text-[var(--mp-muted)]"
                placeholder="Kathmandu, Nepal"
                aria-label="Location"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleFindGems}
                className="rounded-full bg-[var(--mp-gold)] px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)]"
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

          <div className="mp-deals-ring" aria-label="Local deals countdown">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--mp-muted)]">
                Local Deals End In
              </p>
              <p className="mp-display mt-2 text-[clamp(1.8rem,3vw,2.4rem)] font-semibold tabular-nums text-[var(--mp-ink)]">
                {timeLeft || '07:24:07'}
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
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mp-gold)] hover:text-[var(--mp-brown)]"
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
                className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
                  active
                    ? 'border-[var(--mp-gold)] bg-[var(--mp-gold)] text-white'
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

      {/* MAIN: businesses + deals */}
      <div id="businesses" className="w-full px-4 py-8 sm:px-6 lg:px-10">
        {catalogStatus === 'loading' && (
          <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-3xl bg-[#e4d9c8]" />)}
          </div>
        )}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {/* Featured wide card */}
            {featured ? (
              <article className="grid overflow-hidden rounded-[28px] bg-[var(--mp-brown-deep)] shadow-[var(--shadow-md)] md:grid-cols-[1.05fr_1fr]">
                <div className="relative min-h-[260px]">
                  <img
                    src={businessImage(featured, 0)}
                    alt={safeName(featured)}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-[var(--mp-ink)] shadow">
                    <FiStar className="h-3.5 w-3.5 fill-[var(--mp-gold)] text-[var(--mp-gold)]" />
                    {safeNumber(featured.rating).toFixed(1)}
                  </span>
                </div>
                <div className="flex flex-col justify-center p-6 text-white sm:p-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mp-display text-2xl font-semibold sm:text-3xl">{safeName(featured)}</h3>
                    {(featured.verified === 'verified' || featured.approvalStatus === 'approved') && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--mp-brown)]">
                        <FiCheckCircle className="h-3 w-3" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/75 line-clamp-3">
                    {safeText(featured.description, 'Handcrafted gifts, home decor, and local art pieces')}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenBusiness(featured._id)}
                      className="rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[var(--mp-brown-deep)] transition hover:bg-[var(--mp-cream)]"
                    >
                      Visit Profile
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBusiness(featured._id)}
                      className="rounded-full border border-[var(--mp-gold)] px-5 py-2.5 text-xs font-bold text-[var(--mp-gold-soft)] transition hover:bg-[var(--mp-gold)] hover:text-white"
                    >
                      Shop Now
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <div className="rounded-[28px] border border-[var(--mp-border)] bg-[var(--mp-paper)] py-16 text-center text-[var(--mp-muted)]">
                <FiClock className="mx-auto h-8 w-8 opacity-50" />
                <p className="mt-3 text-sm">{translate('No businesses match your filters yet.', 'हालका फिल्टरमा कुनै पसल मेल खाँदैन।')}</p>
              </div>
            )}

            {/* Photo cards row */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(gridBizs.length ? gridBizs : filteredBizs.slice(0, 3)).map((biz, index) => (
                <article
                  key={biz._id}
                  onClick={() => onOpenBusiness(biz._id)}
                  className="group cursor-pointer overflow-hidden rounded-[24px] bg-[var(--mp-paper)] shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={businessImage(biz, index + 1)}
                      alt={safeName(biz)}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleWishlist?.('businesses', biz._id); }}
                      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[var(--mp-brown)] shadow"
                      aria-label="Save business"
                    >
                      <FiHeart className="h-3.5 w-3.5" fill={isWishlisted('businesses', biz._id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="p-4">
                    <h4 className="mp-display text-xl font-semibold text-[var(--mp-ink)]">{safeName(biz)}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--mp-muted)] line-clamp-2">
                      {safeText(biz.description, 'Local favorite near you')}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-[var(--mp-gold)]">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <FiStar
                          key={i}
                          className={`h-3.5 w-3.5 ${i < Math.round(safeNumber(biz.rating)) ? 'fill-[var(--mp-gold)]' : 'opacity-25'}`}
                        />
                      ))}
                      <span className="ml-1 text-xs font-bold text-[var(--mp-ink)]">{safeNumber(biz.rating).toFixed(1)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filteredBizs.length > 4 && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredBizs.slice(4).map((biz, index) => (
                  <article
                    key={biz._id}
                    onClick={() => onOpenBusiness(biz._id)}
                    className="group cursor-pointer overflow-hidden rounded-[24px] bg-[var(--mp-paper)] shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)]"
                  >
                    <div className="relative h-40 overflow-hidden">
                      <img src={businessImage(biz, index + 4)} alt={safeName(biz)} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-4">
                      <h4 className="font-semibold text-[var(--mp-ink)]">{safeName(biz)}</h4>
                      <p className="mt-1 text-xs text-[var(--mp-muted)] line-clamp-1">{safeText(biz.category)}</p>
                      <div className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--mp-gold)]">
                        <FiStar className="h-3.5 w-3.5 fill-[var(--mp-gold)]" />
                        {safeNumber(biz.rating).toFixed(1)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* TOP LOCAL DEALS */}
          <aside id="products" className="h-fit rounded-[28px] border border-[var(--mp-border)] bg-[var(--mp-paper)] p-5 shadow-[var(--shadow-sm)] xl:sticky xl:top-24">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="mp-display text-2xl font-semibold text-[var(--mp-ink)]">Top Local Deals</h3>
            </div>
            <div className="space-y-3">
              {dealProducts.map((p) => {
                const discount = safeNumber(p.discount) || 20;
                const discounted = safeNumber(p.price) - (safeNumber(p.price) * discount) / 100;
                const parent = verifiedBusinesses.find((b) => String(b._id) === String(p.businessId));
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => onOpenProduct(p._id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-[var(--mp-border)] bg-white p-2.5 text-left transition hover:border-[var(--mp-gold)]"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#eee4d6]">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg">🛍️</div>
                      )}
                      <span className="absolute left-1 top-1 rounded bg-[#c0392b] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        -{discount}%
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[var(--mp-ink)]">
                        {safeText(parent?.name, p.brand || 'Local')} Deal
                      </p>
                      <p className="truncate text-[10px] text-[var(--mp-muted)]">{safeText(p.name)}</p>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-[var(--mp-ink)]">{displayPrice(discounted)}</span>
                        <span className="text-[10px] text-[var(--mp-muted)] line-through">{displayPrice(p.price)}</span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] tabular-nums text-[var(--mp-gold)]">
                        {formatDealTimer(dealTimers[p._id])}
                      </p>
                    </div>
                  </button>
                );
              })}
              {dealProducts.length === 0 && (
                <p className="py-8 text-center text-sm text-[var(--mp-muted)]">Deals will appear here soon.</p>
              )}
            </div>
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
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--mp-gold)] px-6 py-3 text-sm font-bold text-white transition hover:bg-[var(--accent-hover)]"
          >
            Register Your Business <FiArrowRight />
          </button>
        </section>

        {customerReviews.length > 0 && (
          <section id="community" className="mt-10">
            <h2 className="mp-display text-3xl font-semibold text-[var(--mp-ink)]">
              {translate('What Our Customers Say', 'हाम्रा ग्राहकहरू के भन्छन्')}
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {customerReviews.map((review) => (
                <article key={review._id} className="rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-paper)] p-5">
                  <div className="flex items-center gap-2 text-[var(--mp-gold)]">
                    <FiUser className="text-[var(--mp-muted)]" />
                    <span>{'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--mp-ink)]">“{review.comment}”</p>
                  <p className="mt-2 text-xs text-[var(--mp-muted)]">Customer of {review.businessName}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="contact" className="mt-10 pb-8 text-center text-xs text-[var(--mp-muted)]">
          UdyogConnect · Shop Local · Support Local
        </section>
      </div>
    </div>
  );
}
