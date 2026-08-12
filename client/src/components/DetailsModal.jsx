import React, { useState, useEffect } from 'react';
import { FiX, FiClock, FiMapPin, FiStar, FiShoppingBag, FiCalendar, FiFlag, FiUser, FiInfo, FiTruck } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { useDispatch } from 'react-redux';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';

export default function DetailsModal({
  businessId,
  productId,
  onClose,
  onAddToCart,
  lang,
  user,
}) {
  const dispatch = useDispatch();
  const [businessData, setBusinessData] = useState(null);
  const [activeTab, setActiveTab] = useState('products'); // 'products' | 'services' | 'reviews'
  const [loading, setLoading] = useState(true);

  // Booking Form State
  const [bookingService, setBookingService] = useState(null);
  const [bookingDate, setBookingDate] = useState('');
  const [bookingSlot, setBookingSlot] = useState('');
  const [bookingStaff, setBookingStaff] = useState('');
  const [bookingHome, setBookingHome] = useState(false);

  // Add Review State
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewImage, setReviewImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    let targetBizId = businessId;

    if (productId && !businessId) {
      // Find businessId from product catalog first
      api.get('/api/products').then((res) => {
        const prod = res.data.find((p) => p._id === productId);
        if (prod) {
          fetchBusinessDetails(prod.businessId);
        }
      });
    } else if (businessId) {
      fetchBusinessDetails(businessId);
    }
  }, [businessId, productId]);

  const fetchBusinessDetails = (id) => {
    setLoading(true);
    api
      .get(`/api/businesses/${id}`)
      .then((res) => {
        setBusinessData(res.data);
        const offering = res.data?.business?.offeringType || 'both';
        if (offering === 'services') {
          setActiveTab('services');
        } else {
          setActiveTab('products');
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  if (!businessId && !productId) return null;

  const displayPrice = (val) => {
    return `Rs. ${val}`;
  };

  const handleBooking = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!user) {
      Swal.fire({ icon: 'warning', text: translate('Please sign in to book an appointment.', 'कृपया अपोइन्टमेन्ट बुक गर्न लगइन गर्नुहोस्।') });
      submitGuard.finish();
      return;
    }
    if (!bookingDate || !bookingSlot) {
      Swal.fire({ icon: 'error', text: 'Select date and slot.' });
      submitGuard.finish();
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(
        '/api/bookings',
        {
          businessId: businessData.business._id,
          serviceId: bookingService._id,
          date: bookingDate,
          timeSlot: bookingSlot,
          staffMember: bookingStaff,
          homeService: bookingHome,
        },
        { headers: { ...createIdempotencyHeader('booking-create') } }
      );

      Swal.fire({
        icon: 'success',
        title: translate('Booking Confirmed!', 'बुकिङ सफल!'),
        text: `${bookingService.name} is booked on ${bookingDate} at ${bookingSlot}.`,
      });

      setBookingService(null);
      setBookingDate('');
      setBookingSlot('');
      setBookingStaff('');
      setBookingHome(false);
      fetchBusinessDetails(businessData.business._id);
    } catch (err) {
      Swal.fire({ icon: 'error', text: 'Booking request failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handlePostReview = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!user) {
      Swal.fire({ icon: 'warning', text: translate('Please log in to leave a review.', 'समीक्षा राख्न कृपया लगइन गर्नुहोस्।') });
      submitGuard.finish();
      return;
    }

    try {
      const formData = new FormData();
      formData.append('businessId', businessData.business._id);
      formData.append('targetId', businessData.business._id);
      formData.append('targetType', 'business');
      formData.append('rating', reviewRating);
      formData.append('comment', reviewComment);
      if (reviewImage) {
        formData.append('image', reviewImage);
      }

      await api.post('/api/reviews', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...createIdempotencyHeader('review-create'),
        },
      });

      Swal.fire({ icon: 'success', title: translate('Review Posted', 'समीक्षा पोस्ट भयो') });
      setReviewComment('');
      setReviewImage(null);
      fetchBusinessDetails(businessData.business._id);
    } catch (err) {
      Swal.fire({ icon: 'error', text: 'Failed to upload review.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleReportReview = async (reviewId) => {
    try {
      await api.put(`/api/reviews/${reviewId}/report`, {});
      Swal.fire({
        icon: 'success',
        title: translate('Report Submitted', 'रिपोर्ट पेश भयो'),
        text: translate('This review has been flagged for admin safety moderation.', 'यस समीक्षालाई प्रशासक समक्ष फ्ल्याग गरिएको छ।'),
      });
    } catch (err) {
      Swal.fire({ icon: 'error', text: 'Failed to flag review.' });
    }
  };

  const handleWishlistAdd = async (type, id) => {
    if (!user) {
      Swal.fire({ icon: 'warning', text: 'Log in to add to wishlist.' });
      return;
    }
    try {
      const updatedWishlist = { ...user.wishlist };
      if (!updatedWishlist[type]) updatedWishlist[type] = [];
      
      if (updatedWishlist[type].includes(id)) {
        updatedWishlist[type] = updatedWishlist[type].filter(item => item !== id);
        Swal.fire({ icon: 'success', text: 'Removed from favorites' });
      } else {
        updatedWishlist[type].push(id);
        Swal.fire({ icon: 'success', text: 'Added to favorites' });
      }
      
      await api.put('/api/auth/profile', { wishlist: updatedWishlist });
      const updatedUser = { ...user, wishlist: updatedWishlist };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      dispatch({ type: 'SET_USER', payload: updatedUser });
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-[32px] border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header Visual */}
        <div className="relative h-44 sm:h-52 bg-slate-950 flex-shrink-0">
          {businessData?.business?.bannerUrl ? (
            <img src={businessData.business.bannerUrl} alt="banner" className="h-full w-full object-cover opacity-60" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-indigo-500/20 via-slate-950 to-amber-500/20" />
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full bg-slate-900/60 p-2 text-slate-400 hover:text-white backdrop-blur-md"
          >
            <FiX className="h-6 w-6" />
          </button>

          {/* Profile details */}
          <div className="absolute bottom-4 left-6 flex items-end gap-4">
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-slate-900 border-2 border-slate-800 flex items-center justify-center text-4xl shadow-xl">
              {businessData?.business?.imageUrl ? (
                <img src={businessData.business.imageUrl} alt="logo" className="h-full w-full object-cover rounded-2xl" />
              ) : (
                businessData?.business?.name?.charAt(0) || '🏪'
              )}
            </div>
            <div className="mb-1 text-left">
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">{businessData?.business?.name}</h2>
                {businessData?.business?.verified === 'verified' && (
                  <span className="rounded-full bg-cyan-400/10 border border-cyan-400/20 px-2 py-0.5 text-[9px] font-bold text-cyan-300">
                    ✓ Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>{businessData?.business?.category}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><FiMapPin /> {businessData?.business?.location}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 text-left">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto"></div>
              <p className="mt-3 text-sm">{translate('Loading catalogs...', 'विवरण लोड हुँदैछ...')}</p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column: Business Bio Details */}
              <div className="space-y-4 lg:col-span-1">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{translate('Information', 'विवरण')}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{businessData.business.description}</p>
                  
                  <div className="pt-2 space-y-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <FiClock className="text-amber-400" />
                      <span>{businessData.business.hours}</span>
                    </div>
                    {businessData.business.phone && (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-400">📞</span>
                        <span>{businessData.business.phone}</span>
                      </div>
                    )}
                    {businessData.business.website && (
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-slate-400">🌐</span>
                        <a href={businessData.business.website} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">{businessData.business.website}</a>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleWishlistAdd('businesses', businessData.business._id)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                    >
                      <FiStar className="text-amber-400" />
                      <span>{translate('Favorite Shop', 'मनपर्ने सूचीमा थप्नुहोस्')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Tab View Lists */}
              <div className="lg:col-span-2 space-y-4">
                {/* Tabs Switcher */}
                <div className="flex border-b border-slate-800">
                  {[
                    { key: 'products', label: translate('Products', 'उत्पादनहरू') },
                    { key: 'services', label: translate('Services & Bookings', 'सेवा तथा बुकिङ') },
                    { key: 'reviews', label: translate('Reviews', 'समीक्षाहरू') },
                  ].filter(tab => {
                    const offering = businessData?.business?.offeringType || 'both';
                    if (tab.key === 'products' && offering === 'services') return false;
                    if (tab.key === 'services' && offering === 'products') return false;
                    return true;
                  }).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
                        activeTab === tab.key
                          ? 'border-amber-400 text-amber-300'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Products Tab */}
                {activeTab === 'products' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {businessData.products.length === 0 ? (
                      <div className="sm:col-span-2 py-10 text-center text-xs text-slate-500">
                        {translate('No products currently listed.', 'हाल कुनै उत्पादनहरू सूचीकृत छैनन्।')}
                      </div>
                    ) : (
                      businessData.products.map((p) => {
                        const finalPrice = p.price - (p.price * (p.discount || 0)) / 100;
                        return (
                          <div key={p._id} className="rounded-xl border border-slate-805 bg-slate-950/20 p-3.5 flex flex-col justify-between">
                            <div>
                              <div className="h-24 w-full bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
                                {p.images && p.images[0] ? (
                                  <img src={p.images[0]} alt="product" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-xl">🛍️</span>
                                )}
                              </div>
                              <h4 className="font-bold text-slate-200 text-sm mt-2">{p.name}</h4>
                              <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{p.description}</p>
                              <div className="mt-2 text-[10px] text-slate-500 font-mono">SKU: {p.sku}</div>
                              <div className={`mt-1 text-[10px] font-bold ${p.stock > 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                                {p.stock > 0 ? `Stock: ${p.stock}` : translate('Out of stock', 'स्टक छैन')}
                              </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                              <div>
                                <span className="font-black text-amber-300 text-sm">{displayPrice(finalPrice)}</span>
                                {p.discount > 0 && (
                                  <span className="text-[10px] text-slate-500 line-through ml-1">{displayPrice(p.price)}</span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  onAddToCart({ id: p._id, name: p.name, price: finalPrice, quantity: 1, seller: businessData.business.name, stock: p.stock });
                                  Swal.fire({ icon: 'success', text: translate('Added to cart', 'कार्टमा थपियो'), timer: 800, showConfirmButton: false });
                                }}
                                disabled={p.stock <= 0}
                                className={`rounded-lg px-3 py-1 text-xs font-bold ${p.stock > 0 ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                              >
                                {p.stock > 0 ? '+ Add' : translate('Sold Out', 'बिकिसकेको')}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Services Tab */}
                {activeTab === 'services' && (
                  <div className="space-y-3">
                    {bookingService ? (
                      /* Slot Booking overlay form */
                      <form onSubmit={handleBooking} className="rounded-2xl border border-amber-400/20 bg-slate-950/30 p-4 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                          <h4 className="font-bold text-sm text-white">{translate('Schedule Appointment', 'अपोइन्टमेन्ट तालिका')}</h4>
                          <button type="button" onClick={() => setBookingService(null)} className="text-xs text-rose-400">{translate('Cancel', 'रद्द गर्नुहोस्')}</button>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-450 uppercase">{translate('Service Name', 'सेवाको नाम')}</label>
                          <p className="text-sm font-bold text-slate-200">{bookingService.name}</p>
                          <p className="text-xs text-amber-400 font-bold mt-1">{displayPrice(bookingService.price)} ({bookingService.duration} mins)</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">{translate('Choose Date', 'मिति चयन')}</label>
                            <input
                              type="date"
                              value={bookingDate}
                              onChange={(e) => setBookingDate(e.target.value)}
                              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">{translate('Available Slot', 'उपलब्ध समय')}</label>
                            <select
                              value={bookingSlot}
                              onChange={(e) => setBookingSlot(e.target.value)}
                              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                              required
                            >
                              <option value="">-- select slot --</option>
                              {bookingService.slots.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-450 uppercase mb-1">{translate('Staff Member', 'कर्मचारी')}</label>
                            <select
                              value={bookingStaff}
                              onChange={(e) => setBookingStaff(e.target.value)}
                              className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                            >
                              <option value="">Any Staff</option>
                              {bookingService.staff.map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </div>
                          {bookingService.homeService && (
                            <div className="flex items-center gap-2 mt-4">
                              <input
                                type="checkbox"
                                checked={bookingHome}
                                onChange={(e) => setBookingHome(e.target.checked)}
                                className="h-4 w-4 rounded accent-amber-400"
                              />
                              <span className="text-xs text-slate-300 flex items-center gap-1"><FiTruck /> {translate('Provide Home Service', 'घरमै सेवा उपलब्ध')}</span>
                            </div>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
                        >
                          {isSubmitting ? translate('Processing...', 'प्रोसेस हुँदै...') : translate('Confirm Appointment', 'अपोइन्टमेन्ट पक्का गर्नुहोस्')}
                        </button>
                      </form>
                    ) : (
                      /* Services List */
                      businessData.services.length === 0 ? (
                        <div className="py-10 text-center text-xs text-slate-500">
                          {translate('No service catalogs configured.', 'कुनै सेवा सूचीकृत छैन।')}
                        </div>
                      ) : (
                        businessData.services.map((s) => (
                          <div key={s._id} className="rounded-xl border border-slate-850 bg-slate-950/20 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                            <div>
                              <h4 className="font-bold text-slate-200 text-sm">{s.name}</h4>
                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{s.description}</p>
                              <div className="mt-2 flex gap-3 text-[10px] text-slate-450">
                                <span>⏱ {s.duration} mins</span>
                                {s.homeService && <span className="text-emerald-400">✓ Home Service Available</span>}
                              </div>
                            </div>
                            <div className="mt-4 sm:mt-0 text-right flex flex-col items-end gap-2">
                              <span className="font-black text-amber-300 text-sm">{displayPrice(s.price)}</span>
                              <button
                                onClick={() => setBookingService(s)}
                                className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-450 hover:text-slate-950 transition"
                              >
                                <FiCalendar />
                                <span>Book</span>
                              </button>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                )}

                {/* Reviews Tab */}
                {activeTab === 'reviews' && (
                  <div className="space-y-4">
                    {/* Add Review Form */}
                    <form onSubmit={handlePostReview} className="rounded-xl border border-slate-850 bg-slate-950/20 p-4 space-y-3">
                      <h4 className="font-bold text-xs text-white uppercase tracking-wider">{translate('Leave a feedback review', 'आफ्नो प्रतिक्रिया राख्नुहोस्')}</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{translate('Rating Stars:', 'रेटिङ:')}</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setReviewRating(star)}
                              className={`text-lg transition ${reviewRating >= star ? 'text-amber-400' : 'text-slate-600'}`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder={translate('Describe your dining, shopping or service experience...', 'आफ्नो अनुभव लेख्नुहोस्...')}
                        className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                        rows="3"
                        required
                      />
                      <div className="flex items-center justify-between">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setReviewImage(e.target.files[0])}
                          className="text-xs text-slate-400"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
                        >
                          {isSubmitting ? translate('Processing...', 'प्रोसेस हुँदै...') : 'Submit'}
                        </button>
                      </div>
                    </form>

                    {/* Reviews List */}
                    <div className="space-y-3">
                      {businessData.reviews.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          {translate('No customer reviews posted yet.', 'अहिलेसम्म कुनै समीक्षा गरिएको छैन।')}
                        </div>
                      ) : (
                        businessData.reviews.map((r) => (
                          <div key={r._id} className="rounded-xl border border-slate-850/50 bg-slate-950/10 p-3">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                  {r.customerName.charAt(0)}
                                </div>
                                <div>
                                  <h5 className="text-xs font-bold text-slate-200">{r.customerName}</h5>
                                  <div className="flex gap-0.5 mt-0.5">
                                    {Array.from({ length: r.rating }).map((_, idx) => (
                                      <span key={idx} className="text-[10px] text-amber-400">★</span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleReportReview(r._id)}
                                className="text-slate-550 hover:text-rose-450 p-1 rounded transition"
                                title="Report Fake / Offensive Review"
                              >
                                <FiFlag className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-slate-400 leading-relaxed">{r.comment}</p>
                            {r.images && r.images[0] && (
                              <div className="mt-2 h-16 w-16 bg-slate-900 rounded-lg overflow-hidden">
                                <img src={r.images[0]} alt="review attachment" className="h-full w-full object-cover" />
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
