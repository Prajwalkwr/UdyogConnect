import React, { useState, useEffect } from 'react';
import { FiUsers, FiCheckCircle, FiShield, FiTrendingUp, FiDownload, FiPlus, FiTag, FiAlertTriangle, FiFlag, FiShoppingCart, FiSettings, FiGrid, FiTrash2, FiEdit3, FiFileText, FiHome, FiBriefcase, FiPackage, FiBell, FiLifeBuoy, FiLogOut, FiUser } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { buildAdminSettingsPayload, normalizeAdminSettings } from '../utils/admin';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';

export default function AdminDashboard({ user, lang }) {
  const [analytics, setAnalytics] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(normalizeAdminSettings({ taxRate: 13, deliveryFee: 70, commissionRate: 5, paymentMethods: ['COD', 'Card', 'Wallet'] }));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [announcementText, setAnnouncementText] = useState('');

  // Coupon Form State
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState('');
  const [couponMax, setCouponMax] = useState('');
  const [couponExpiry, setCouponExpiry] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [settingsForm, setSettingsForm] = useState(normalizeAdminSettings({ taxRate: 13, deliveryFee: 70, commissionRate: 5, paymentMethods: ['COD', 'Card', 'Wallet'] }));
  const [submittingAction, setSubmittingAction] = useState(false);
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      fetchAdminData();
    }
  }, [user]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // Fetch platform stats
      const statsRes = await api.get('/api/admin/analytics');
      setAnalytics(statsRes.data);

      const bizRes = await api.get('/api/businesses');
      setBusinesses(bizRes.data);

      const usersRes = await api.get('/api/admin/users');
      setUsers(usersRes.data);

      const categoriesRes = await api.get('/api/categories');
      setCategories(categoriesRes.data);

      const ordersRes = await api.get('/api/orders');
      setOrders(ordersRes.data);

      const coupRes = await api.get('/api/admin/coupons');
      setCoupons(coupRes.data);

      const settingsRes = await api.get('/api/admin/settings');
      const normalizedSettings = normalizeAdminSettings(settingsRes.data);
      setSettings(normalizedSettings);
      setSettingsForm(normalizedSettings);

      const allBizReviews = [];
      for (let b of bizRes.data) {
        const details = await api.get(`/api/businesses/${b._id}`);
        allBizReviews.push(...details.data.reviews);
      }
      setReviews(allBizReviews);

      setLoading(false);
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  const handleVerifyBusiness = async (bizId, nextStatus) => {
    try {
      await api.put(`/api/businesses/${bizId}/verify`, { status: nextStatus });
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
        await api.delete(`/api/businesses/${bizId}`);
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
      await api.post(
        '/api/admin/coupons',
        {
          code: couponCode,
          discountPercent: couponDiscount,
          maxDiscount: couponMax,
          expiryDate: couponExpiry,
        }
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
    // Direct link to download report CSV
    const url = `/api/admin/reports?type=${reportType}`;
    
    api.get(url, { responseType: 'blob' })
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
    try {
      await api.put(`/api/admin/reviews/${reviewId}`, { reported: false });
      setReviews((prev) => prev.map((review) => (review._id === reviewId ? { ...review, reported: false } : review)));
      Swal.fire({ icon: 'success', text: translate('Review flag dismissed.', 'समीक्षा खण्डन खारेज गरियो।') });
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to dismiss review flag.' });
    }
  };

  const handleToggleUserStatus = async (userId, suspended) => {
    try {
      await api.put(`/api/admin/users/${userId}/status`, { suspended });
      Swal.fire({ icon: 'success', text: translate('User status updated.', 'प्रयोगकर्ता स्थिति अद्यावधिक भयो।') });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to update user status.' });
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/api/admin/users/${userId}`);
      Swal.fire({ icon: 'success', text: translate('User removed.', 'प्रयोगकर्ता हटाइयो।') });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to remove user.' });
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setSubmittingAction(true);
    try {
      if (editingCategoryId) {
        await api.put(`/api/categories/${editingCategoryId}`, { name: categoryName, description: categoryDescription }, { headers: { ...createIdempotencyHeader('admin-category') } });
      } else {
        await api.post('/api/categories', { name: categoryName, description: categoryDescription }, { headers: { ...createIdempotencyHeader('admin-category') } });
      }
      setCategoryName('');
      setCategoryDescription('');
      setEditingCategoryId(null);
      Swal.fire({ icon: 'success', text: translate('Category saved.', 'श्रेणी बचत भयो।') });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to save category.' });
    } finally {
      setSubmittingAction(false);
      submitGuard.finish();
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategoryId(category._id);
    setCategoryName(category.name);
    setCategoryDescription(category.description || '');
  };

  const handleDeleteCategory = async (categoryId) => {
    try {
      await api.delete(`/api/categories/${categoryId}`);
      Swal.fire({ icon: 'success', text: translate('Category deleted.', 'श्रेणी हटाइयो।') });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to delete category.' });
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setSubmittingAction(true);
    try {
      const payload = buildAdminSettingsPayload(settingsForm);
      await api.put('/api/admin/settings', payload, { headers: { ...createIdempotencyHeader('admin-settings') } });
      Swal.fire({ icon: 'success', text: translate('Platform settings updated.', 'प्लेटफर्म सेटिङ अद्यावधिक भयो।') });
      fetchAdminData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to update platform settings.' });
    } finally {
      setSubmittingAction(false);
      submitGuard.finish();
    }
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!announcementText.trim()) return;

    setSubmittingAction(true);
    try {
      await api.post('/api/notifications', { title: 'Admin Announcement', message: announcementText }, { headers: { ...createIdempotencyHeader('admin-announcement') } });
      Swal.fire({ icon: 'success', text: translate('Announcement sent.', 'घोषणा पठाइयो।') });
      setAnnouncementText('');
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to send announcement.' });
    } finally {
      setSubmittingAction(false);
      submitGuard.finish();
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto"></div>
        <p className="mt-3 text-sm">{translate('Accessing admin portal...', 'ड्यासबोर्ड खोल्दैछ...')}</p>
      </div>
    );
  }

  if (!analytics || !analytics.metrics) {
    return (
      <div className="py-25 text-center text-rose-500 max-w-md mx-auto">
        <div className="text-4xl mb-4">⚠️</div>
        <h3 className="text-lg font-bold text-white mb-2">{translate('Connection Error', 'जडान त्रुटि')}</h3>
        <p className="text-xs text-slate-400">
          {translate(
            'Unable to load platform analytics. Please make sure the backend server is running and you are logged in as an administrator.',
            'प्लेटफर्म विश्लेषण लोड गर्न असमर्थ। कृपया ब्याकइन्ड सर्भर चलिरहेको र तपाईं प्रशासकको रूपमा लग इन भएको निश्चित गर्नुहोस्।'
          )}
        </p>
        <button onClick={fetchAdminData} className="mt-4 rounded-full bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition">
          {translate('Retry', 'पुन: प्रयास गर्नुहोस्')}
        </button>
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
          { title: 'Total Registered Users', value: analytics?.metrics?.totalUsers, icon: <FiUsers className="text-cyan-400" /> },
          { title: 'System Revenue Volume', value: `Rs. ${analytics?.metrics?.revenue}`, icon: <FiTrendingUp className="text-emerald-400" /> },
          { title: 'VAT Tax Collected (13%)', value: `Rs. ${analytics?.metrics?.tax}`, icon: <FiCheckCircle className="text-amber-400" /> },
          { title: 'Disputes (Reported Content)', value: analytics?.metrics?.reportedReviews, icon: <FiFlag className="text-rose-400 animate-pulse" /> },
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
        <aside className="w-full lg:w-64 space-y-1.5 shrink-0">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/10 p-2 space-y-1">
            {[
              { key: 'dashboard', label: translate('Dashboard', 'ड्यासबोर्ड'), icon: <FiHome /> },
              { key: 'businesses', label: translate('Business Management', 'व्यवसाय व्यवस्थापन'), icon: <FiBriefcase /> },
              { key: 'users', label: translate('User Management', 'प्रयोगकर्ता व्यवस्थापन'), icon: <FiUsers /> },
              { key: 'categories', label: translate('Category Management', 'श्रेणी व्यवस्थापन'), icon: <FiGrid /> },
              { key: 'coupons', label: translate('Coupons Management', 'कुपन व्यवस्थापन'), icon: <FiTag /> },
              { key: 'products', label: translate('Product & Service Management', 'उत्पादन र सेवा व्यवस्थापन'), icon: <FiPackage /> },
              { key: 'orders', label: translate('Order Management', 'अर्डर व्यवस्थापन'), icon: <FiShoppingCart /> },
              { key: 'reviews', label: translate('Review & Rating Management', 'समीक्षा र रेटिङ व्यवस्थापन'), icon: <FiShield /> },
              { key: 'reports', label: translate('Reports & Analytics', 'रिपोर्ट र विश्लेषण'), icon: <FiDownload /> },
              { key: 'announcements', label: translate('Announcements & Notifications', 'घोषणा र सूचनाहरू'), icon: <FiBell /> },
              { key: 'support', label: translate('Complaints & Support', 'समस्या र सहयोग'), icon: <FiLifeBuoy /> },
              { key: 'settings', label: translate('Settings', 'सेटिङ'), icon: <FiSettings /> },
              { key: 'profile', label: translate('Admin Profile', 'प्रशासक प्रोफाइल'), icon: <FiUser /> },
              { key: 'logout', label: translate('Logout', 'लगआउट'), icon: <FiLogOut /> },
            ].map((menu) => (
              <button
                key={menu.key}
                onClick={() => {
                  if (menu.key === 'logout') {
                    handleAdminLogout();
                    return;
                  }
                  setActiveTab(menu.key);
                }}
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
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">
                      ADMIN DASHBOARD
                    </div>
                    <h3 className="mt-3 text-lg font-extrabold text-white">{translate('Control the marketplace from one place', 'बजारलाई एकै ठाउँबाट नियन्त्रण गर्नुहोस्')}</h3>
                  </div>
                  <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-200">
                    <div className="font-bold">{user?.name || 'Administrator'}</div>
                    <div className="mt-1 text-[11px] text-cyan-300/80">{translate('Platform administrator', 'प्लेटफर्म प्रशासक')}</div>
                  </div>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-4xl border border-slate-800 bg-slate-900/30 p-5">
                  <h4 className="text-sm font-bold text-white">{translate('Marketplace Overview', 'बजार अवलोकन')}</h4>
                  <p className="mt-2 text-xs text-slate-400">{translate('Monitor approvals, users, sales, disputes, and platform health from the dashboard.', 'स्वीकृतिहरू, प्रयोगकर्ता, बिक्री, विवाद र प्लेटफर्म स्वास्थ्य ड्यासबोर्डबाट अनुगमन गर्नुहोस्।')}</p>
                </div>
                <div className="rounded-4xl border border-slate-800 bg-slate-900/30 p-5">
                  <h4 className="text-sm font-bold text-white">{translate('Quick Actions', 'छोटो कार्य')}</h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setActiveTab('businesses')} className="rounded-full bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-slate-950">Review Businesses</button>
                    <button onClick={() => setActiveTab('users')} className="rounded-full bg-cyan-500 px-3 py-1.5 text-[10px] font-bold text-slate-950">Manage Users</button>
                    <button onClick={() => setActiveTab('reports')} className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950">Export Reports</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'businesses' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Business Management', 'व्यवसाय व्यवस्थापन')}</h3>
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
                      {biz.verified === 'pending' && (
                        <>
                          <button
                            onClick={() => handleVerifyBusiness(biz._id, 'verified')}
                            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 transition"
                          >
                            Approve Shop
                          </button>
                          <button
                            onClick={() => handleVerifyBusiness(biz._id, 'rejected')}
                            className="rounded-lg bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-rose-600 transition"
                          >
                            Decline Shop
                          </button>
                        </>
                      )}
                      {biz.verified === 'verified' && (
                        <button
                          onClick={() => handleVerifyBusiness(biz._id, 'suspended')}
                          className="rounded-lg bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-rose-600 transition"
                        >
                          Suspend Shop
                        </button>
                      )}
                      {biz.verified === 'rejected' && (
                        <button
                          onClick={() => handleVerifyBusiness(biz._id, 'verified')}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 transition"
                        >
                          Approve Shop
                        </button>
                      )}
                      {biz.verified === 'suspended' && (
                        <button
                          onClick={() => handleVerifyBusiness(biz._id, 'verified')}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-emerald-400 transition"
                        >
                          Reactivate Shop
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          const { value: text } = await Swal.fire({
                            title: 'Request more info',
                            input: 'textarea',
                            inputLabel: 'Message to owner',
                            inputPlaceholder: 'Please describe what additional documents or clarifications are required',
                            showCancelButton: true,
                          });
                          if (text) {
                            try {
                              await api.post(`/api/admin/businesses/${biz._id}/request-info`, { message: text });
                              Swal.fire({ icon: 'success', text: 'Request sent to owner.' });
                              fetchAdminData();
                            } catch (e) {
                              Swal.fire({ icon: 'error', text: 'Failed to send request.' });
                            }
                          }
                        }}
                        className="rounded-lg bg-yellow-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-yellow-400 transition"
                      >
                        Request More Info
                      </button>
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

          {/* B. User management panel */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('User Control Center', 'प्रयोगकर्ता नियन्त्रण केन्द्र')}</h3>
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{u.name}</h4>
                        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">{u.role}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{u.email} • {u.phone || 'No phone'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => handleToggleUserStatus(u._id, !(u.lockUntil && new Date(u.lockUntil) > new Date()))} className="rounded-lg bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-slate-950">
                        {u.lockUntil && new Date(u.lockUntil) > new Date() ? 'Reactivate' : 'Suspend'}
                      </button>
                      <button onClick={() => handleDeleteUser(u._id)} className="rounded-lg bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-slate-950">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* C. Category management panel */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Category Management', 'श्रेणी व्यवस्थापन')}</h3>
              <form onSubmit={handleSaveCategory} className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Category Name" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" required />
                  <input value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} placeholder="Description" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" />
                </div>
                <button type="submit" disabled={submittingAction} className="rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">{submittingAction ? 'Processing...' : (editingCategoryId ? 'Update Category' : 'Add Category')}</button>
              </form>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat._id} className="rounded-2xl border border-slate-850 bg-slate-950/20 p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-sm">{cat.name}</div>
                      <div className="text-xs text-slate-400">{cat.description || 'No description'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEditCategory(cat)} className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[10px] text-slate-300"><FiEdit3 /></button>
                      <button onClick={() => handleDeleteCategory(cat._id)} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-[10px] text-rose-300"><FiTrash2 /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Product & Service Management', 'उत्पादन र सेवा व्यवस्थापन')}</h3>
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
                {translate('Admin can review all listed products and services across the marketplace and keep catalog quality high.', 'प्रशासकले बजारमा सूचीबद्ध सबै उत्पादन र सेवाहरू जाँच गर्न सक्छ र सूची गुणस्तर कायम राख्न सक्छ।')}
              </div>
              <div className="space-y-3">
                {businesses.flatMap((biz) => (
                  biz.products || []
                )).slice(0, 8).map((item, index) => (
                  <div key={index} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-300">
                    {item?.name || 'Catalog item'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D. Order management panel */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Order Oversight', 'अर्डर मापन')}</h3>
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-white text-sm">Order #{order._id.slice(-6)}</div>
                        <div className="text-xs text-slate-400 mt-1">{order.items?.length || 0} item(s) • Total Rs. {order.total}</div>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">{order.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F. Moderation & fake reviews resolver */}
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

          {/* G. Financial reports downloads */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Platform Reports Exporter', 'वित्तीय रिपोर्ट निकासी')}</h3>

              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { key: 'sales', title: 'Sales Performance Report', desc: 'CSV containing all orders subtotal, coupon usage, and totals.' },
                  { key: 'tax', title: 'Tax & VAT Collection Ledger', desc: 'Tax invoice registry calculating 13% tax collection details.' },
                  { key: 'users', title: 'Registered Users Registry', desc: 'List of all customers, sellers, and riders with details.' },
                ].map((rep) => (
                  <div key={rep.key} className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5 flex flex-col justify-between">
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

          {activeTab === 'announcements' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Announcements & Notifications', 'घोषणा र सूचनाहरू')}</h3>
              <form onSubmit={handleSendAnnouncement} className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <textarea value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} rows="4" className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Write an announcement for sellers or customers" />
                <button type="submit" disabled={submittingAction} className="rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">{submittingAction ? 'Processing...' : 'Send Announcement'}</button>
              </form>
            </div>
          )}

          {activeTab === 'support' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Complaints & Support', 'समस्या र सहयोग')}</h3>
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
                {translate('Review support requests, complaints, and escalation tickets submitted by users and sellers.', 'प्रयोगकर्ता र विक्रेता tərəfindən पेश गरिएका सहयोग निवेदन, शिकायत र उन्नयन टिकटहरू समीक्षा गर्नुहोस्।')}
              </div>
            </div>
          )}

          {/* H. Platform settings panel */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Platform Settings', 'प्लेटफर्म सेटिङ')}</h3>
              <form onSubmit={handleSaveSettings} className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" value={settingsForm.taxRate ?? ''} onChange={(e) => setSettingsForm({ ...settingsForm, taxRate: e.target.value })} placeholder="Tax Rate (%)" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" />
                  <input type="number" value={settingsForm.deliveryFee ?? ''} onChange={(e) => setSettingsForm({ ...settingsForm, deliveryFee: e.target.value })} placeholder="Delivery Fee" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" value={settingsForm.commissionRate ?? ''} onChange={(e) => setSettingsForm({ ...settingsForm, commissionRate: e.target.value })} placeholder="Commission Rate (%)" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" />
                  <input value={settingsForm.paymentMethods?.join(', ') || ''} onChange={(e) => setSettingsForm({ ...settingsForm, paymentMethods: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="Payment methods (comma separated)" className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" />
                </div>
                <button type="submit" disabled={submittingAction} className="rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">{submittingAction ? 'Processing...' : 'Save Settings'}</button>
              </form>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Admin Profile', 'प्रशासक प्रोफाइल')}</h3>
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
                {translate('This admin account can manage all marketplace operations, approvals, settings, announcements, and support workflows.', 'यो प्रशासक खाता सबै बजार सञ्चालन, स्वीकृति, सेटिङ, घोषणा र सहयोग कार्य प्रवाह व्यवस्थापन गर्न सक्छ।')}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
