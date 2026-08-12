import React, { useState, useEffect } from 'react';
import { FiSearch, FiMic, FiSliders, FiMapPin, FiStar, FiClock, FiShoppingBag, FiTruck, FiGift, FiChevronRight, FiGrid, FiArrowRight, FiPercent } from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';

export default function Marketplace({
  user,
  businesses,
  products,
  currency,
  lang,
  onOpenProduct,
  onOpenBusiness,
  onAddToCart,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState(15); // max km
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [sortBy, setSortBy] = useState('popular'); // 'popular' | 'price' | 'distance' | 'newest'
  const [isListening, setIsListening] = useState(false);
  const [aiRecs, setAiRecs] = useState({ businesses: [], products: [] });

  // Countdown timer for Flash Sales
  const [timeLeft, setTimeLeft] = useState('');

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  const categories = [
    { name: 'All', icon: <FiGrid /> },
    { name: 'Grocery', icon: '🛒' },
    { name: 'Restaurants', icon: '🍔' },
    { name: 'Electronics', icon: '💻' },
    { name: 'Clothing', icon: '👕' },
    { name: 'Pharmacy', icon: '💊' },
    { name: 'Beauty Salon', icon: '💇' },
    { name: 'Gym', icon: '🏋️' },
    { name: 'Hotels', icon: '🏨' },
    { name: 'Home Services', icon: '🧹' },
    { name: 'Mechanics', icon: '🔧' },
    { name: 'Mobile Repair', icon: '📱' },
    { name: 'Laundry', icon: '🧺' },
    { name: 'Furniture', icon: '🪑' },
    { name: 'Bakery', icon: '🍞' },
    { name: 'Gift Shop', icon: '🎁' }
  ];

  // Speech Recognition voice search handler
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      Swal.fire({
        icon: 'error',
        title: translate('Voice Search Unsuitable', 'आवाज खोजी अनुपयुक्त'),
        text: translate('Your current browser doesn\'t support speech recognition.', 'तपाईंको ब्राउजरले आवाज पहिचान समर्थन गर्दैन।'),
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'en' ? 'en-US' : 'ne-NP';
    recognition.onstart = () => {
      setIsListening(true);
      Swal.fire({
        title: translate('Listening...', 'सुन्दैछ...'),
        text: translate('Say business name or category', 'पसलको नाम वा विधा बोल्नुहोस्'),
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      Swal.close();
    };

    recognition.onresult = (event) => {
      const result = event.results[0][0].transcript;
      setSearchQuery(result);
      Swal.fire({
        icon: 'success',
        title: translate('Captured Query', 'खोजी शब्द प्राप्त भयो'),
        text: `"${result}"`,
        timer: 1500,
        showConfirmButton: false,
      });
    };

    recognition.start();
  };

  // Image search simulation
  const handleImageSearch = () => {
    Swal.fire({
      title: translate('Image Product Search', 'तस्विर मार्फत खोज्नुहोस्'),
      text: translate('Upload or drag in an image of a local craft, food, or item to recognize it.', 'सामानको तस्विर हालेर खोज्नुहोस्।'),
      input: 'file',
      inputAttributes: {
        accept: 'image/*',
        'aria-label': 'Upload product image'
      },
      showCancelButton: true,
      confirmButtonText: translate('Search', 'खोज्नुहोस्'),
      confirmButtonColor: '#fbbf24',
    }).then((result) => {
      if (result.value) {
        // Mock search analysis
        Swal.fire({
          icon: 'success',
          title: translate('Match Found!', 'नतिजा फेला पर्यो!'),
          text: translate('Matched with local artisan "Sunar Craft House" items.', '"Sunar Craft House" का सामानहरूसँग मेल खायो।'),
        });
        setSearchQuery('basket');
      }
    });
  };

  // Countdown clock effect
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Next midnight
      const diff = midnight - now;

      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff / (1000 * 60)) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      setTimeLeft(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Retrieve AI Recommendations if token exists
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/api/ai/recommendations', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => setAiRecs(res.data))
        .catch(err => console.log('AI recs offline'));
    }
  }, [user]);

  // Apply filtering rules client-side (to complement server results)
  let filteredBizs = [...businesses];

  // Category
  if (selectedCategory !== 'All') {
    filteredBizs = filteredBizs.filter(b => b.category.toLowerCase() === selectedCategory.toLowerCase());
  }

  // Text search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredBizs = filteredBizs.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) ||
      b.category.toLowerCase().includes(q)
    );
  }

  // Distance Slider Filter
  filteredBizs = filteredBizs.filter(b => {
    if (!b.distance) return true;
    const distanceVal = parseFloat(b.distance);
    if (isNaN(distanceVal)) return true;
    return distanceVal <= distanceFilter;
  });

  // Rating Filter
  if (minRating > 0) {
    filteredBizs = filteredBizs.filter(b => b.rating >= minRating);
  }

  // Open Now Mock
  if (openNow) {
    filteredBizs = filteredBizs.filter(b => {
      const hr = new Date().getHours();
      return hr >= 9 && hr < 20; // assumed 9am - 8pm open hours
    });
  }

  // Sorting
  filteredBizs.sort((a, b) => {
    if (sortBy === 'popular') return b.rating - a.rating;
    if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === 'distance') {
      const d1 = parseFloat(a.distance) || 0;
      const d2 = parseFloat(b.distance) || 0;
      return d1 - d2;
    }
    return 0;
  });

  const displayPrice = (val) => {
    if (currency === 'USD') {
      return `$ ${(parseFloat(val) / 130).toFixed(2)}`; // static NPR->USD rate
    }
    return `रु ${val}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* 1. Flash Sale / Event Promo Banner */}
      <section className="relative mb-8 overflow-hidden rounded-[32px] border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-slate-900 to-emerald-500/5 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2 text-amber-400">
              <FiPercent className="h-5 w-5 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-[0.25em]">{translate('Limited Time Flash Deal', 'सीमित समयको धमाका अफर')}</span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl md:text-4xl">
              {translate('Local Business Carnival', 'स्थानीय व्यवसाय उत्सव')}
            </h2>
            <p className="mt-2 max-w-lg text-sm text-slate-300">
              {translate('Earn double loyalty reward points (+20) and receive up to 15% discount on all handicraft products.', 'दोब्बर लोयल्टी पोइन्ट र हस्तकला सामग्रीहरूमा १५% सम्मको विशेष छुट पाउनुहोस्।')}
            </p>
          </div>
          <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-950/90 px-6 py-4 shadow-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{translate('Ends in', 'बाँकी समय')}</span>
            <span className="mt-1 font-mono text-3xl font-black text-amber-400 tracking-wider">
              {timeLeft || '00:00:00'}
            </span>
          </div>
        </div>
        <div className="absolute top-0 right-0 -z-10 h-32 w-32 bg-amber-400/5 blur-3xl"></div>
      </section>

      {/* 2. Interactive Search Area */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="relative flex-1">
          <FiSearch className="absolute top-4 left-4 text-lg text-slate-400" />
          <input
            type="text"
            placeholder={translate('Search stores, products, services...', 'पसल, उत्पादन, वा सेवा खोज्नुहोस्...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-slate-800/90 bg-slate-900/60 py-3.5 pl-12 pr-24 text-sm text-white placeholder-slate-500 outline-none ring-amber-400/20 transition focus:border-amber-400 focus:bg-slate-900 focus:ring-4"
          />
          <div className="absolute top-2 right-2 flex items-center gap-1">
            <button
              onClick={handleVoiceSearch}
              className={`rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white ${isListening ? 'text-amber-400 animate-pulse bg-amber-500/10' : ''}`}
              title="Voice Search"
            >
              <FiMic className="h-5 w-5" />
            </button>
            <button
              onClick={handleImageSearch}
              className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Image Product Recognition Search"
            >
              <FiGift className="h-5 w-5" />
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition ${
            showFilters ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-slate-800 bg-slate-900/60 text-slate-350 hover:bg-slate-800'
          }`}
        >
          <FiSliders />
          <span>{translate('Filters', 'फिल्टरहरू')}</span>
        </button>
      </div>

      {/* Filters Side panel drawer */}
      {showFilters && (
        <div className="mt-4 grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/40 p-5 md:grid-cols-4 animate-slide-down">
          {/* Distance Filter */}
          <div className="space-y-2">
            <label className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wide">
              <span>{translate('Distance limit', 'दुरीको सीमा')}</span>
              <span className="text-amber-400">{distanceFilter} km</span>
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={distanceFilter}
              onChange={(e) => setDistanceFilter(parseInt(e.target.value))}
              className="w-full accent-amber-400 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Rating */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">{translate('Minimum Rating', 'न्यूनतम रेटिङ')}</span>
            <div className="flex gap-1.5">
              {[0, 3, 4, 4.5].map((val) => (
                <button
                  key={val}
                  onClick={() => setMinRating(val)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    minRating === val
                      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {val === 0 ? 'All' : `${val} ⭐`}
                </button>
              ))}
            </div>
          </div>

          {/* Availability Switches */}
          <div className="flex flex-col gap-2 justify-center">
            <label className="flex items-center gap-2.5 text-xs text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={openNow}
                onChange={(e) => setOpenNow(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-slate-800 bg-slate-950 text-amber-500 accent-amber-400 focus:ring-0"
              />
              <span className="flex items-center gap-1"><FiClock className="text-emerald-400" /> {translate('Open Now', 'अहिले खुल्ला')}</span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-slate-300 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={deliveryOnly}
                onChange={(e) => setDeliveryOnly(e.target.checked)}
                className="h-4.5 w-4.5 rounded border-slate-800 bg-slate-950 text-amber-500 accent-amber-400 focus:ring-0"
              />
              <span className="flex items-center gap-1"><FiTruck className="text-cyan-400" /> {translate('Delivery Available', 'डेलिभरी उपलब्ध')}</span>
            </label>
          </div>

          {/* Sort By */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-slate-400 uppercase tracking-wide">{translate('Sort results by', 'क्रमबद्ध गर्नुहोस्')}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-300 outline-none focus:border-amber-400"
            >
              <option value="popular">{translate('Top Rated (Popular)', 'लोकप्रियता')}</option>
              <option value="distance">{translate('Proximity (Distance)', 'दुरी')}</option>
              <option value="newest">{translate('Recency (New)', 'नयाँ प्रविष्टि')}</option>
            </select>
          </div>
        </div>
      )}

      {/* 3. Categories Horizontal Bar */}
      <div className="mt-8 overflow-x-auto pb-3 scrollbar-hide">
        <div className="flex gap-3">
          {categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`flex items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-bold whitespace-nowrap transition border ${
                selectedCategory === cat.name
                  ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/10'
                  : 'border-slate-800 bg-slate-900/60 text-slate-350 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm">{cat.icon}</span>
              <span>{translate(cat.name, cat.name)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. AI recommendations (Authenticated Customer Shelf) */}
      {user && (aiRecs.businesses.length > 0 || aiRecs.products.length > 0) && (
        <section className="mt-8 rounded-3xl border border-indigo-500/15 bg-indigo-500/5 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-indigo-400">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-xs">✨</span>
            <h3 className="text-sm font-bold uppercase tracking-widest">{translate('AI recommendations for you', 'तपाईंका लागि एआई सुझावहरू')}</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiRecs.businesses.map(b => (
              <div
                key={b._id}
                onClick={() => onOpenBusiness(b._id)}
                className="flex items-center gap-3 rounded-2xl border border-slate-850 bg-slate-950/60 p-3 hover:border-indigo-550/30 cursor-pointer transition hover:translate-y-[-1px]"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                  {b.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{b.name}</h4>
                  <p className="text-[10px] text-slate-450">{b.category} • {b.location}</p>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-[10px] font-bold text-amber-400">★ {b.rating}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Marketplace Grids */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Left Column: Businesses grid */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-extrabold text-white sm:text-2xl">{translate('Featured Businesses', 'प्रमुख पसलहरू')}</h3>
            <span className="text-xs text-slate-400">{filteredBizs.length} {translate('shops found', 'पसलहरू फेला परे')}</span>
          </div>

          {filteredBizs.length === 0 ? (
            <div className="rounded-3xl border border-slate-850 bg-slate-900/20 py-16 text-center text-slate-500">
              <FiClock className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-3 text-sm">{translate('No businesses match your active filter settings.', 'कुनै पसल फेला परेन।')}</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredBizs.map((biz) => (
                <article
                  key={biz._id}
                  onClick={() => onOpenBusiness(biz._id)}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-[24px] border border-slate-800/80 bg-slate-900/40 p-4 transition hover:border-slate-700/80 hover:bg-slate-900/80 cursor-pointer"
                >
                  <div>
                    {/* Visual Banner */}
                    <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl bg-slate-950">
                      {biz.imageUrl ? (
                        <img src={biz.imageUrl} alt={biz.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-amber-400/20 to-emerald-500/20 flex items-center justify-center text-slate-500 text-3xl font-black">
                          {biz.name.charAt(0)}
                        </div>
                      )}
                      {biz.verified === 'verified' && (
                        <span className="absolute top-2 left-2 rounded-full bg-cyan-500/10 border border-cyan-400/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300 backdrop-blur-md">
                          ✓ Verified
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/80 px-2 py-0.5 text-[10px] font-medium text-slate-350">
                        {biz.hours}
                      </span>
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white group-hover:text-amber-400 transition">{biz.name}</h4>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{biz.category}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg bg-slate-950/50 px-2 py-1 text-xs font-semibold text-amber-400">
                        <FiStar className="fill-amber-400 text-amber-400" />
                        <span>{biz.rating}</span>
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs text-slate-400 leading-relaxed">{biz.description}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-850 pt-3">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <FiMapPin className="text-emerald-400" />
                      {biz.location}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 bg-slate-950/40 px-2.5 py-1 rounded-lg">
                      {biz.distance || 'Nearby'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Trending / Discounted Products */}
        <aside className="space-y-6">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
            <FiShoppingBag className="text-amber-400" />
            <span>{translate('Hot Deals', 'लोकप्रिय सामान')}</span>
          </h3>

          <div className="space-y-3">
            {products.slice(0, 4).map((p) => {
              const discountedPrice = p.price - (p.price * (p.discount || 0)) / 100;
              return (
                <div
                  key={p._id}
                  className="group relative flex gap-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/30 p-3 hover:border-slate-700/80"
                >
                  <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center">
                    {p.images && p.images[0] ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg">🛍️</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4
                      onClick={() => onOpenProduct(p._id)}
                      className="text-xs font-bold text-slate-200 hover:text-amber-400 transition cursor-pointer truncate"
                    >
                      {p.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.brand}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-300">{displayPrice(discountedPrice)}</span>
                      {p.discount > 0 && (
                        <span className="text-[10px] text-slate-500 line-through">{displayPrice(p.price)}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      onAddToCart({ id: p._id, name: p.name, price: discountedPrice, quantity: 1, seller: p.brand, businessId: p.businessId });
                      Swal.fire({
                        icon: 'success',
                        title: translate('Added', 'थपियो'),
                        text: `${p.name} in cart.`,
                        timer: 1000,
                        showConfirmButton: false,
                      });
                    }}
                    className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-slate-950 font-bold hover:scale-105 active:scale-95 text-sm"
                    title="Add to Cart"
                  >
                    +
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sell promo card */}
          <div className="rounded-[24px] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-slate-950 p-5 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">UdyogConnect Business</span>
            <h4 className="mt-1 text-sm font-bold text-white">{translate('Run a Small Shop?', 'आफ्नो व्यवसाय छ?')}</h4>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {translate('Register your business, upload legal document proof, verify your location, and list products/services online today.', 'आफ्नो व्यवसाय दर्ता गर्नुहोस्, पसलका कागजातहरू हाल्नुहोस् र आजै अनलाइन बिक्री सुरु गर्नुहोस्।')}
            </p>
            <button
              onClick={() => onOpenDashboard('dashboard')}
              className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-white"
            >
              <span>{translate('Get Started', 'सुरु गर्नुहोस्')}</span>
              <FiChevronRight />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
