import React, { useState, useEffect } from 'react';
import { FiUsers, FiCheckCircle, FiShield, FiTrendingUp, FiDownload, FiPlus, FiTag, FiAlertTriangle, FiFlag, FiShoppingBag, FiTruck, FiPackage, FiFileText } from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';

export default function AdminDashboard({ user, lang, liveOrderTick }) {
  const [analytics, setAnalytics] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('approvals');

  // Coupon Form State
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState('');
  const [couponMax, setCouponMax] = useState('');
  const [couponExpiry, setCouponExpiry] = useState('');

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      fetchAdminData();
    }
  }, [user]);

  /* ⚡ Real-time: silently refresh when a new order arrives via Socket.IO */
  useEffect(() => {
    if (liveOrderTick > 0 && user) {
      const token = localStorage.getItem('token');
      // Refresh analytics and orders list
      axios.get('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => setAnalytics(res.data)).catch(() => {});
      axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => setOrders(Array.isArray(res.data) ? res.data : [])).catch(() => {});
    }
  }, [liveOrderTick, user]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const statsRes = await axios.get('/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } });
      setAnalytics(statsRes.data);

      const bizRes = await axios.get('/api/businesses');
      setBusinesses(bizRes.data);

      const ordRes = await axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
      setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);

      const coupRes = await axios.get('/api/admin/coupons', { headers: { Authorization: `Bearer ${token}` } });
      setCoupons(coupRes.data);

      const allBizReviews = [];
      for (let b of bizRes.data) {
        try {
          const details = await axios.get(`/api/businesses/${b._id}`);
          allBizReviews.push(...(details.data.reviews || []));
        } catch (_) {}
      }
      setReviews(allBizReviews);

      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  // Refresh orders list
  const fetchOrders = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
    setOrders(Array.isArray(res.data) ? res.data : []);
  };

  // Mark order as dispatched
  const handleDispatchOrder = async (orderId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/delivery/${orderId}/assign`, {}, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire({ icon: 'success', title: 'Order Dispatched!', text: 'Customer has been notified.', timer: 1800, showConfirmButton: false });
      fetchOrders();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.message || 'Dispatch failed.' });
    }
  };

  // Complete delivery with OTP
  const handleCompleteDelivery = async (orderId, deliveryOtp) => {
    const { value: enteredOtp } = await Swal.fire({
      title: 'Enter Delivery OTP',
      html: `<p style="font-size:12px;color:#94a3b8;margin-bottom:8px">Ask the customer for their 4-digit delivery OTP code</p>
             <input id="otp-input" class="swal2-input" placeholder="e.g. 1234" maxlength="4" style="font-family:monospace;font-size:20px;text-align:center;letter-spacing:6px" />`,
      focusConfirm: false,
      confirmButtonColor: '#f59e0b',
      preConfirm: () => document.getElementById('otp-input').value,
    });
    if (!enteredOtp) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/delivery/${orderId}/complete`, { otp: enteredOtp }, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire({ icon: 'success', title: 'Delivery Completed! ✅', text: 'Order marked as delivered and paid.', confirmButtonColor: '#f59e0b' });
      fetchOrders();
    } catch (e) {
      Swal.fire({ icon: 'error', text: e.response?.data?.message || 'OTP verification failed.' });
    }
  };

  const handleVerifyBusiness = async (bizId, nextStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `/api/businesses/${bizId}/verify`,
        { status: nextStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire({
        icon: 'success',
        title: translate('Status Updated', 'अवस्था परिवर्तन भयो'),
        text: `Business updated to ${nextStatus}.`,
      });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Action failed.' });
    }
  };

  const handleDeleteBusiness = async (bizId) => {
    const confirmResult = await Swal.fire({
      title: translate('Are you sure?', 'के तपाईं पक्का हुनुहुन्छ?'),
      text: translate(
        'This will permanently delete this business account and all its associated products, services, and reviews!',
        'यसले यो व्यवसाय खाता र यससँग सम्बन्धित सबै उत्पादनहरू, सेवाहरू र समीक्षाहरू स्थायी रूपमा हटाउनेछ!'
      ),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: translate('Yes, delete it!', 'हो, मेटाउनुहोस्!'),
      cancelButtonText: translate('Cancel', 'रद्द गर्नुहोस्'),
    });

    if (confirmResult.isConfirmed) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`/api/businesses/${bizId}`, { headers: { Authorization: `Bearer ${token}` } });
        Swal.fire({
          icon: 'success',
          title: translate('Deleted!', 'मेटाइयो!'),
          text: translate('Business account has been deleted.', 'व्यवसाय खाता मेटाइएको छ।'),
        });
        fetchAdminData();
      } catch (e) {
        const errorMsg = e.response?.data?.error || e.response?.data?.message || e.message || 'Action failed.';
        Swal.fire({
          icon: 'error',
          title: translate('Failed to delete business account.', 'व्यवसाय खाता मेटाउन असफल भयो।'),
          text: errorMsg
        });
      }
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode || !couponDiscount || !couponMax || !couponExpiry) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/admin/coupons',
        {
          code: couponCode,
          discountPercent: couponDiscount,
          maxDiscount: couponMax,
          expiryDate: couponExpiry,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire({ icon: 'success', title: translate('Coupon Created', 'कुपन सिर्जना भयो') });
      setCouponCode('');
      setCouponDiscount('');
      setCouponMax('');
      setCouponExpiry('');
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Coupon creation failed.' });
    }
  };

  const handleDownloadReport = (reportType) => {
    const token = localStorage.getItem('token');
    // Direct link to download report CSV
    const url = `/api/admin/reports?type=${reportType}`;
    
    axios.get(url, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
      .then((res) => {
        const downloadUrl = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `udyogconnect_${reportType}_report.csv`);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        Swal.fire({ icon: 'success', text: translate('Report download initiated.', 'रिपोर्ट डाउनलोड सुरु भयो।') });
      })
      .catch((e) => {
        Swal.fire({ icon: 'error', text: 'Failed to export reports.' });
      });
  };

  const handleDismissReportedReview = async (reviewId) => {
    // Simulated action to clear reported review flag
    Swal.fire({ icon: 'success', text: translate('Review flag dismissed.', 'समीक्षा खण्डन खारेज गरियो।') });
  };

  if (loading || !analytics) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto"></div>
        <p className="mt-3 text-sm">{translate('Accessing admin portal...', 'ड्यासबोर्ड खोल्दैछ...')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-left">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">{translate('Platform Management', 'प्रशासक ड्यासबोर्ड')}</h2>
          <p className="text-xs text-slate-400 mt-1">{translate('System compliance monitoring, coupon creation, and sales reports exports.', 'समग्र प्रणाली, कुपन र रिपोर्टहरूको रेखदेख गर्नुहोस्')}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total Registered Users', value: analytics.metrics.totalUsers, icon: <FiUsers className="text-cyan-400" /> },
          { title: 'System Revenue Volume', value: `NPR ${analytics.metrics.revenue}`, icon: <FiTrendingUp className="text-emerald-400" /> },
          { title: 'VAT Tax Collected (13%)', value: `NPR ${analytics.metrics.tax}`, icon: <FiCheckCircle className="text-amber-400" /> },
          { title: 'Disputes (Reported Content)', value: analytics.metrics.reportedReviews, icon: <FiFlag className="text-rose-400 animate-pulse" /> },
        ].map((metric) => (
          <div key={metric.title} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5">
            <div className="text-2xl">{metric.icon}</div>
            <div className="mt-3 text-2xl font-black text-white">{metric.value}</div>
            <div className="text-xs text-slate-400 mt-1">{metric.title}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-6 lg:flex-row">
        {/* Nav list controls */}
        <aside className="w-full lg:w-64 space-y-1.5 flex-shrink-0">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/10 p-2 space-y-1">
            {[
                      { key: 'approvals', label: translate('Business Approvals', 'पसल स्वीकृत सूची'), icon: <FiCheckCircle /> },
              { key: 'orders', label: translate('Orders Management', 'अर्डर व्यवस्थापन'), icon: <FiShoppingBag /> },
              { key: 'coupons', label: translate('Coupons Management', 'कुपन कोड व्यवस्थापन'), icon: <FiTag /> },
              { key: 'reviews', label: translate('Safety Moderation', 'सामग्री मध्यस्थता'), icon: <FiShield /> },
              { key: 'reports', label: translate('Financial Reports', 'वित्तीय रिपोर्टहरू'), icon: <FiDownload /> },
            ].map((menu) => (
              <button
                key={menu.key}
                onClick={() => setActiveTab(menu.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                  activeTab === menu.key
                    ? 'bg-amber-400/10 text-amber-300 border border-amber-400/20'
                    : 'text-slate-450 hover:bg-slate-900/60 hover:text-white'
                }`}
              >
                {menu.icon}
                <span>{menu.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Tab content area */}
        <main className="flex-1 space-y-6">
          {/* Orders Management Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-white">{translate('All Orders', 'सबै अर्डरहरू')} <span className="text-sm text-slate-400 font-normal">({orders.length})</span></h3>
                <button onClick={fetchOrders} className="text-xs text-amber-400 hover:underline">Refresh</button>
              </div>
              {orders.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">No orders found.</div>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => {
                    const statusColor = {
                      placed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
                      preparing: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      dispatched: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
                      completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                      cancelled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                    }[o.status] || 'bg-slate-500/15 text-slate-300';
                    return (
                      <div key={o._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-xs font-mono font-bold text-white">#{String(o._id).slice(-8).toUpperCase()}</p>
                            <p className="text-[11px] text-slate-400">{o.deliveryAddress?.name} · {o.deliveryAddress?.phone}</p>
                            <p className="text-[10px] text-slate-500">{o.deliveryAddress?.address}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${statusColor}`}>{o.status}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${o.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{o.paymentStatus}</span>
                          </div>
                        </div>

                        <div className="text-xs text-slate-300 bg-slate-950/40 rounded-xl px-3 py-2">
                          {o.items?.map(i => `${i.name} ×${i.quantity}`).join(' | ')}
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-800 flex-wrap gap-2">
                          <div className="text-xs">
                            <span className="font-bold text-amber-300">NPR {o.total}</span>
                            <span className="text-slate-500 ml-2 font-mono text-[10px]">OTP: {o.deliveryOtp}</span>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {o.status === 'preparing' && (
                              <button
                                onClick={() => handleDispatchOrder(o._id)}
                                className="rounded-lg bg-purple-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-purple-400 transition"
                              >
                                <FiTruck className="inline mr-1" />Dispatch
                              </button>
                            )}
                            {o.status === 'dispatched' && (
                              <button
                                onClick={() => handleCompleteDelivery(o._id, o.deliveryOtp)}
                                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-400 transition"
                              >
                                <FiCheckCircle className="inline mr-1" />Verify OTP & Complete
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Tracking timeline */}
                        {o.trackingHistory && o.trackingHistory.length > 0 && (
                          <div className="border-t border-slate-800 pt-2 space-y-1">
                            {o.trackingHistory.slice().reverse().slice(0, 3).map((t, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="font-semibold text-slate-400">{t.status}</span>
                                <span>— {t.note}</span>
                                <span className="ml-auto">{new Date(t.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* A. Approvals panel */}
          {activeTab === 'approvals' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Pending Business Approvals', 'दर्ताका लागि आएका आवेदनहरू')}</h3>
              
              <div className="space-y-3">
                {businesses.map((biz) => (
                  <div key={biz._id} className="rounded-3xl border border-slate-850 bg-slate-905 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{biz.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          biz.verified === 'verified' ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-300'
                        }`}>
                          {biz.verified}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{biz.category} • {biz.location} • {biz.hours}</p>
                      {biz.documents && biz.documents[0] && (
                        <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
                          <FiFileText />
                          <a href={biz.documents[0]} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">View Business Document Proof</a>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 sm:mt-0 flex gap-2">
                      {biz.verified !== 'verified' && (
                        <button
                          onClick={() => handleVerifyBusiness(biz._id, 'verified')}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950"
                        >
                          Approve Shop
                        </button>
                      )}
                      {biz.verified !== 'suspended' && (
                        <button
                          onClick={() => handleVerifyBusiness(biz._id, 'suspended')}
                          className="rounded-lg bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-slate-950"
                        >
                          Suspend Shop
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteBusiness(biz._id)}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-rose-500 transition"
                      >
                        {translate('Delete Business', 'व्यवसाय हटाउनुहोस्')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* B. Coupon campaigns editor */}
          {activeTab === 'coupons' && (
            <div className="space-y-6">
              {/* Creator Form */}
              <form onSubmit={handleCreateCoupon} className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">{translate('Generate Promo Discount Code', 'नयाँ छुट कुपन कोड सिर्जना')}</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Coupon Code Name (e.g. FESTIVAL20)"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="Discount Percentage (e.g. 15)"
                    value={couponDiscount}
                    onChange={(e) => setCouponDiscount(e.target.value)}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Max Discount Cap Value (NPR)"
                    value={couponMax}
                    onChange={(e) => setCouponMax(e.target.value)}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
                    required
                  />
                  <input
                    type="date"
                    value={couponExpiry}
                    onChange={(e) => setCouponExpiry(e.target.value)}
                    className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300 outline-none"
                    required
                  />
                </div>
                <button type="submit" className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-xs font-bold text-slate-950">
                  <FiPlus className="inline mr-1" /> Create Coupon
                </button>
              </form>

              {/* Coupons List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-450 uppercase tracking-wider">Active Promo Codes ({coupons.length})</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {coupons.map((c) => (
                    <div key={c._id} className="rounded-2xl border border-slate-850 bg-slate-950/20 p-4">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-black text-amber-300 tracking-wider">{c.code}</span>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Active</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400 space-y-0.5">
                        <p>Discount: {c.discountPercent}% off</p>
                        <p>Max discount value: NPR {c.maxDiscount}</p>
                        <p>Expiry Limit: {c.expiryDate}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* C. Moderation & fake reviews resolver */}
          {activeTab === 'reviews' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Safety Moderation Desk', 'मध्यस्थता केन्द्र')}</h3>

              {reviews.filter(r => r.reported).length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  No flagged review content reported by customers.
                </div>
              ) : (
                <div className="space-y-3">
                  {reviews.filter(r => r.reported).map((r) => (
                    <div key={r._id} className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <FiAlertTriangle className="text-rose-450" />
                          <div>
                            <h5 className="text-xs font-bold text-white">Flagged Review by {r.customerName}</h5>
                            <span className="text-[9px] text-slate-500">Rating given: {r.rating} stars</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDismissReportedReview(r._id)}
                            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[9px] text-slate-350"
                          >
                            Dismiss Flag
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-300 italic">"{r.comment}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* D. Financial reports downloads */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Platform Reports Exporter', 'वित्तीय रिपोर्ट निकासी')}</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { key: 'sales', title: 'Sales Performance Report', desc: 'CSV containing all orders subtotal, coupon usage, and totals.' },
                  { key: 'tax', title: 'Tax & VAT Collection Ledger', desc: 'Tax invoice registry calculating 13% tax collection details.' },
                  { key: 'users', title: 'Registered Users Registry', desc: 'List of all customers, sellers, and riders with details.' },
                ].map((rep) => (
                  <div key={rep.key} className="rounded-[24px] border border-slate-805 bg-slate-905 p-5 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm">{rep.title}</h4>
                      <p className="text-[10px] text-slate-450 mt-1 leading-relaxed">{rep.desc}</p>
                    </div>
                    <button
                      onClick={() => handleDownloadReport(rep.key)}
                      className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300"
                    >
                      <FiDownload />
                      <span>Export CSV</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
