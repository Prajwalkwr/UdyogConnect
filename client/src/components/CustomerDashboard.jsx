import React, { useState, useEffect, useMemo } from 'react';
import {
  FiShoppingBag, FiStar, FiCalendar, FiClock, FiHeart, FiChevronRight, FiMapPin,
  FiHome, FiCreditCard, FiPackage, FiShoppingCart, FiCheckCircle, FiCircle,
  FiHeadphones, FiGift, FiGrid, FiTool, FiMoreHorizontal,
} from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import AccountProfileCard from './AccountProfileCard';

const hasWishlistId = (items, id) => Array.isArray(items)
  && items.some((item) => String(item?._id || item?.id || item) === String(id));

const PRODUCT_FALLBACKS = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80',
];

const statusStyle = (status) => {
  const key = String(status || 'pending').toLowerCase();
  if (key.includes('deliver') || key === 'completed') return { bg: '#D1FAE5', color: '#059669', label: 'Delivered' };
  if (key.includes('process')) return { bg: '#DBEAFE', color: '#2563EB', label: 'Processing' };
  if (key.includes('prepar')) return { bg: '#FFEDD5', color: '#EA580C', label: 'Preparing' };
  if (key.includes('confirm')) return { bg: '#FEF3C7', color: '#D97706', label: 'Confirmed' };
  if (key.includes('cancel')) return { bg: '#FEE2E2', color: '#DC2626', label: 'Cancelled' };
  return { bg: '#E0E7FF', color: '#4338CA', label: status || 'Pending' };
};

