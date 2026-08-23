import React, { useState, useEffect } from 'react';
import { FiUsers, FiCheckCircle, FiShield, FiTrendingUp, FiDownload, FiPlus, FiTag, FiAlertTriangle, FiFlag, FiShoppingCart, FiSettings, FiGrid, FiTrash2, FiEdit3, FiFileText, FiHome, FiBriefcase, FiPackage, FiBell, FiLifeBuoy, FiLogOut, FiUser, FiCalendar, FiChevronRight, FiCreditCard, FiStar, FiTruck } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { buildAdminSettingsPayload, normalizeAdminSettings } from '../utils/admin';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';
import AccountProfileCard from './AccountProfileCard';

export default function AdminDashboard({ user, lang, liveOrderTick = 0, activeTab, onTabChange }) {
  const [analytics, setAnalytics] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [settings, setSettings] = useState(normalizeAdminSettings({ taxRate: 13, deliveryFee: 70, commissionRate: 5, paymentMethods: ['COD', 'Card', 'Wallet'] }));
  const [loading, setLoading] = useState(true);
  const [announcementText, setAnnouncementText] = useState('');
  const currentTab = activeTab || 'dashboard';

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
  }, [user, liveOrderTick]);

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

      const productRes = await api.get('/api/products');
      setProducts(Array.isArray(productRes.data) ? productRes.data : []);

      const serviceRes = await api.get('/api/services');
      setServices(Array.isArray(serviceRes.data) ? serviceRes.data : []);

      const supportRes = await api.get('/api/admin/support-tickets');
      setSupportTickets(Array.isArray(supportRes.data) ? supportRes.data : []);

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

  const handleResolveTicket = async (ticketId, status = 'resolved') => {
    try {
      const ticket = supportTickets.find((item) => item._id === ticketId);
      const response = await api.put(`/api/admin/support-tickets/${ticketId}`, {
        status,
        resolution: ticket?.resolution || 'Resolution recorded by the admin team.',
      });
      if (response.data?.ticket) {
        setSupportTickets((prev) => prev.map((item) => item._id === ticketId ? response.data.ticket : item));
      }
      Swal.fire({ icon: 'success', text: translate('Support ticket updated.', 'समर्थन टिकट अद्यावधिक भयो।') });
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Failed to update support ticket.' });
    }
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

  const metrics = analytics.metrics;
  const chartData = Array.isArray(analytics.charts) ? analytics.charts : [];
  const chartMax = Math.max(...chartData.map((item) => Number(item.amount) || 0), 1);
  const chartPoints = chartData.map((item, index) => {
    const x = chartData.length > 1 ? (index / (chartData.length - 1)) * 100 : 50;
    const y = 94 - ((Number(item.amount) || 0) / chartMax) * 72;
    return `${x},${y}`;
  }).join(' ');
  const recentBusinesses = businesses.slice(0, 5);
  const recentOrders = orders.slice(0, 5);
  const pendingBusinesses = businesses.filter((business) => business.verified === 'pending').slice(0, 4);
  const categoryCounts = categories.map((category) => ({
    name: category.name,
    count: businesses.filter((business) => String(business.category).toLowerCase() === String(category.name).toLowerCase()).length,
  })).filter((category) => category.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxCategoryCount = Math.max(...categoryCounts.map((category) => category.count), 1);
  const statusCounts = ['pending', 'processing', 'dispatched', 'delivered', 'cancelled'].map((status) => ({
    label: status,
    count: orders.filter((order) => String(order.status || '').toLowerCase() === status).length,
  }));
  const reportedReviews = reviews.filter((review) => review.reported);
  const ratedReviews = reviews.filter((review) => Number.isFinite(Number(review.rating)));
  const averageRating = ratedReviews.length
    ? (ratedReviews.reduce((total, review) => total + Number(review.rating), 0) / ratedReviews.length).toFixed(1)
    : '0.0';
  const formatCompact = (value) => Number(value || 0).toLocaleString('en-IN');
  const goTo = (tab) => onTabChange?.(tab);

  return (
    <div className="mx-auto max-w-full px-3 py-5 sm:px-5 xl:px-8">
      {/* Admin Dashboard Content */}
      <main className="p-4 sm:p-6 text-[#142835]">
            <div className="mt-10 space-y-6">
          {currentTab === 'dashboard' && (
            <div className="admin-overview">
              <div className="admin-overview-heading">
                <div>
                  <p className="admin-eyebrow">{translate('Operations center', 'सञ्चालन केन्द्र')}</p>
                  <h1>{translate('Admin Dashboard', 'प्रशासक ड्यासबोर्ड')}</h1>
                  <p>{translate('Welcome to UdyogConnect Admin Panel', 'UdyogConnect प्रशासक प्यानलमा स्वागत छ')}</p>
                </div>
                <div className="admin-date"><FiCalendar /><span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}<strong>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span></div>
              </div>

              <div className="admin-stat-grid">
                      {[
                        { label: 'Total Businesses', value: metrics.totalBusinesses ?? businesses.length, trend: `${metrics.pendingApprovals || 0} pending`, icon: <FiBriefcase />, tone: 'blue', tab: 'businesses' },
                        { label: 'Total Users', value: metrics.totalUsers ?? users.length, trend: `${metrics.customers || 0} customers`, icon: <FiUsers />, tone: 'indigo', tab: 'users' },
                        { label: 'Total Orders', value: metrics.totalOrders ?? orders.length, trend: `${formatCompact(metrics.revenue)} revenue`, icon: <FiShoppingCart />, tone: 'orange', tab: 'orders' },
                        { label: 'Total Bookings', value: services.length, trend: `${services.filter((service) => service.availability !== false).length} active`, icon: <FiCalendar />, tone: 'coral', tab: 'services' },
                        { label: 'Average Rating', value: `${averageRating}/5`, trend: `${reviews.length} reviews`, icon: <FiStar />, tone: 'yellow', tab: 'reviews' },
                      ].map((stat) => (
                  <button type="button" key={stat.label} className="admin-stat-card" onClick={() => goTo(stat.tab)}>
                    <span className={`admin-stat-icon ${stat.tone}`}>{stat.icon}</span>
                    <span className="admin-stat-copy"><small>{stat.label}</small><strong>{typeof stat.value === 'number' ? formatCompact(stat.value) : stat.value}</strong><em><FiTrendingUp /> {stat.trend}</em></span>
                  </button>
                ))}
              </div>

              <div className="admin-main-grid">
                <section className="admin-panel admin-chart-panel">
                  <div className="admin-panel-heading"><div><h2>Platform Overview</h2><p>Sales activity for the last 7 days</p></div><select aria-label="Chart range"><option>Last 7 Days</option><option>Last 30 Days</option></select></div>
                  <div className="admin-line-chart">
                    <div className="admin-chart-legend"><span className="users-line">Users</span><span className="orders-line">Orders</span><span className="businesses-line">Businesses</span></div>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Seven day sales chart"><path className="chart-grid-line" d="M0 22H100 M0 46H100 M0 70H100 M0 94H100" /><polyline className="chart-area" points={`0,94 ${chartPoints} 100,94`} /><polyline className="chart-line" points={chartPoints || '0,94 100,94'} />{chartData.map((item, index) => { const x = chartData.length > 1 ? (index / (chartData.length - 1)) * 100 : 50; const y = 94 - ((Number(item.amount) || 0) / chartMax) * 72; return <circle key={item.date} cx={x} cy={y} r="1.5" className="chart-dot" />; })}</svg>
                    <div className="admin-chart-labels">{chartData.map((item) => <span key={item.date}>{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>)}</div>
                  </div>
                </section>

                <section className="admin-panel admin-donut-panel"><div className="admin-panel-heading"><div><h2>Business & User Growth</h2><p>Current platform mix</p></div></div><div className="admin-donut-wrap"><div className="admin-donut"><strong>{formatCompact(metrics.totalUsers ?? users.length)}</strong><span>Total Users</span></div><div className="admin-donut-legend"><span><i className="dot blue" />Customers <b>{metrics.totalUsers ? Math.round((metrics.customers / metrics.totalUsers) * 100) : 0}%</b></span><span><i className="dot orange" />Businesses <b>{metrics.totalBusinesses ? Math.round((metrics.sellers / metrics.totalBusinesses) * 100) : 0}%</b></span><span><i className="dot purple" />Others <b>{metrics.totalUsers ? Math.max(0, 100 - Math.round((metrics.customers / metrics.totalUsers) * 100) - Math.round((metrics.sellers / metrics.totalUsers) * 100)) : 0}%</b></span></div></div></section>
              </div>

              <div className="admin-three-grid">
                <section className="admin-panel admin-table-panel"><div className="admin-panel-heading"><h2>Recent Businesses</h2><button type="button" onClick={() => goTo('businesses')}>View All <FiChevronRight /></button></div><div className="admin-table"><div className="admin-table-row admin-table-header"><span>Business Name</span><span>Category</span><span>Location</span><span>Status</span><span>Joined</span></div>{recentBusinesses.map((business) => <button type="button" className="admin-table-row" key={business._id} onClick={() => goTo('businesses')}><strong>{business.name}</strong><span>{business.category}</span><span>{business.location || 'N/A'}</span><span className={`status-dot ${business.verified === 'verified' ? 'open' : 'pending'}`}>{business.verified === 'verified' ? 'Open' : business.verified}</span><span>{new Date(business.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></button>)}{recentBusinesses.length === 0 && <div className="admin-empty">No businesses registered yet.</div>}</div><button type="button" className="admin-yellow-action" onClick={() => goTo('businesses')}>View All Businesses <FiChevronRight /></button></section>
                <section className="admin-panel"><div className="admin-panel-heading"><h2>Order & Booking Status</h2><button type="button" onClick={() => goTo('orders')}>View All <FiChevronRight /></button></div><div className="status-bars">{statusCounts.map((status) => <button type="button" key={status.label} onClick={() => goTo('orders')}><span>{status.label}</span><i><b className={status.label} style={{ width: `${Math.min(100, (status.count / Math.max(orders.length, 1)) * 100)}%` }} /></i><strong>{status.count}</strong></button>)}</div></section>
                <section className="admin-panel"><div className="admin-panel-heading"><h2>Top Categories</h2><button type="button" onClick={() => goTo('businesses')}>View All <FiChevronRight /></button></div><div className="category-bars">{categoryCounts.map((category) => <button type="button" key={category.name} onClick={() => goTo('businesses')}><span><i className="dot orange" />{category.name}</span><b>{Math.round((category.count / maxCategoryCount) * 100)}%</b></button>)}{categoryCounts.length === 0 && <div className="admin-empty">No category data yet.</div>}</div></section>
              </div>

              <div className="admin-bottom-grid">
                <section className="admin-panel"><div className="admin-panel-heading"><h2>Recent Reviews</h2><button type="button" onClick={() => goTo('reviews')}>View All <FiChevronRight /></button></div><div className="review-list">{reviews.slice(0, 3).map((review) => <button type="button" key={review._id} onClick={() => goTo('reviews')}><FiStar /><span><strong>{review.customerName || 'Customer'}</strong><small>{review.comment || 'No comment provided.'}</small></span><b>{review.rating || 0}/5</b></button>)}{reviews.length === 0 && <div className="admin-empty">No reviews yet.</div>}</div></section>
                <section className="admin-panel"><div className="admin-panel-heading"><h2>Pending Verifications</h2><button type="button" onClick={() => goTo('businesses')}>View All <FiChevronRight /></button></div><div className="verification-list">{pendingBusinesses.map((business) => <div key={business._id}><span><strong>{business.name}</strong><small>{business.category || 'Business'} · {business.location || 'Location pending'}</small></span><button type="button" onClick={() => handleVerifyBusiness(business._id, 'verified')}>Verify</button></div>)}{pendingBusinesses.length === 0 && <div className="admin-empty">All businesses are verified.</div>}</div></section>
                <section className="admin-panel"><div className="admin-panel-heading"><h2>Admin Quick Actions</h2></div><div className="admin-quick-actions"><button type="button" onClick={() => goTo('businesses')}><FiBriefcase />Add New Business</button><button type="button" onClick={() => goTo('users')}><FiUsers />Manage Users</button><button type="button" onClick={() => goTo('reviews')}><FiFlag />Review Reports <b>{reportedReviews.length}</b></button><button type="button" onClick={() => goTo('payments')}><FiCreditCard />Payment Records</button><button type="button" onClick={() => goTo('settings')}><FiSettings />System Settings</button><button type="button" onClick={() => goTo('products')}><FiPackage />Content Management</button></div></section>
              </div>
            </div>
          )}

          {currentTab === 'businesses' && (
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
                      <p className="text-[10px] text-amber-400 mt-1 uppercase font-bold tracking-wider">
                        Catalog: {biz.offeringType || 'both'}
                      </p>
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
          {currentTab === 'users' && (
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
          {currentTab === 'categories' && (
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

          {currentTab === 'products' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Product & Service Management', 'उत्पादन र सेवा व्यवस्थापन')}</h3>
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
                {translate('Admin can review all listed products and services across the marketplace and keep catalog quality high.', 'प्रशासकले बजारमा सूचीबद्ध सबै उत्पादन र सेवाहरू जाँच गर्न सक्छ र सूची गुणस्तर कायम राख्न सक्छ।')}
              </div>
              <div className="space-y-3">
                {[...products.map((item) => ({ ...item, type: 'product' })), ...services.map((item) => ({ ...item, type: 'service' }))].map((item) => (
                  <div key={`${item.type}-${item._id}`} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{item.type} • {item.businessId}</div>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">{item.type}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{item.description || 'No description provided.'}</div>
                    <div className="mt-2 text-[11px] text-cyan-300">NPR {item.price || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentTab === 'services' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Service Catalog', 'सेवा सूची')}</h3>
              <div className="space-y-3">
                {services.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500">No service listings are available yet.</div>
                ) : services.map((service) => (
                  <div key={service._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-white text-sm">{service.name}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{service.businessId || 'Marketplace Service'}</div>
                      </div>
                      <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">Active</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">{service.description || 'No description provided.'}</p>
                    <div className="mt-2 text-[11px] text-amber-300">NPR {service.price || 0}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* D. Order management panel */}
          {currentTab === 'orders' && (
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

          {currentTab === 'payments' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Payments & Settlement', 'भुक्तानी र सेटलमेन्ट')}</h3>
              <div className="space-y-3">
                {orders.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500">No payment records are available yet.</div>
                ) : orders.map((order) => (
                  <div key={order._id} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-white text-sm">Order #{order._id?.slice(-6) || 'N/A'}</div>
                        <div className="text-xs text-slate-400 mt-1">{order.items?.length || 0} item(s) • Total NPR {order.total || 0}</div>
                      </div>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{order.status || 'paid'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* F. Moderation & fake reviews resolver */}
          {currentTab === 'reviews' && (
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
          {currentTab === 'reports' && (
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

          {currentTab === 'announcements' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Announcements & Notifications', 'घोषणा र सूचनाहरू')}</h3>
              <form onSubmit={handleSendAnnouncement} className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                <textarea value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} rows="4" className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Write an announcement for sellers or customers" />
                <button type="submit" disabled={submittingAction} className="rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">{submittingAction ? 'Processing...' : 'Send Announcement'}</button>
              </form>
            </div>
          )}

          {currentTab === 'support' && (
            <div className="space-y-4">
              <h3 className="text-lg font-extrabold text-white">{translate('Complaints & Support', 'समस्या र सहयोग')}</h3>
              <div className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
                {translate('Review support requests, complaints, and escalation tickets submitted by users and sellers.', 'प्रयोगकर्ता र विक्रेता tərəfindən पेश गरिएका सहयोग निवेदन, शिकायत र उन्नयन टिकटहरू समीक्षा गर्नुहोस्।')}
              </div>
              <div className="space-y-3">
                {supportTickets.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-500">No support tickets have been submitted yet.</div>
                ) : (
                  supportTickets.map((ticket) => (
                    <div key={ticket._id} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-white text-sm">{ticket.subject}</div>
                          <div className="text-[10px] text-slate-400">{ticket.userName || 'Customer'} • {ticket.email || 'No email'} • {ticket.category}</div>
                        </div>
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">{ticket.status}</span>
                      </div>
                      <p className="text-xs text-slate-300">{ticket.message}</p>
                      {ticket.resolution && <p className="text-[10px] text-emerald-300">Resolution: {ticket.resolution}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => handleResolveTicket(ticket._id, 'in-progress')} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200">Mark In Progress</button>
                        <button onClick={() => handleResolveTicket(ticket._id, 'resolved')} className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-bold text-slate-950">Resolve</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* H. Platform settings panel */}
          {currentTab === 'settings' && (
            <div className="space-y-4">
              <AccountProfileCard user={user} lang={lang} />
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
            </div>
      </main>
    </div>
  );
}
