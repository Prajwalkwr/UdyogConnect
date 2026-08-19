import React, { useState, useEffect } from 'react';
import { FiSearch, FiMic, FiSliders, FiMapPin, FiStar, FiClock, FiShoppingBag, FiTruck, FiGift, FiChevronRight, FiGrid, FiArrowRight, FiPercent, FiZap, FiAward, FiCheckCircle, FiBriefcase, FiTrendingUp, FiHeart, FiHome } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { matchesSearchQuery } from '../utils/search';
import { getBusinessAvailabilityMeta } from '../utils/businessAvailability';

export default function Marketplace({
  user,
  businesses,
  products,
  lang,
  onOpenProduct,
  onOpenBusiness,
  onAddToCart,
  onOpenDashboard,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTrigger, setSearchTrigger] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState(15); // max km
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [sortBy, setSortBy] = useState('popular'); // 'popular' | 'price' | 'distance' | 'newest'
  const [isListening, setIsListening] = useState(false);
  const [aiRecs, setAiRecs] = useState({ businesses: [], products: [] });
  const [showSuggestions, setShowSuggestions] = useState(false);

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
      triggerSearch(result);
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
        triggerSearch('basket');
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

  // Retrieve AI Recommendations only for authenticated users
  useEffect(() => {
    if (!user) {
      setAiRecs({ businesses: [], products: [] });
      return;
    }

    api.get('/api/ai/recommendations')
      .then(res => setAiRecs(res.data))
      .catch(() => {
        setAiRecs({ businesses: [], products: [] });
      });
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
    setShowSuggestions(false);
  };

  const displayPrice = (val) => {
    return `Rs. ${Number(val || 0).toLocaleString('en-IN')}`;
  };

  const safeText = (value, fallback = '') => {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (typeof value === 'number') return String(value);
    return fallback;
  };

  const safeName = (entity) => safeText(entity?.name, 'Unknown');
  const safeProducts = (Array.isArray(products) ? products : []).filter((p) => {
    const parentBiz = Array.isArray(businesses) ? businesses.find((b) => b._id === p.businessId) : null;
    return parentBiz && parentBiz.verified === 'verified';
  });

  const verifiedBusinesses = Array.isArray(businesses)
    ? businesses.filter((b) => b?.verified === 'verified')
    : [];

  const activeSearchQuery = searchTrigger || searchQuery;
  const searchSuggestions = (activeSearchQuery ? [
    ...verifiedBusinesses
      .filter((b) => matchesSearchQuery(b, activeSearchQuery, ['name', 'description', 'category', 'location']))
      .slice(0, 4)
      .map((b) => ({
        id: `biz-${b._id}`,
        type: 'business',
        label: safeName(b),
        subtitle: safeText(b?.category, 'Shop'),
        onSelect: () => {
          triggerSearch(safeName(b));
          onOpenBusiness(b._id);
        },
      })),
    ...safeProducts.filter((p) => matchesSearchQuery(p, activeSearchQuery, ['name', 'description', 'brand', 'category'])).slice(0, 4).map((p) => ({
      id: `prod-${p._id}`,
      type: 'product',
      label: safeText(p?.name, 'Product'),
      subtitle: safeText(p?.brand, 'Product'),
      onSelect: () => {
        triggerSearch(safeText(p?.name, ''));
        onOpenProduct(p._id);
      },
    })),
  ] : []).slice(0, 6);

  // Apply filtering rules client-side (to complement server results)
  let filteredBizs = Array.isArray(businesses) ? [...businesses] : [];
  // Only show verified businesses to the buyer
  filteredBizs = filteredBizs.filter(b => b.verified === 'verified');

  // Category
  if (selectedCategory !== 'All') {
    filteredBizs = filteredBizs.filter(b => safeString(b.category).toLowerCase() === selectedCategory.toLowerCase());
  }

  // Text search
  if (activeSearchQuery) {
    filteredBizs = filteredBizs.filter((b) =>
      matchesSearchQuery(b, activeSearchQuery, ['name', 'description', 'category', 'location'])
    );
  }

  // Distance Slider Filter
  filteredBizs = filteredBizs.filter((b) => {
    if (!b?.distance) return true;
    const distanceVal = parseFloat(b.distance);
    const radiusLimit = Number(b.deliveryRadiusKm || b.radius || 0);
    const effectiveLimit = radiusLimit > 0 ? Math.min(distanceFilter, radiusLimit) : distanceFilter;
    if (isNaN(distanceVal)) return true;
    return distanceVal <= effectiveLimit;
  });

  // Rating Filter
  if (minRating > 0) {
    filteredBizs = filteredBizs.filter(b => safeNumber(b.rating) >= minRating);
  }

  // Open Now / delivery filter
  if (openNow) {
    filteredBizs = filteredBizs.filter((b) => getBusinessAvailabilityMeta(b).isOpen);
  }

  if (deliveryOnly) {
    filteredBizs = filteredBizs.filter((b) => getBusinessAvailabilityMeta(b).deliveryAvailable);
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

  const [hr, min, sec] = (timeLeft || '05:40:04').split(':');

  return (
    <div className="min-h-screen bg-[#FDFBF7] py-6">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        
        {/* Banner Section */}
        <section className="relative mb-6 overflow-hidden rounded-[24px] bg-gradient-to-r from-[#0C121F] via-[#4A3B18] to-[#F2B71D] px-6 py-8 shadow-md text-white sm:px-8 sm:py-10">
          {/* Nepal Stupa SVG Backdrop */}
          <div className="absolute right-[10%] bottom-0 h-44 w-64 opacity-25 pointer-events-none hidden md:block">
            <svg viewBox="0 0 200 200" fill="none" className="w-full h-full text-[#F2B71D]" stroke="currentColor" strokeWidth="1.5">
              {/* Stupa Spire */}
              <path d="M100,10 L100,50 M95,45 L105,45 M90,40 L110,40 M85,35 L115,35 M80,30 L120,30 M75,25 L125,25 M70,20 L130,20" />
              {/* Spire Base */}
              <rect x="85" y="50" width="30" height="25" fill="#F2B71D" opacity="0.3" />
              {/* Wisdom Eyes */}
              <circle cx="94" cy="62" r="2.5" fill="currentColor" />
              <circle cx="106" cy="62" r="2.5" fill="currentColor" />
              <path d="M97,68 Q100,72 103,68" strokeWidth="2" />
              {/* Stupa Dome */}
              <path d="M50,135 C50,75 150,75 150,135 Z" fill="#F2B71D" opacity="0.2" />
              {/* Plinth */}
              <rect x="35" y="135" width="130" height="15" fill="#F2B71D" opacity="0.5" rx="3" />
              <rect x="25" y="150" width="150" height="10" fill="#F2B71D" opacity="0.6" rx="2" />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[720px]">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-black/30 border border-white/20 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#F2B71D]">
                <FiZap className="h-3.5 w-3.5 fill-[#F2B71D]" />
                <span>{translate('LIMITED TIME FLASH DEAL', 'सीमित समयको धमाका अफर')}</span>
              </div>

              <h2 className="text-[2.2rem] font-black leading-[1.0] tracking-[-0.04em] text-white sm:text-[3.2rem] lg:text-[4.2rem]">
                Local Business <span className="text-[#F2B71D]">Carnival</span>
              </h2>

              <p className="mt-4 max-w-[620px] text-xs sm:text-sm md:text-base text-[#F4F4F5] font-medium leading-relaxed">
                {translate('Earn double loyalty reward points (+20) and receive up to 15% discount on all handicraft products.', 'दोब्बर लोयल्टी पोइन्ट र हस्तकला सामग्रीहरूमा १५% सम्मको विशेष छुट पाउनुहोस्।')}
              </p>
            </div>

            {/* Countdown Box */}
            <div className="flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-[280px] overflow-hidden rounded-[20px] bg-black/45 px-5 py-4 text-center border border-white/10 backdrop-blur-md">
                <div className="mb-3 flex items-center justify-center gap-1.5 text-center text-[#F2B71D]">
                  <FiClock className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{translate('ENDS IN', 'बाँकी समय')}</span>
                </div>

                <div className="mb-2 flex items-center justify-center gap-3 font-mono text-[2.2rem] font-extrabold tracking-tight text-white">
                  <span>{hr || '05'}</span>
                  <span className="text-[#F2B71D] animate-pulse">:</span>
                  <span>{min || '40'}</span>
                  <span className="text-[#F2B71D] animate-pulse">:</span>
                  <span>{sec || '04'}</span>
                </div>

                <div className="mt-3 flex justify-between px-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                  <span>Hours</span>
                  <span>Min</span>
                  <span>Sec</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Search & Filters Controls */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 flex items-center bg-white border border-[#F0EAD6] rounded-full px-3 py-1.5 shadow-sm">
            <FiSearch className="text-gray-400 h-5 w-5 ml-2 mr-2" />
            <input
              type="text"
              placeholder={translate('Search stores, products, services...', 'पसल, उत्पादन, वा सेवा खोज्नुहोस्...')}
              value={searchQuery}
              onChange={(e) => {
                const nextValue = e.target.value;
                setSearchQuery(nextValue);
                setSearchTrigger(nextValue);
                setShowSuggestions(Boolean(nextValue.trim()));
              }}
              onFocus={() => setShowSuggestions(Boolean(searchQuery.trim()))}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  triggerSearch(searchQuery);
                }
              }}
              className="w-full bg-transparent py-2 text-sm text-[#0B1A30] placeholder:text-gray-400 outline-none pr-10"
            />
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-[18px] border border-[#F0EAD6] bg-white p-2 shadow-xl max-h-64 overflow-y-auto">
                {searchSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      suggestion.onSelect();
                      setShowSuggestions(false);
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-gray-600 hover:bg-[#FDFBF7] transition cursor-pointer"
                  >
                    <span>
                      <span className="block font-semibold text-[#0B1A30]">{suggestion.label}</span>
                      <span className="text-xs text-gray-500">{suggestion.subtitle}</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#E0A615] shrink-0">{suggestion.type}</span>
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={() => triggerSearch(searchQuery)}
                className="bg-[#F2B71D] hover:bg-[#E0A615] text-[#0B1A30] font-bold px-5 py-2 rounded-full flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm transition duration-200"
              >
                <FiSearch className="h-4 w-4" />
                <span>Search</span>
              </button>
              <button
                onClick={handleVoiceSearch}
                className={`p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 transition cursor-pointer ${isListening ? 'animate-pulse bg-[#FFF5D6] text-[#E0A615]' : ''}`}
                title="Voice Search"
              >
                <FiMic className="h-5 w-5" />
              </button>
              <button
                onClick={handleImageSearch}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 transition cursor-pointer"
                title="Gift Search"
              >
                <FiGift className="h-5 w-5" />
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center justify-center gap-2 rounded-full border border-[#F0EAD6] px-5 py-3 text-sm font-semibold transition cursor-pointer shrink-0 ${
              showFilters ? 'bg-[#FFF5D6] text-[#0B1A30] border-[#F2B71D]' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <FiSliders className="h-4 w-4 text-gray-600" />
            <span>{translate('Filters', 'फिल्टरहरू')}</span>
          </button>
        </div>

        {showFilters && (
          <div className="mb-6 grid gap-4 rounded-[20px] border border-[#F0EAD6] bg-white p-4 shadow-sm sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-2">
              <label className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-gray-600">
                <span>{translate('Distance limit', 'दुरीको सीमा')}</span>
                <span className="text-[#E0A615]">{distanceFilter} km</span>
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={distanceFilter}
                onChange={(e) => setDistanceFilter(parseInt(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-[#F2B71D]"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">{translate('Minimum Rating', 'न्यूनतम रेटिङ')}</span>
              <div className="flex flex-wrap gap-1">
                {[0, 3, 4, 4.5].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMinRating(val)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition border cursor-pointer ${
                      minRating === val
                        ? 'border-[#F2B71D] bg-[#FFF5D6] text-[#0B1A30]'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {val === 0 ? 'All' : `${val} ⭐`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openNow}
                  onChange={(e) => setOpenNow(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#F2B71D] accent-[#F2B71D]"
                />
                <span className="flex items-center gap-1"><FiClock className="h-3.5 w-3.5 text-emerald-500" /> {translate('Open Now', 'अहिले खुल्ला')}</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryOnly}
                  onChange={(e) => setDeliveryOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#F2B71D] accent-[#F2B71D]"
                />
                <span className="flex items-center gap-1"><FiTruck className="h-3.5 w-3.5 text-[#F2B71D]" /> {translate('Delivery Available', 'होम डेलिभरी')}</span>
              </label>
            </div>

            <div className="space-y-2">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-600">{translate('Sort By', 'क्रमबद्ध गर्नुहोस्')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs font-medium outline-none"
              >
                <option value="popular">{translate('Most Popular', 'लोकप्रिय')}</option>
                <option value="distance">{translate('Nearest Distance', 'नजिकको दुरी')}</option>
                <option value="newest">{translate('Newest Listings', 'नयाँ थपिएको')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Categories Horizontal Row */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 overflow-x-auto pb-3 scrollbar-thin">
            <div className="flex gap-2">
              {categories.map((cat) => {
                const isActive = selectedCategory.toLowerCase() === cat.name.toLowerCase();
                return (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition whitespace-nowrap cursor-pointer border ${
                      isActive
                        ? 'bg-[#F2B71D] text-[#0B1A30] border-[#F2B71D] shadow-sm'
                        : 'bg-white text-[#0B1A30] border-[#F0EAD6] hover:bg-gray-50'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{translate(cat.name, cat.name)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* AI Recommendations Card Header + Grid */}
        {user && (aiRecs.businesses.length > 0 || aiRecs.products.length > 0) && (
          <section className="mb-8 overflow-hidden rounded-[20px] border border-[#F0EAD6] bg-white shadow-sm">
            <div className="bg-[#0B1A30] px-5 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="text-base font-bold tracking-tight text-white">{translate('AI Business Recommendations', 'एआई व्यवसाय सुझावहरू')}</h3>
                  <p className="text-[11px] text-[#94A3B8]">{translate('Discover the best local businesses near you, based on your interests and location', 'तपाईंको रुचि र स्थानमा आधारित उत्तम स्थानीय व्यवसायहरू पत्ता लगाउनुहोस्।')}</p>
                </div>
              </div>
              <button className="rounded-full bg-[#F2B71D] hover:bg-[#E0A615] px-4 py-1.5 text-xs font-bold text-[#0B1A30] transition cursor-pointer">
                {translate('View All', 'सबै हेर्नुहोस्')} &rarr;
              </button>
            </div>

            <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {aiRecs.businesses.slice(0, 3).map((b) => (
                <div
                  key={b._id}
                  onClick={() => onOpenBusiness(b._id)}
                  className="group cursor-pointer overflow-hidden rounded-[16px] border border-gray-100 bg-white shadow-sm hover:shadow-md transition duration-200"
                >
                  <div className="relative h-40 bg-gray-50">
                    {b.imageUrl ? (
                      <img src={b.imageUrl} alt={b.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FFF5D6] to-[#F2B71D] text-3xl font-black text-[#0B1A30]">{safeName(b).charAt(0)}</div>
                    )}
                    {b.verified === 'verified' && (
                      <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-[#F2B71D] px-2 py-0.5 text-[9px] font-bold uppercase text-[#0B1A30]">
                        Verified
                      </span>
                    )}
                    <button className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0B1A30] shadow-sm hover:text-red-500 transition">
                      <FiHeart className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-[#0B1A30]">{b.name}</h4>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                          <FiStar className="h-3 w-3 fill-[#F2B71D] text-[#F2B71D]" />
                          <span className="font-bold text-[#0B1A30]">{b.rating || '4.8'}</span>
                          <span>({b.reviewCount || 120} reviews)</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="font-semibold text-[#E0A615] bg-[#FFF5D6] px-2 py-0.5 rounded-md">{b.category}</span>
                      <span className="flex items-center gap-1"><FiMapPin className="h-3 w-3 text-[#F2B71D]" /> {b.distance || '0.5 km'}</span>
                    </div>

                    <p className="mt-2 text-xs text-gray-600 line-clamp-1">{b.description || 'Fresh products, best quality'}</p>

                    <button className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#F2B71D] hover:bg-[#E0A615] py-2 text-xs font-bold text-[#0B1A30] transition">
                      <FiHome className="h-3.5 w-3.5" />
                      <span>{translate('View Business', 'व्यवसाय हेर्नुहोस्')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main Content Columns: Featured Businesses + Hot Deals */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          
          {/* Featured Businesses */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold tracking-tight text-[#0B1A30]">{translate('Featured Businesses', 'प्रमुख पसलहरू')}</h3>
              <span className="text-xs text-gray-500">{filteredBizs.length} {translate('shops found', 'पसलहरू फेला परे')}</span>
            </div>

            {filteredBizs.length === 0 ? (
              <div className="rounded-[20px] border border-[#F0EAD6] bg-white py-12 text-center text-gray-600 shadow-sm">
                <FiClock className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-3 text-sm">{translate('No businesses match your active filter settings right now.', 'हालका फिल्टरमा कुनै पसल मेल खाँदैन।')}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredBizs.map((biz) => (
                  <article
                    key={biz._id}
                    onClick={() => onOpenBusiness(biz._id)}
                    className="group cursor-pointer overflow-hidden rounded-[20px] border border-[#F0EAD6] bg-white shadow-sm hover:shadow-md transition duration-200"
                  >
                    <div className="relative h-40 bg-gray-50">
                      {biz.imageUrl ? (
                        <img src={biz.imageUrl} alt={biz.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FFF5D6] to-[#F2B71D] text-3xl font-black text-[#0B1A30]">
                          {safeName(biz).charAt(0)}
                        </div>
                      )}
                      {biz.verified === 'verified' && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md bg-[#F2B71D] px-2 py-0.5 text-[9px] font-bold uppercase text-[#0B1A30]">
                          Verified
                        </span>
                      )}
                      <button className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0B1A30] shadow-sm hover:text-red-500 transition">
                        <FiHeart className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-bold text-[#0B1A30]">{biz.name}</h4>
                          <span className="inline-block mt-1 text-[10px] font-semibold text-[#E0A615] bg-[#FFF5D6] px-2 py-0.5 rounded-md">{biz.category}</span>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-[#FFF5D6] px-2 py-0.5 text-xs font-bold text-[#E0A615]">
                          <FiStar className="h-3.5 w-3.5 fill-[#F2B71D] text-[#F2B71D]" /> 
                          <span>{biz.rating || '4.6'}</span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-gray-500">
                        <span className="flex items-center gap-1"><FiMapPin className="h-3.5 w-3.5 text-[#F2B71D]" /> {biz.location}</span>
                        <span>{biz.distance || '0.5 km'}</span>
                      </div>

                      <p className="mt-2 text-xs text-gray-600 line-clamp-1">{biz.description || 'Delicious food, great ambiance'}</p>

                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${getBusinessAvailabilityMeta(biz).isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {getBusinessAvailabilityMeta(biz).isOpen ? 'Open' : 'Closed'}
                        </span>
                        <button className="inline-flex items-center gap-1 rounded-lg bg-[#F2B71D] hover:bg-[#E0A615] px-3.5 py-1.5 text-xs font-bold text-[#0B1A30] transition">
                          <FiHome className="h-3.5 w-3.5" />
                          <span>{translate('View Business', 'व्यवसाय हेर्नुहोस्')}</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Hot Deals Sidebar */}
          <aside className="rounded-[20px] border border-[#F0EAD6] bg-white p-5 shadow-sm h-fit">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-1.5 text-base font-bold tracking-tight text-[#0B1A30]">
                <span className="text-xl">🔥</span>
                <span>{translate('Hot Deals', 'लोकप्रिय सामान')}</span>
              </h3>
              <button className="text-xs font-bold text-[#E0A615] hover:text-[#0B1A30] transition cursor-pointer">{translate('View All', 'सबै हेर्नुहोस्')} &rarr;</button>
            </div>

            <div className="space-y-3">
              {safeProducts.slice(0, 3).map((p) => {
                const discountedPrice = safeNumber(p.price) - (safeNumber(p.price) * safeNumber(p.discount)) / 100;
                return (
                  <div key={p._id} className="flex items-center gap-3 rounded-[16px] border border-gray-100 bg-[#FDFBF7] p-2.5 transition hover:bg-[#FFF5D6]">
                    <div className="h-16 w-16 overflow-hidden rounded-lg bg-gray-100 shrink-0">
                      {p.images && p.images[0] ? (
                        <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl bg-[#FFF5D6]">🛍️</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-xs font-bold text-[#0B1A30]">{p.name}</h4>
                          <p className="mt-0.5 text-[10px] text-gray-500">{p.brand || 'Local Brand'}</p>
                        </div>
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 whitespace-nowrap">{p.discount || 20}% OFF</span>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        <span className="font-bold text-[#E0A615]">{displayPrice(discountedPrice)}</span>
                        <span className="text-[10px] text-gray-400 line-through">{displayPrice(p.price)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenProduct(p._id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F2B71D] hover:bg-[#E0A615] text-[#0B1A30] shrink-0 font-bold transition cursor-pointer"
                    >
                      &rarr;
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>

        {/* Why Choose & stats widgets */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Why Choose UdyogConnect */}
          <section className="rounded-[20px] border border-[#F0EAD6] bg-[#FFFBF0] p-6 shadow-sm">
            <div className="flex items-center gap-3.5 mb-5">
              <span className="text-3xl">💡</span>
              <div>
                <h3 className="text-base font-bold text-[#0B1A30]">{translate('Why Choose UdyogConnect?', 'UdyogConnect किन रोज्ने?')}</h3>
                <p className="text-xs text-gray-500">Smart • Trusted • Local</p>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] flex items-start gap-3">
                <span className="text-xl">🛡️</span>
                <div>
                  <h4 className="text-xs font-bold text-[#0B1A30]">{translate('Verified Businesses', 'प्रमाणित पसलहरू')}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">{translate('Trust only verified local shops', 'प्रमाणित पसलहरूमा विश्वास गर्नुहोस्')}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] flex items-start gap-3">
                <span className="text-xl">🤝</span>
                <div>
                  <h4 className="text-xs font-bold text-[#0B1A30]">{translate('Local Support', 'स्थानीय समर्थन')}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">{translate('Support your local economy', 'आफ्नो स्थानीय अर्थतन्त्रलाई टेवा दिनुहोस्')}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] flex items-start gap-3">
                <span className="text-xl">🏷️</span>
                <div>
                  <h4 className="text-xs font-bold text-[#0B1A30]">{translate('Best Deals', 'सर्वोत्तम सौदे')}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">{translate('Exclusive offers just for you', 'तपाईंका लागि मात्रै विशेष अफरहरू')}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] flex items-start gap-3">
                <span className="text-xl">🚀</span>
                <div>
                  <h4 className="text-xs font-bold text-[#0B1A30]">{translate('Fast & Easy', 'द्रुत र सहज')}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">{translate('Shop, order and track easily', 'सजिलै किनमेल गर्नुहोस् र ट्र्याक गर्नुहोस्')}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Stats & Explore */}
          <section className="rounded-[20px] border border-[#F0EAD6] bg-[#FFFBF0] p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3.5 mb-4">
                <span className="text-3xl">📍</span>
                <div>
                  <h3 className="text-base font-bold text-[#0B1A30]">{translate('My Local Business', 'मेरो स्थानीय व्यवसाय')}</h3>
                  <p className="text-xs text-gray-500">{translate('Find businesses near your location', 'आफ्नो स्थान नजिकैका पसलहरू खोज्नुहोस्')}</p>
                </div>
              </div>

              <div className="grid gap-3 grid-cols-3 mb-5">
                <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] text-center">
                  <p className="text-lg font-bold text-[#E0A615]">1,250+</p>
                  <p className="text-[9px] font-semibold text-gray-500 mt-0.5">Local Businesses</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] text-center">
                  <p className="text-lg font-bold text-[#E0A615]">50K+</p>
                  <p className="text-[9px] font-semibold text-gray-500 mt-0.5">Happy Customers</p>
                </div>
                <div className="bg-white rounded-xl p-3 border border-[#F0EAD6] text-center">
                  <p className="text-lg font-bold text-[#E0A615]">5+</p>
                  <p className="text-[9px] font-semibold text-gray-500 mt-0.5">Cities Covered</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedCategory('All')}
              className="w-full bg-[#F2B71D] hover:bg-[#E0A615] text-[#0B1A30] font-bold py-3.5 px-6 rounded-full flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <span>Explore Nearby</span>
              <span>&rarr;</span>
            </button>
          </section>
        </div>

      </div>
    </div>
  );
}