export default function CustomerDashboard({
  user,
  lang,
  businesses = [],
  products = [],
  onOpenProduct,
  onAddToCart,
  onOpenDashboard,
  onOpenBusiness,
  activeTab,
  onTabChange,
  searchQuery = '',
  cartCount = 0,
}) {
  const [profileData, setProfileData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [customerReviews, setCustomerReviews] = useState([]);
  const [internalTab, setInternalTab] = useState('dashboard');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [reviewForm, setReviewForm] = useState({});

  const currentTab = activeTab ?? internalTab;
  const changeTab = (tab) => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
  };

  const resolveTab = (tab) => {
    if (!tab || tab === 'dashboard') return 'dashboard';
    if (tab === 'settings' || tab === 'addresses' || tab === 'profile') return 'profile';
    if (tab === 'saved' || tab === 'wishlist') return 'wishlist';
    if (tab === 'reviews') return 'reviews';
    if (tab === 'orders') return 'orders';
    if (tab === 'wallet' || tab === 'offers' || tab === 'notifications') return tab;
    if (tab === 'cart') return 'orders';
    return tab;
  };
  const activeView = resolveTab(currentTab);

  const favorites = useMemo(() => {
    const wishlist = user?.wishlist || profileData?.wishlist || {};
    const favoriteBusinesses = (Array.isArray(businesses) ? businesses : [])
      .filter((business) => hasWishlistId(wishlist.businesses, business._id || business.id));
    const favoriteProducts = (Array.isArray(products) ? products : [])
      .filter((product) => hasWishlistId(wishlist.products, product._id || product.id));
    return { products: favoriteProducts, businesses: favoriteBusinesses };
  }, [user?.wishlist, profileData?.wishlist, businesses, products]);

  const wishlistCount = favorites.products.length + favorites.businesses.length;
  const recentOrders = orders.slice(0, 5);
  const firstName = String(user?.name || user?.fullName || 'there').split(' ')[0];
  const walletBalance = Number(user?.loyaltyPoints || profileData?.loyaltyPoints || 0) * 10 || 0;

  const profileChecks = [
    { label: 'Basic Information', done: Boolean(user?.name) },
    { label: 'Phone Number', done: Boolean(user?.phone) },
    { label: 'Address', done: Boolean(user?.location || user?.address) },
    { label: 'Profile Picture', done: Boolean(user?.profilePicture) },
    { label: 'Payment Setup', done: Boolean(user?.paymentSetup || profileData?.paymentSetup) },
  ];
  const profilePct = Math.round((profileChecks.filter((c) => c.done).length / profileChecks.length) * 100);

  const recommendedProducts = useMemo(() => {
    const list = Array.isArray(products) ? [...products] : [];
    return list
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
      .slice(0, 5);
  }, [products]);

  const popularCategories = [
    { name: 'Food & Beverages', icon: '🍽️', key: 'Food & Restaurant' },
    { name: 'Fashion', icon: '👗', key: 'Fashion' },
    { name: 'Electronics', icon: '📱', key: 'Electronics' },
    { name: 'Home & Kitchen', icon: '🏠', key: 'Home & Kitchen' },
    { name: 'Beauty & Health', icon: '💄', key: 'Beauty & Health' },
    { name: 'Services', icon: '🔧', key: 'Services' },
    { name: 'Groceries', icon: '🛒', key: 'Grocery' },
    { name: 'More', icon: '⋯', key: 'More' },
  ];

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  useEffect(() => {
    if (user?._id || user?.id) fetchDashboardData();
  }, [user?._id, user?.id]);

  useEffect(() => {
    if ((user?._id || user?.id) && activeView === 'reviews') fetchCustomerReviews();
  }, [user?._id, user?.id, activeView]);

  const fetchCustomerReviews = async () => {
    try {
      const reviewsRes = await api.get('/api/reviews/mine');
      const reviews = Array.isArray(reviewsRes.data) ? reviewsRes.data : [];
      setCustomerReviews(reviews.map((review) => ({
        ...review,
        businessName: businesses.find((business) => String(business._id) === String(review.businessId))?.name,
      })));
    } catch (error) {
      console.error('Failed to load customer reviews:', error);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const oRes = await api.get('/api/orders');
      setOrders(Array.isArray(oRes.data) ? oRes.data : []);
      const bRes = await api.get('/api/bookings');
      setBookings(Array.isArray(bRes.data) ? bRes.data : []);
      const pRes = await api.get('/api/auth/profile');
      setProfileData(pRes.data);
      fetchCustomerReviews();
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    if ((user?._id || user?.id) && activeView === 'wishlist') {
      api.get('/api/auth/profile')
        .then((pRes) => setProfileData(pRes.data))
        .catch(() => {});
    }
  }, [activeView, user?._id, user?.id, user?.wishlist]);

  useEffect(() => {
    if (!user) return undefined;
    const handleReviewCreated = () => fetchCustomerReviews();
    window.addEventListener('review-created', handleReviewCreated);
    return () => window.removeEventListener('review-created', handleReviewCreated);
  }, [user, businesses]);

  const handleCancelBooking = async (bookingId) => {
    Swal.fire({
      title: translate('Are you sure?', 'के तपाईं पक्का हुनुहुन्छ?'),
      text: translate('You are cancelling this service booking slot.', 'तपाईं यो बुकिङ रद्द गर्दै हुनुहुन्छ।'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: translate('Yes, cancel it!', 'हो, रद्द गर्नुहोस्!'),
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await api.put(`/api/bookings/${bookingId}`, { status: 'cancelled' });
          Swal.fire(translate('Cancelled!', 'रद्द भयो!'), 'Booking cancelled.', 'success');
          fetchDashboardData();
        } catch (e) {
          Swal.fire('Error', 'Action failed.', 'error');
        }
      }
    });
  };

  const handleRescheduleBooking = async (bookingId) => {
    const { value: formValues } = await Swal.fire({
      title: translate('Reschedule Appointment', 'अपोइन्टमेन्ट समय सार्नुहोस्'),
      html:
        '<input id="swal-input1" type="date" class="swal2-input">' +
        '<select id="swal-input2" class="swal2-input">' +
        '<option value="09:00 - 11:00">09:00 - 11:00</option>' +
        '<option value="12:00 - 14:00">12:00 - 14:00</option>' +
        '<option value="15:00 - 17:00">15:00 - 17:00</option>' +
        '</select>',
      focusConfirm: false,
      preConfirm: () => [
        document.getElementById('swal-input1').value,
        document.getElementById('swal-input2').value,
      ],
    });

    if (formValues && formValues[0]) {
      try {
        await api.put(`/api/bookings/${bookingId}`, { date: formValues[0], timeSlot: formValues[1], status: 'pending' });
        Swal.fire('Success', 'Rescheduled booking slot.', 'success');
        fetchDashboardData();
      } catch (e) {
        Swal.fire('Error', 'Action failed.', 'error');
      }
    }
  };

  const handleOrderReview = async (order) => {
    const businessId = order?.businessId || order?.items?.[0]?.businessId || order?.items?.[0]?.business?.id;
    if (!businessId) {
      Swal.fire({ icon: 'error', text: 'This purchase cannot be reviewed right now.' });
      return;
    }
    const form = reviewForm[order._id] || {};
    const rating = Number(form.rating || 5);
    const comment = String(form.comment || '').trim();
    if (!comment) {
      Swal.fire({ icon: 'warning', text: 'Please add a short review before submitting.' });
      return;
    }
    try {
      const response = await api.post('/api/reviews', {
        businessId,
        targetId: businessId,
        targetType: 'business',
        rating,
        comment,
      });
      const submittedReview = response.data?.review;
      if (submittedReview) {
        setCustomerReviews((previous) => [{
          ...submittedReview,
          businessName: businesses.find((business) => String(business._id) === String(businessId))?.name,
        }, ...previous.filter((review) => review._id !== submittedReview._id)]);
      }
      setReviewForm((prev) => ({ ...prev, [order._id]: { rating: 5, comment: '' } }));
      await fetchCustomerReviews();
      Swal.fire({ icon: 'success', title: 'Review Submitted', text: 'Thank you for sharing your feedback.' });
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Unable to submit review.' });
    }
  };

  const orderNo = (order) => `#UC-${String(order._id || '').slice(-4).toUpperCase() || '0000'}`;
  const productImage = (product, index) => product?.images?.[0] || PRODUCT_FALLBACKS[index % PRODUCT_FALLBACKS.length];
  const businessNameForProduct = (product) => {
    const biz = businesses.find((b) => String(b._id) === String(product.businessId));
    return biz?.name || product.brand || 'Local Store';
  };

  const ringStyle = {
    background: `conic-gradient(#F2B71D ${profilePct * 3.6}deg, #E5E7EB 0deg)`,
  };

  return (
    <div className="cd-root w-full bg-[#F4F6F9] text-[#102341]">
      <main className="px-3 pb-6 pt-3 sm:px-5 xl:px-6">
        {activeView === 'profile' && (
          <div className="-mx-3 sm:-mx-5 xl:-mx-6 -mt-3 min-h-[calc(100vh-5rem)] bg-[#F4F6F9] px-3 py-4 sm:px-5 xl:px-6">
            <AccountProfileCard user={user} lang={lang} />
          </div>
        )}

        {activeView === 'dashboard' && (
          <div className="space-y-5">
            {/* Welcome banner */}
            <section className="relative overflow-hidden rounded-2xl border border-[#E8EDF4] bg-gradient-to-r from-[#FFF8E1] via-[#FFFDF7] to-[#E8F4FF] px-5 py-6 sm:px-8">
              <div className="relative z-[1] max-w-xl">
                <h1 className="text-[clamp(1.6rem,3vw,2.1rem)] font-extrabold tracking-tight text-[#102341]">
                  Hello, {firstName}! 👋
                </h1>
                <p className="mt-1.5 text-sm text-[#52627a]">
                  {translate(
                    'Discover local businesses, products, and services near you.',
                    'तपाईं नजिकका स्थानीय व्यवसाय, उत्पादन र सेवाहरू पत्ता लगाउनुहोस्।'
                  )}
                </p>
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] opacity-40 sm:block" aria-hidden>
                <svg viewBox="0 0 320 160" className="h-full w-full text-[#C9A227]" fill="none">
                  <path d="M0 130 L40 90 L70 110 L110 55 L150 95 L190 40 L230 85 L270 60 L320 100 L320 160 L0 160 Z" fill="currentColor" opacity="0.2" />
                  <circle cx="250" cy="70" r="28" stroke="currentColor" strokeWidth="3" opacity="0.45" />
                  <circle cx="250" cy="70" r="10" fill="currentColor" opacity="0.35" />
                  <path d="M250 42 L250 28 M236 70 L222 70 M264 70 L278 70" stroke="currentColor" strokeWidth="2" opacity="0.4" />
                </svg>
              </div>
            </section>

            {/* Stat cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'Total Orders',
                  value: String(orders.length),
                  hint: orders.length ? '+20% from last month' : 'No orders yet',
                  icon: <FiShoppingBag className="h-5 w-5 text-[#2563EB]" />,
                  iconBg: '#DBEAFE',
                  action: () => changeTab('orders'),
                },
                {
                  label: 'Cart Items',
                  value: String(cartCount || '—'),
                  hint: 'View Cart →',
                  icon: <FiShoppingCart className="h-5 w-5 text-[#0EA5E9]" />,
                  iconBg: '#E0F2FE',
                  action: () => onOpenDashboard?.('checkout'),
                },
                {
                  label: 'Wishlist Items',
                  value: String(wishlistCount),
                  hint: 'View Wishlist →',
                  icon: <FiHeart className="h-5 w-5 text-[#EF4444]" />,
                  iconBg: '#FEE2E2',
                  action: () => changeTab('wishlist'),
                },
                {
                  label: 'Wallet Balance',
                  value: `NPR ${walletBalance.toLocaleString('en-IN')}`,
                  hint: 'View Wallet →',
                  icon: <FiCreditCard className="h-5 w-5 text-[#059669]" />,
                  iconBg: '#D1FAE5',
                  action: () => changeTab('wallet'),
                },
              ].map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={card.action}
                  className="rounded-2xl border border-[#E5EBF2] bg-white p-4 text-left shadow-[0_4px_14px_rgba(16,35,65,0.04)] transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#68778c]">{card.label}</p>
                      <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#102341]">{card.value}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[#F2B71D]">{card.hint}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: card.iconBg }}>
                      {card.icon}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Main + right column */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-5">
                {/* Recent Orders */}
                <section className="rounded-2xl border border-[#E5EBF2] bg-white p-4 shadow-[0_4px_14px_rgba(16,35,65,0.04)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-base font-extrabold text-[#102341]">Recent Orders</h2>
                    <button type="button" onClick={() => changeTab('orders')} className="text-xs font-bold text-[#F2B71D] hover:text-[#102341]">
                      View All Orders →
                    </button>
                  </div>

                  {recentOrders.length === 0 ? (
                    <div className="rounded-xl bg-[#F8FAFC] py-10 text-center text-sm text-[#68778c]">
                      You have not placed any orders yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#68778c]">
                            <th className="pb-3 font-semibold">Order No.</th>
                            <th className="pb-3 font-semibold">Date</th>
                            <th className="pb-3 font-semibold">Items</th>
                            <th className="pb-3 font-semibold">Total Amount</th>
                            <th className="pb-3 font-semibold">Status</th>
                            <th className="pb-3 font-semibold">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentOrders.map((order) => {
                            const style = statusStyle(order.status);
                            const items = Array.isArray(order.items) ? order.items : [];
                            return (
                              <tr key={order._id} className="border-b border-[#F3F6FA] last:border-0">
                                <td className="py-3 font-bold text-[#102341]">{orderNo(order)}</td>
                                <td className="py-3 text-[#52627a]">
                                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : '—'}
                                </td>
                                <td className="py-3">
                                  <div className="flex items-center gap-1">
                                    {items.slice(0, 3).map((item, i) => (
                                      <div key={`${order._id}-${i}`} className="h-8 w-8 overflow-hidden rounded-lg bg-[#F1F5F9]">
                                        {item.image || item.images?.[0] ? (
                                          <img src={item.image || item.images[0]} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[10px]">🛍️</div>
                                        )}
                                      </div>
                                    ))}
                                    {items.length > 3 && (
                                      <span className="text-[10px] font-bold text-[#68778c]">+{items.length - 3}</span>
                                    )}
                                    {items.length === 0 && <span className="text-xs text-[#68778c]">—</span>}
                                  </div>
                                </td>
                                <td className="py-3 font-bold text-[#102341]">
                                  NPR {Number(order.total || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3">
                                  <span
                                    className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
                                    style={{ background: style.bg, color: style.color }}
                                  >
                                    {style.label}
                                  </span>
                                </td>
                                <td className="py-3">
                                  <button
                                    type="button"
                                    onClick={() => changeTab('orders')}
                                    className="text-xs font-bold text-[#2563EB] hover:underline"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Quick Actions */}
                <section>
                  <h2 className="mb-3 text-base font-extrabold text-[#102341]">Quick Actions</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Browse Products', icon: <FiGrid />, action: () => onOpenDashboard?.('home') },
                      { label: 'Book a Service', icon: <FiTool />, action: () => onOpenDashboard?.('home') },
                      { label: 'Find Nearby Businesses', icon: <FiMapPin />, action: () => onOpenDashboard?.('home') },
                      { label: 'My Wallet', icon: <FiCreditCard />, action: () => changeTab('wallet') },
                    ].map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.action}
                        className="flex items-center gap-3 rounded-2xl border border-[#E5EBF2] bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-[#F2B71D]"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF5D6] text-[#F2B71D]">
                          {action.icon}
                        </span>
                        <span className="text-sm font-bold text-[#102341]">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Recommended for You */}
                <section className="rounded-2xl border border-[#E5EBF2] bg-white p-4 shadow-[0_4px_14px_rgba(16,35,65,0.04)] sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-base font-extrabold text-[#102341]">Recommended for You</h2>
                    <button type="button" onClick={() => onOpenDashboard?.('home')} className="text-xs font-bold text-[#F2B71D]">
                      View All →
                    </button>
                  </div>
                  {recommendedProducts.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[#68778c]">Products will appear here soon.</div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                      {recommendedProducts.map((product, index) => {
                        const discount = Number(product.discount) || 0;
                        const price = Number(product.price) || 0;
                        const finalPrice = discount > 0 ? price - (price * discount) / 100 : price;
                        return (
                          <article key={product._id} className="overflow-hidden rounded-2xl border border-[#EEF2F7] bg-[#FCFCFD]">
                            <div className="relative h-32 bg-[#F1F5F9]">
                              <img
                                src={productImage(product, index)}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                              {discount > 0 && (
                                <span className="absolute left-2 top-2 rounded-md bg-[#F97316] px-1.5 py-0.5 text-[9px] font-bold text-white">
                                  {discount}% OFF
                                </span>
                              )}
                              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-[#EF4444] shadow">
                                <FiHeart className="h-3.5 w-3.5" />
                              </span>
                            </div>
                            <div className="p-3">
                              <h3 className="truncate text-xs font-bold text-[#102341]">{product.name}</h3>
                              <p className="mt-0.5 truncate text-[10px] text-[#68778c]">{businessNameForProduct(product)}</p>
                              <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#F2B71D]">
                                <FiStar className="h-3 w-3 fill-[#F2B71D]" />
                                {(Number(product.rating) || 4.5).toFixed(1)}
                              </div>
                              <p className="mt-1 text-sm font-extrabold text-[#102341]">
                                NPR {finalPrice.toLocaleString('en-IN')}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onAddToCart) onAddToCart({ ...product, quantity: 1 });
                                  else onOpenProduct?.(product._id);
                                }}
                                className="mt-2 w-full rounded-lg bg-[#F2B71D] py-2 text-[11px] font-bold text-[#102341] transition hover:bg-[#E0A615]"
                              >
                                Add to Cart
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Right sidebar cards */}
              <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
                <section className="rounded-2xl border border-[#E5EBF2] bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-extrabold text-[#102341]">Complete Your Profile</h3>
                  <div className="mx-auto mt-4 flex h-28 w-28 items-center justify-center rounded-full" style={ringStyle}>
                    <div className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full bg-white">
                      <span className="text-2xl font-extrabold text-[#102341]">{profilePct}%</span>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2">
                    {profileChecks.map((item) => (
                      <li key={item.label} className="flex items-center gap-2 text-xs text-[#334155]">
                        {item.done ? (
                          <FiCheckCircle className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <FiCircle className="h-4 w-4 text-[#CBD5E1]" />
                        )}
                        <span className={item.done ? '' : 'text-[#94A3B8]'}>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => changeTab('settings')}
                    className="mt-4 w-full rounded-xl bg-[#0B1A30] py-2.5 text-xs font-bold text-white transition hover:bg-[#152946]"
                  >
                    Complete Profile →
                  </button>
                </section>

                <section className="overflow-hidden rounded-2xl bg-[#0B1A30] p-5 text-white shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#F2B71D]">Special Offers</p>
                      <h3 className="mt-1 text-lg font-extrabold leading-tight">Festive deals on local favourites</h3>
                    </div>
                    <FiGift className="h-8 w-8 text-[#F2B71D]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => changeTab('offers')}
                    className="mt-5 w-full rounded-xl bg-[#F2B71D] py-2.5 text-xs font-bold text-[#102341]"
                  >
                    View Offers →
                  </button>
                </section>

                <section className="rounded-2xl border border-[#E5EBF2] bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-extrabold text-[#102341]">Popular Categories</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {popularCategories.map((cat) => (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat.key);
                          onOpenDashboard?.('home');
                        }}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-2 py-3 text-center transition hover:border-[#F2B71D]"
                      >
                        <span className="text-lg">{cat.icon}</span>
                        <span className="text-[10px] font-semibold leading-tight text-[#334155]">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2563EB] shadow-sm">
                      <FiHeadphones className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#102341]">Quick Support</h3>
                      <p className="text-[11px] text-[#52627a]">We are here 24/7 for you</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => Swal.fire({ icon: 'info', title: 'Support', text: 'Email support@udyogconnect.np or use the chat button.' })}
                    className="mt-3 w-full rounded-xl bg-[#0B1A30] py-2.5 text-xs font-bold text-white"
                  >
                    Contact Support →
                  </button>
                </section>
              </aside>
            </div>

            <footer className="rounded-xl bg-[#DBEAFE] px-4 py-3 text-center text-[11px] font-semibold text-[#1E3A8A]">
              Shop Local • Support Local • Build a Stronger Community
            </footer>
          </div>
        )}

        {activeView === 'wallet' && (
          <div className="mx-auto max-w-lg rounded-2xl border border-[#E5EBF2] bg-white p-8 text-center shadow-sm">
            <FiCreditCard className="mx-auto h-10 w-10 text-[#F2B71D]" />
            <h2 className="mt-3 text-xl font-extrabold">My Wallet</h2>
            <p className="mt-2 text-3xl font-black text-[#102341]">NPR {walletBalance.toLocaleString('en-IN')}</p>
            <p className="mt-2 text-sm text-[#68778c]">Loyalty points convert to wallet credit for local purchases.</p>
          </div>
        )}

        {activeView === 'offers' && (
          <div className="rounded-2xl bg-[#0B1A30] p-8 text-white">
            <h2 className="text-2xl font-extrabold">Offers & Deals</h2>
            <p className="mt-2 text-white/70">Browse the marketplace for the latest local discounts.</p>
            <button type="button" onClick={() => onOpenDashboard?.('home')} className="mt-5 rounded-xl bg-[#F2B71D] px-5 py-2.5 text-sm font-bold text-[#102341]">
              Explore Deals →
            </button>
          </div>
        )}

        {activeView === 'notifications' && (
          <div className="rounded-2xl border border-[#E5EBF2] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold">Notifications</h2>
            <p className="mt-2 text-sm text-[#68778c]">Check the bell icon in the header for your latest updates.</p>
          </div>
        )}

        {activeView === 'orders' && (
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-[#102341]">{translate('Order Status', 'अर्डर स्थिति')}</h3>
            {orders.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#52627a]">You have not placed any orders yet.</div>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => {
                  const style = statusStyle(o.status);
                  return (
                    <div key={o._id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E5EBF2] bg-white p-4 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#102341]">{orderNo(o)}</span>
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: style.bg, color: style.color }}>
                            {style.label}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#52627a]">
                          Items: {(o.items || []).map((i) => `${i.name} (x${i.quantity})`).join(', ') || '—'}
                        </p>
                        <span className="mt-1 block text-[10px] text-[#68778c]">
                          Placed: {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-[#F2B71D]">NPR {Number(o.total || 0).toLocaleString('en-IN')}</span>
                        {String(o.status).toLowerCase() === 'completed' || String(o.status).toLowerCase() === 'delivered' ? (
                          <div className="mt-2 min-w-[220px] rounded-xl border border-[#E5EBF2] bg-[#F8FAFC] p-3 text-left">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#68778c]">Leave a review</span>
                              <select
                                value={reviewForm[o._id]?.rating ?? 5}
                                onChange={(e) => setReviewForm((prev) => ({ ...prev, [o._id]: { ...(prev[o._id] || {}), rating: Number(e.target.value) } }))}
                                className="rounded-lg border border-[#E5EBF2] bg-white px-2 py-1 text-[10px]"
                              >
                                {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value > 1 ? 's' : ''}</option>)}
                              </select>
                            </div>
                            <textarea
                              rows="2"
                              value={reviewForm[o._id]?.comment ?? ''}
                              onChange={(e) => setReviewForm((prev) => ({ ...prev, [o._id]: { ...(prev[o._id] || {}), comment: e.target.value } }))}
                              placeholder="Tell us about your purchase..."
                              className="w-full rounded-xl border border-[#E5EBF2] bg-white px-3 py-2 text-[10px] outline-none focus:border-[#F2B71D]"
                            />
                            <button onClick={() => handleOrderReview(o)} className="mt-2 w-full rounded-xl bg-[#F2B71D] px-3 py-2 text-[10px] font-bold text-[#102341]">
                              Submit Review
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeView === 'bookings' && (
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-[#102341]">{translate('Your Bookings', 'बुकिङ विवरण')}</h3>
            {bookings.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#52627a]">No service appointments scheduled.</div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <div key={b._id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E5EBF2] bg-white p-4 sm:flex-row sm:items-center">
                    <div>
                      <h4 className="text-sm font-bold text-[#102341]">Appointment Booking</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-[#52627a]"><FiCalendar /> {b.date}</span>
                        <span className="flex items-center gap-1 text-xs text-[#52627a]"><FiClock /> {b.timeSlot}</span>
                      </div>
                    </div>
                    {b.status === 'pending' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleRescheduleBooking(b._id)} className="rounded-lg border border-[#E5EBF2] px-3 py-1.5 text-[10px] font-bold">Reschedule</button>
                        <button onClick={() => handleCancelBooking(b._id)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-bold text-rose-600">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'reviews' && (
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-[#102341]">{translate('My Reviews', 'मेरा समीक्षा')}</h3>
            {customerReviews.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#52627a]">
                {translate('You have not submitted any reviews yet.', 'तपाईंले अहिलेसम्म कुनै समीक्षा पेश गर्नुभएको छैन।')}
              </div>
            ) : (
              <div className="space-y-3">
                {customerReviews.map((review) => (
                  <article key={review._id} className="rounded-2xl border border-[#e5ebf2] bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-bold text-[#102341]">{review.businessName || review.business?.name || 'Business review'}</h4>
                      <span className="text-[#F2B71D]">{'★'.repeat(Math.max(0, Math.min(5, Number(review.rating) || 0)))}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[#52627a]">{review.comment}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === 'wishlist' && (
          <div className="space-y-4">
            <h3 className="text-lg font-extrabold text-[#102341]">
              {currentTab === 'saved'
                ? translate('Saved Businesses', 'सुरक्षित व्यवसाय')
                : translate('Wishlist & Favorites', 'मनपर्ने सूची')}
            </h3>
            {favorites.products.length === 0 && favorites.businesses.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#52627a]">
                {translate('Your wishlist catalog is empty.', 'मनपर्ने सूची खाली छ।')}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {favorites.businesses.map((business) => (
                  <button type="button" key={business._id} onClick={() => onOpenBusiness?.(business._id)} className="flex gap-3 rounded-2xl border border-[#e5ebf2] bg-white p-3 text-left hover:border-[#f2c229]">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#fff5ce] text-lg">
                      {(business.imageUrl || business.logoUrl) ? <img src={business.imageUrl || business.logoUrl} alt={business.name} className="h-full w-full object-cover" /> : '🏪'}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#102341]">{business.name}</h4>
                      <p className="text-[10px] text-[#52627a]">{business.category || 'Local Business'}</p>
                    </div>
                  </button>
                ))}
                {(currentTab !== 'saved' ? favorites.products : []).map((p) => (
                  <div key={p._id} onClick={() => onOpenProduct(p._id)} className="flex cursor-pointer gap-3 rounded-2xl border border-[#e5ebf2] bg-white p-3 hover:border-[#f2c229]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-lg">🛍️</div>
                    <div>
                      <h4 className="max-w-[150px] truncate text-xs font-bold text-[#102341]">{p.name}</h4>
                      <span className="mt-1 block text-xs font-bold text-[#F2B71D]">NPR {p.price}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
