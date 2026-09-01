import React, { useState, useEffect } from 'react';
import { FiShoppingBag, FiStar, FiCalendar, FiClock, FiSearch, FiHeart, FiChevronRight, FiMapPin, FiHome, FiCreditCard, FiBell, FiPackage } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import AccountProfileCard from './AccountProfileCard';

export default function CustomerDashboard({ user, lang, businesses = [], products = [], onOpenProduct, onAddToCart, onOpenDashboard, onOpenBusiness, activeTab, onTabChange }) {
  const [profileData, setProfileData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState({ products: [], businesses: [] });
  const [internalTab, setInternalTab] = useState('dashboard');
  const currentTab = activeTab ?? internalTab;
  const changeTab = (tab) => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
  };

  const resolveTab = (tab) => {
    if (!tab) return 'dashboard';
    if (tab === 'dashboard') return 'dashboard';
    if (tab === 'settings' || tab === 'addresses') return 'profile';
    if (tab === 'saved' || tab === 'reviews') return 'wishlist';
    if (tab === 'wallet' || tab === 'cart') return 'orders';
    return tab;
  };
  const activeView = resolveTab(currentTab);
  const recentOrders = orders.slice(0, 4);
  const recommendedBusinesses = businesses.slice(0, 3);
  const popularProducts = products.slice(0, 4);
  const businessImage = (business) => business?.imageUrl || business?.logoUrl || business?.logo || business?.image || '';
  const cartTotal = orders.reduce((total, order) => total + Number(order.total || 0), 0);

  const [reviewForm, setReviewForm] = useState({});

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  // Live route simulator removed

  const fetchDashboardData = async () => {
    try {
      // Fetch orders
      const oRes = await api.get('/api/orders');
      setOrders(oRes.data);

      // Fetch bookings
      const bRes = await api.get('/api/bookings');
      setBookings(bRes.data);

      // Fetch profile for wishlist details
      const pRes = await api.get('/api/auth/profile');
      setProfileData(pRes.data);

      const wishlist = pRes.data.wishlist || {};
      const hasWishlistId = (items, id) => Array.isArray(items)
        && items.some((item) => String(item?._id || item?.id || item) === String(id));
      const [productsRes, businessesRes] = await Promise.all([
        api.get('/api/products'),
        api.get('/api/businesses'),
      ]);
      setFavorites({
        products: (Array.isArray(productsRes.data) ? productsRes.data : [])
          .filter((product) => hasWishlistId(wishlist.products, product._id)),
        businesses: (Array.isArray(businessesRes.data) ? businessesRes.data : [])
          .filter((business) => hasWishlistId(wishlist.businesses, business._id)),
      });
    } catch (e) {
      console.log(e);
    }
  };

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
      preConfirm: () => {
        return [
          document.getElementById('swal-input1').value,
          document.getElementById('swal-input2').value
        ];
      }
    });

    if (formValues && formValues[0]) {
      try {
        await api.put(
          `/api/bookings/${bookingId}`,
          { date: formValues[0], timeSlot: formValues[1], status: 'pending' }
        );
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
      await api.post('/api/reviews', {
        businessId,
        targetId: businessId,
        targetType: 'business',
        rating,
        comment,
      });

      setReviewForm((prev) => ({ ...prev, [order._id]: { rating: 5, comment: '' } }));
      Swal.fire({ icon: 'success', title: 'Review Submitted', text: 'Thank you for sharing your feedback.' });
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Unable to submit review.' });
    }
  };

  return (
    <div className="mx-auto max-w-full px-3 sm:px-5 xl:px-8">
      {/* Customer Dashboard Content */}
      <main className="bg-[#f7f1e8] px-4 pb-4 text-[#142835] sm:px-6 sm:pb-6">
          {/* A. Profile & Security Settings */}
          {activeView === 'profile' && <AccountProfileCard user={user} lang={lang} />}

          {activeView === 'dashboard' && (
            <div className="customer-overview">
              <section className="customer-welcome">
                <div>
                  <p className="customer-eyebrow">{translate('Local marketplace', 'स्थानीय बजार')}</p>
                  <h1>{translate('Discover & Buy Local', 'स्थानीय उत्पादन तथा सेवा खोज्नुहोस्')}</h1>
                  <p>{translate('Find the best products and services from trusted local businesses near you.', 'तपाईं नजिकका विश्वसनीय स्थानीय व्यवसायबाट उत्कृष्ट उत्पादन र सेवा पाउनुहोस्।')}</p>
                  <span><FiMapPin /> {user?.location || 'Kathmandu, Nepal'}</span>
                </div>
                <div className="customer-welcome-art"><FiHome /><FiShoppingBag /><FiStar /></div>
              </section>

              <div className="customer-searchbar"><FiSearch /><input placeholder={translate('What are you looking for?', 'तपाईं के खोज्दै हुनुहुन्छ?')} /><button type="button" onClick={() => onOpenDashboard?.('home')}>{translate('Search', 'खोज्नुहोस्')}</button></div>

              <div className="customer-section-heading"><h2>{translate('Shop by Category', 'श्रेणीअनुसार किनमेल')}</h2><button type="button" onClick={() => onOpenDashboard?.('home')}>View All <FiChevronRight /></button></div>
              <div className="customer-categories">{['Grocery', 'Food & Restaurant', 'Electronics', 'Fashion', 'Beauty & Health', 'Home & Kitchen', 'Services', 'More'].map((category, index) => <button type="button" key={category} onClick={() => onOpenDashboard?.('home')}><span>{['🛒', '🍴', '▣', '👕', '✿', '⌂', '🔧', '⊞'][index]}</span><b>{category}</b></button>)}</div>

              <div className="customer-dashboard-grid">
                <section className="customer-panel customer-recommendations"><div className="customer-section-heading"><h2>{translate('Recommended Businesses', 'सिफारिस गरिएका व्यवसाय')}</h2><button type="button" onClick={() => onOpenDashboard?.('home')}>View All <FiChevronRight /></button></div><div className="customer-business-grid">{recommendedBusinesses.map((business) => <button type="button" key={business._id} onClick={() => onOpenBusiness?.(business._id)}><div className="customer-business-image">{businessImage(business) ? <img src={businessImage(business)} alt={business.name} /> : <FiHome />}</div><strong>{business.name}</strong><small><FiStar /> {business.rating || '4.8'} · {business.category}</small><span><FiMapPin /> {business.location || 'Kathmandu'}</span><em>View Business</em></button>)}{recommendedBusinesses.length === 0 && <div className="customer-empty">No businesses available yet.</div>}</div></section>
                <section className="customer-panel customer-side-panel"><div className="customer-section-heading"><h2>Your Orders</h2><button type="button" onClick={() => onTabChange?.('orders')}>View All <FiChevronRight /></button></div>{recentOrders.map((order) => <button type="button" className="customer-order-row" key={order._id} onClick={() => onTabChange?.('orders')}><FiPackage /><span><strong>#{String(order._id).slice(-6)}</strong><small>{order.items?.[0]?.name || `${order.items?.length || 0} item(s)`}</small></span><b className={String(order.status).toLowerCase()}>{order.status || 'Pending'}</b><FiChevronRight /></button>)}{recentOrders.length === 0 && <div className="customer-empty">No orders yet.</div>}</section>
                <section className="customer-panel customer-side-panel"><div className="customer-section-heading"><h2>Wallet</h2><button type="button" onClick={() => onTabChange?.('wallet')}>View All <FiChevronRight /></button></div><div className="customer-wallet"><small>Available Balance</small><strong>Rs. {Number(user?.walletBalance || user?.wallet?.balance || 0).toLocaleString('en-IN')}</strong><button type="button" onClick={() => onTabChange?.('wallet')}><FiCreditCard /> Manage Wallet</button></div></section>
              </div>

              <div className="customer-dashboard-grid customer-lower-grid"><section className="customer-panel customer-products"><div className="customer-section-heading"><h2>Popular Products</h2><button type="button" onClick={() => onOpenDashboard?.('home')}>View All <FiChevronRight /></button></div><div className="customer-product-grid">{popularProducts.map((product) => <div className="customer-product-card" key={product._id}><button type="button" className="customer-product-open" onClick={() => onOpenProduct?.(product._id)}><div>{product.images?.[0] ? <img src={product.images[0]} alt={product.name} /> : '🛍️'}</div><strong>{product.name}</strong><small>{product.brand || 'Local Brand'}</small><b>Rs. {Number(product.price || 0).toLocaleString('en-IN')}</b></button><button type="button" className="customer-product-add" onClick={() => onAddToCart?.({ id: product._id, name: product.name, price: Number(product.price || 0), stock: product.stock, businessId: product.businessId })}><FiShoppingBag /> Add to Cart</button></div>)}{popularProducts.length === 0 && <div className="customer-empty">No products available yet.</div>}</div></section><section className="customer-panel customer-offers"><div className="customer-section-heading"><h2>Special Offers</h2><button type="button" onClick={() => onOpenDashboard?.('home')}>View All <FiChevronRight /></button></div><div className="customer-offer-card"><span>20% OFF</span><h3>Fresh local favourites</h3><p>Discover great deals from businesses near you.</p><button type="button" onClick={() => onOpenDashboard?.('home')}>Shop Now</button></div><div className="customer-ai"><FiBell /><div><strong>AI Recommendations</strong><p>Personalized local picks based on your activity.</p></div></div></section></div>
            </div>
          )}

          {/* B. Order History & Live tracking stepper */}
          {activeView === 'orders' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Order Status', 'अर्डर स्थिति')}</h3>

              {/* Live tracking temporarily hidden */}

              {/* General Orders list */}
              {orders.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  You have not placed any orders yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div key={o._id} className="rounded-3xl border border-slate-850 bg-slate-900/35 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-mono">{o._id}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            o.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            o.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                            'bg-cyan-500/10 text-cyan-400'
                          }`}>
                            {o.status}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-semibold tracking-wider ${
                            o.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
                          }`}>
                            {o.paymentStatus}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Items: {o.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                        </p>
                        <span className="mt-1 block text-[10px] text-slate-500">
                          Placed: {new Date(o.createdAt).toLocaleDateString()} at {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-4 sm:mt-0 text-right flex flex-col items-end gap-2">
                        <span className="text-sm font-black text-amber-300">
                          Rs. {o.total}
                        </span>
                        {o.status === 'completed' && (
                          <div className="w-full min-w-[220px] rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-left">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leave a review</span>
                              <select
                                value={reviewForm[o._id]?.rating ?? 5}
                                onChange={(e) => setReviewForm((prev) => ({ ...prev, [o._id]: { ...(prev[o._id] || {}), rating: Number(e.target.value) } }))}
                                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-white"
                              >
                                {[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} star{value > 1 ? 's' : ''}</option>)}
                              </select>
                            </div>
                            <textarea
                              rows="2"
                              value={reviewForm[o._id]?.comment ?? ''}
                              onChange={(e) => setReviewForm((prev) => ({ ...prev, [o._id]: { ...(prev[o._id] || {}), comment: e.target.value } }))}
                              placeholder="Tell us about your purchase..."
                              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-[10px] text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                            />
                            <button
                              onClick={() => handleOrderReview(o)}
                              className="mt-2 w-full rounded-xl bg-cyan-500 px-3 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-400"
                            >
                              Submit Review
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* C. Service Bookings Appointment calendar */}
          {activeView === 'bookings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Your Bookings', 'बुकिङ विवरण')}</h3>

              {bookings.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  No service appointments scheduled.
                </div>
              ) : (
                <div className="space-y-3">
                  {bookings.map((b) => (
                    <div key={b._id} className="rounded-3xl border border-slate-850 bg-slate-900/35 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                      <div>
                        <h4 className="font-bold text-slate-200 text-sm">Appointment Booking</h4>
                        <div className="flex gap-2 items-center mt-1">
                          <span className="text-xs text-slate-400 flex items-center gap-1"><FiCalendar /> {b.date}</span>
                          <span className="text-xs text-slate-400 flex items-center gap-1"><FiClock /> {b.timeSlot}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Assignee: {b.staffMember || 'Any Staff'} {b.homeService && '(Home service selected)'}</p>
                        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          b.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                          b.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {b.status}
                        </span>
                      </div>
                      {b.status === 'pending' && (
                        <div className="mt-4 sm:mt-0 flex gap-2">
                          <button
                            onClick={() => handleRescheduleBooking(b._id)}
                            className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-900"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => handleCancelBooking(b._id)}
                            className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/25"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* D. Wishlist Favorites list */}
          {activeView === 'wishlist' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Your Favorites', 'मनपर्ने वस्तुहरू')}</h3>

              {favorites.products.length === 0 && favorites.businesses.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  {translate('Your wishlist catalog is empty.', 'मनपर्ने सूची खाली छ।')}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {favorites.businesses.map((business) => (
                    <div key={business._id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 flex gap-3 hover:border-slate-700 cursor-pointer">
                      <div className="h-12 w-12 rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center text-lg">
                        {business.imageUrl ? <img src={business.imageUrl} alt={business.name} className="h-full w-full object-cover" /> : '🏪'}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-200 text-xs">{business.name}</h4>
                        <p className="text-[10px] text-slate-500">{business.category}</p>
                      </div>
                    </div>
                  ))}
                  {favorites.products.map((p) => (
                    <div
                      key={p._id}
                      onClick={() => onOpenProduct(p._id)}
                      className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 flex gap-3 hover:border-slate-700 cursor-pointer"
                    >
                      <div className="h-12 w-12 rounded-xl bg-slate-950 overflow-hidden flex items-center justify-center text-lg">
                        🛍️
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-200 text-xs truncate max-w-[150px]">{p.name}</h4>
                        <p className="text-[10px] text-slate-500">{p.brand}</p>
                        <span className="text-xs font-bold text-amber-300 mt-1 block">
                          Rs. {p.price}
                        </span>
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
