import React, { useState, useEffect } from 'react';
import { FiUser, FiSettings, FiShoppingBag, FiStar, FiCalendar, FiMapPin, FiAward, FiShare2, FiClock, FiCheckCircle } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';

export default function CustomerDashboard({ user, lang, currency, onOpenProduct }) {
  const [profileData, setProfileData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [favorites, setFavorites] = useState({ products: [], businesses: [] });
  const [activeMenu, setActiveMenu] = useState('orders'); // 'profile' | 'orders' | 'bookings' | 'wishlist'

  // Edit fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [twoFactor, setTwoFactor] = useState(false);

  // Live order tracking simulation removed
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setTwoFactor(user.twoFactorEnabled || false);
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

      // Seed mock favorite details
      api.get('/api/products').then((res) => {
        const wishProds = res.data.filter((p) => pRes.data.wishlist?.products?.includes(p._id));
        setFavorites((prev) => ({ ...prev, products: wishProds }));
      });
    } catch (e) {
      console.log(e);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const addrs = addressInput ? [{ _id: 'a_' + Date.now(), address: addressInput }] : user.addresses;
      
      await api.put(
        '/api/auth/profile',
        { name, phone, twoFactorEnabled: twoFactor, addresses: addrs },
        { headers: { ...createIdempotencyHeader('customer-profile') } }
      );
      
      Swal.fire({ icon: 'success', title: translate('Profile Updated', 'प्रोफाइल अद्यावधिक भयो') });
      fetchDashboardData();
    } catch (err) {
      Swal.fire({ icon: 'error', text: 'Profile update failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-left">
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Left Side: Sidebar */}
        <aside className="w-full md:w-64 space-y-2 flex-shrink-0">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 font-bold text-slate-950 text-xl shadow-lg">
              {user?.name?.charAt(0).toUpperCase() || 'C'}
            </div>
            <h4 className="mt-3 font-bold text-white text-sm">{user?.name}</h4>
            <span className="text-[10px] bg-cyan-500/10 border border-cyan-550/20 px-2.5 py-0.5 rounded-full font-bold text-cyan-300 uppercase tracking-wider mt-1.5 inline-block">
              {translate('Customer Account', 'ग्राहक खाता')}
            </span>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/10 p-2 space-y-1">
            {[
              { key: 'orders', label: translate('Order Status & History', 'अर्डर इतिहास'), icon: <FiShoppingBag /> },
              { key: 'bookings', label: translate('Service Bookings', 'सेवा बुकिङहरू'), icon: <FiCalendar /> },
              { key: 'wishlist', label: translate('Wishlist Favorites', 'मनपर्ने सूची'), icon: <FiStar /> },
              { key: 'profile', label: translate('Settings & Profile', 'प्रोफाइल सेटिङ'), icon: <FiSettings /> },
            ].map((menu) => (
              <button
                key={menu.key}
                onClick={() => setActiveMenu(menu.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeMenu === menu.key
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                    : 'text-slate-450 hover:bg-slate-900/60 hover:text-white'
                }`}
              >
                {menu.icon}
                <span>{menu.label}</span>
              </button>
            ))}
          </div>

          {/* Loyalty Section */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400">
              <FiAward className="h-5 w-5" />
              <span className="text-[10px] font-bold uppercase tracking-wider">{translate('Loyalty Rewards', 'लोयल्टी पुरस्कार')}</span>
            </div>
            <div>
              <span className="text-2xl font-black text-white">{profileData?.loyaltyPoints || 0}</span>
              <span className="text-[10px] text-slate-500 ml-1">pts</span>
            </div>
            <p className="text-[10px] text-slate-450">{translate('Earn 10 points on every purchase. Redeemable on checkout.', 'प्रत्येक खरिदमा १० पोइन्ट पाउनुहोस्।')}</p>
            <button
              onClick={() => {
                const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
                navigator.clipboard.writeText(`${origin}/?ref=${user?._id}`);
                Swal.fire({ icon: 'success', text: translate('Referral link copied to clipboard!', 'रेफरल लिङ्क कपी भयो!') });
              }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-900"
            >
              <FiShare2 />
              <span>Share Invite</span>
            </button>
          </div>
        </aside>

        {/* Right Side: Tab Details Pane */}
        <main className="flex-1 space-y-6">
          {/* A. Profile & Security Settings */}
          {activeMenu === 'profile' && (
            <div className="rounded-[32px] border border-slate-800 bg-slate-900/30 p-5 sm:p-6 space-y-6">
              <div>
                <h3 className="text-lg font-extrabold text-white">{translate('Profile Settings', 'प्रोफाइल सेटिङ')}</h3>
                <p className="text-xs text-slate-400 mt-1">{translate('Edit details, addresses, and enable safety factors.', 'आफ्नो व्यक्तिगत विवरण र ठेगाना सम्पादन गर्नुहोस्')}</p>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Full Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-cyan-400"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-450">Saved Home Address</label>
                  <input
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder={user?.addresses?.[0]?.address || 'No saved address.'}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>

                {/* 2FA Toggle */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-4 flex items-center justify-between">
                  <div className="text-left">
                    <h5 className="text-xs font-bold text-white">{translate('Secure 2-Factor Authentication', '२-चरण प्रमाणीकरण सुरक्षा')}</h5>
                    <p className="text-[10px] text-slate-450 mt-0.5">{translate('Prompts verification code (123456) during security logins.', 'लगइन गर्दा थप सुरक्षा कोड सोध्नेछ।')}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={twoFactor}
                    onChange={(e) => setTwoFactor(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-800 bg-slate-900 text-cyan-500 accent-cyan-400 focus:ring-0 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-gradient-to-r from-cyan-400 to-cyan-550 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60"
                >
                  {isSubmitting ? 'Processing...' : 'Save changes'}
                </button>
              </form>
            </div>
          )}

          {/* B. Order History & Live tracking stepper */}
          {activeMenu === 'orders' && (
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
                          रु {o.total}
                        </span>
                        {/* Live tracking action hidden */}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* C. Service Bookings Appointment calendar */}
          {activeMenu === 'bookings' && (
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
          {activeMenu === 'wishlist' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Your Favorites', 'मनपर्ने वस्तुहरू')}</h3>

              {favorites.products.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  {translate('Your wishlist catalog is empty.', 'मनपर्ने सूची खाली छ।')}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
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
                          रु {p.price}
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
    </div>
  );
}
