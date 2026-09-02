import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiShoppingBag, FiCalendar, FiTrendingUp, FiPlus, FiTrash2,
  FiFileText, FiEdit3, FiCheckCircle, FiClock, FiStar,
  FiRefreshCw, FiXCircle, FiBell, FiTag, FiSettings,
  FiPackage, FiAlertCircle, FiUpload, FiSave,
  FiX, FiEye, FiMap, FiPhone, FiMail, FiInfo, FiTruck,
  FiArrowUp, FiArrowRight, FiExternalLink, FiGlobe, FiUsers,
  FiGrid, FiZap, FiMapPin, FiHelpCircle
} from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';
import { uploadFilesToCloudinary } from '../utils/mediaUpload';
import { getBusinessAvailabilityMeta } from '../utils/businessAvailability';
import AccountProfileCard from './AccountProfileCard';

const fmt = (value) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

const getBusinessApprovalStatus = (business) => {
  if (business?.approvalStatus === 'approved') return 'approved';
  if (business?.approvalStatus === 'rejected' || business?.verified === 'rejected') return 'rejected';
  return 'pending';
};

const statusColor = (s) => {
  const m = {
    placed:     'bg-blue-500/15 text-blue-300 border-blue-500/30',
    preparing:  'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dispatched: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    completed:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cancelled:  'bg-rose-500/15 text-rose-300 border-rose-500/30',
    pending:    'bg-slate-500/15 text-slate-300 border-slate-500/30',
    confirmed:  'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  };
  return m[s] || 'bg-slate-500/15 text-slate-300 border-slate-500/30';
};

function StatCard({ icon, label, value, sub, color = 'amber' }) {
  const colorMap = {
    amber:   'from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
    blue:    'from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-400',
    purple:  'from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-400',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-lg">{icon}</span>
        {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function SectionHeader({ title, children }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-extrabold text-white">{title}</h3>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</label>}
      <input
        {...props}
        className={`w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition ${props.className || ''}`}
      />
    </div>
  );
}

function TextAreaField({ label, ...props }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-semibold text-slate-400 mb-1">{label}</label>}
      <textarea
        {...props}
        className={`w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition resize-none ${props.className || ''}`}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function SellerDashboard({ user, lang, activeTab, onTabChange, onOpenBusiness, liveOrderTick = 0, notifications = [] }) {
  const t = (en, ne) => lang === 'en' ? en : ne;

  const [myBusiness, setMyBusiness]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [internalTab, setInternalTab] = useState('overview');
  const [pollingMsg, setPollingMsg]   = useState('');
  const offeringType = myBusiness?.offeringType || 'both';
  const requestedTab = activeTab ?? internalTab;
  const resolvedTab = requestedTab === 'ratings' ? 'reviews' : requestedTab === 'settings' ? 'profile' : requestedTab;
  const currentTab = (offeringType === 'products' && resolvedTab === 'services') || (offeringType === 'services' && resolvedTab === 'products')
    ? 'overview'
    : resolvedTab;
  const changeTab = (tab) => {
    if (onTabChange) onTabChange(tab);
    setInternalTab(tab);
  };

  // Catalog state
  const [products,  setProducts]  = useState([]);
  const [services,  setServices]  = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [bookings,  setBookings]  = useState([]);
  const [reviews,   setReviews]   = useState([]);

  // Onboarding form
  const [bizForm, setBizForm] = useState({
    name: '', category: 'Grocery', location: '', description: '', offeringType: 'both',
    hours: '09:00 - 18:00', contactEmail: '', phone: '',
    registrationNumber: '', panVatNumber: '', qrUrl: '',
    isOpen: true, deliveryAvailable: true, deliveryRadiusKm: '5',
  });
  const [bizDoc, setBizDoc] = useState(null);
  const [bizQr, setBizQr] = useState(null);

  // Product/Service add form
  const [showAddProd, setShowAddProd] = useState(false);
  const [showAddServ, setShowAddServ] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [prodForm, setProdForm] = useState({ name: '', brand: '', price: '', discount: '0', stock: '10', description: '', category: '' });
  const [prodImg, setProdImg]   = useState(null);
  const [servForm, setServForm] = useState({ name: '', price: '', duration: '60', description: '', homeService: false });

  // Profile edit
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const availabilityMeta = getBusinessAvailabilityMeta(myBusiness || {});
  const [profileLogo, setProfileLogo] = useState(null);
  const [profileCover, setProfileCover] = useState(null);
  const [profileDoc, setProfileDoc] = useState(null);
  const [profileQr, setProfileQr] = useState(null);

  // Promotions
  const [showAddPromo, setShowAddPromo] = useState(false);
  const [promoForm, setPromoForm] = useState({ code: '', discountPercent: '', maxDiscount: '', expiryDate: '' });
  const [coupons, setCoupons] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overviewTimePeriod, setOverviewTimePeriod] = useState('week');
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);
  const logoInputRef = useRef(null);

  // Review replies
  const [replyText, setReplyText] = useState({});

  /* ── Fetch all seller data ── */
  const fetchAll = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const bizRes = await api.get('/api/businesses/mine');
      const mine = bizRes.data?.business;

      if (mine) {
        setMyBusiness(mine);
        const detail = await api.get(`/api/businesses/${mine._id}`);
        setProducts(detail.data.products || []);
        setServices(detail.data.services || []);
        setReviews(detail.data.reviews   || []);

        const [ordRes, bkRes, cpRes] = await Promise.allSettled([
          api.get('/api/orders'),
          api.get('/api/bookings'),
          api.get('/api/admin/coupons'),
        ]);
        if (ordRes.status === 'fulfilled') setOrders(ordRes.value.data);
        if (bkRes.status  === 'fulfilled') setBookings(bkRes.value.data);
        if (cpRes.status  === 'fulfilled') setCoupons(cpRes.value.data);
      } else {
        setMyBusiness(null);
      }
    } catch (e) {
      console.error('fetchAll error', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user) return undefined;
    const refreshTimer = setInterval(() => fetchAll(true), 60 * 1000);
    return () => clearInterval(refreshTimer);
  }, [fetchAll, user, liveOrderTick]);

  /* ── Poll every 15 s for status change after pending submission ── */
  useEffect(() => {
    if (!myBusiness || getBusinessApprovalStatus(myBusiness) !== 'pending') return;

    setPollingMsg('Checking approval status…');
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/api/businesses/mine');
        const mine = res.data?.business;
        if (mine && mine.approvalStatus !== myBusiness.approvalStatus) {
          setMyBusiness(mine);
          setPollingMsg('');
          if (mine.approvalStatus === 'approved') {
            Swal.fire({
              icon: 'success',
              title: '🎉 Business Approved!',
              text: 'Your business has been approved by the admin. Your full dashboard is now unlocked!',
              confirmButtonColor: '#f59e0b',
            });
          }
        }
      } catch { /* silent */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [myBusiness?.approvalStatus, user]);

  /* ────────────────────────────────── HANDLERS ────────────────── */

  const handleRegisterBusiness = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!bizForm.name || !bizForm.description || !bizForm.location) {
      submitGuard.finish();
      return Swal.fire({ icon: 'warning', title: 'Missing Fields', text: 'Name, description, and location are required.' });
    }
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(bizForm).forEach(([k, v]) => fd.append(k, v));

      const filesToUpload = [];
      if (bizDoc) filesToUpload.push(bizDoc);
      if (bizQr) filesToUpload.push(bizQr);

      const uploadedUrls = await uploadFilesToCloudinary(filesToUpload);
      let fileIndex = 0;
      if (bizDoc) {
        if (uploadedUrls[fileIndex]) fd.append('documentUrl', uploadedUrls[fileIndex]);
        fd.append('document', bizDoc);
        fileIndex += 1;
      }
      if (bizQr) {
        if (uploadedUrls[fileIndex]) fd.append('qrUrl', uploadedUrls[fileIndex]);
        fd.append('qr', bizQr);
      }

      const response = await api.post('/api/businesses', fd, { headers: { ...createIdempotencyHeader('business-register') } });
      if (response.data?.business) setMyBusiness(response.data.business);
      Swal.fire({
        icon: 'success',
        title: t('Registration Submitted!', 'दर्ता विवरण पेश भयो!'),
        text: t('Your application is under admin review. You will be notified when approved.', 'तपाईंको आवेदन समीक्षाधीन छ। अनुमोदन भएपछि सूचित हुनुहुनेछ।'),
        confirmButtonColor: '#f59e0b',
      });
      fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Submission Failed', text: err.response?.data?.message || 'Please try again.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('businessId', myBusiness._id);
      Object.entries(prodForm).forEach(([k, v]) => fd.append(k, v));
      fd.append('category', prodForm.category || myBusiness.category);

      if (prodImg) {
        const uploadedUrls = await uploadFilesToCloudinary([prodImg]);
        if (uploadedUrls[0]) {
          fd.append('imageUrl', uploadedUrls[0]);
        }
        fd.append('image', prodImg);
      }

      if (editingProduct) {
        await api.put(`/api/products/${editingProduct._id}`, prodForm, { headers: { ...createIdempotencyHeader('product-update') } });
        Swal.fire({ icon: 'success', title: 'Product Updated', timer: 1200, showConfirmButton: false });
        setEditingProduct(null);
      } else {
        await api.post('/api/products', fd, { headers: { 'Content-Type': 'multipart/form-data', ...createIdempotencyHeader('product-create') } });
        Swal.fire({ icon: 'success', title: 'Product Added!', timer: 1200, showConfirmButton: false });
      }
      setProdForm({ name: '', brand: '', price: '', discount: '0', stock: '10', description: '', category: '' });
      setProdImg(null); setShowAddProd(false); fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Product upload failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      if (editingService) {
        await api.put(`/api/services/${editingService._id}`, servForm, { headers: { ...createIdempotencyHeader('service-update') } });
        Swal.fire({ icon: 'success', title: 'Service Updated', timer: 1200, showConfirmButton: false });
        setEditingService(null);
      } else {
        await api.post('/api/services', { ...servForm, businessId: myBusiness._id }, { headers: { ...createIdempotencyHeader('service-create') } });
        Swal.fire({ icon: 'success', title: 'Service Added!', timer: 1200, showConfirmButton: false });
      }
      setServForm({ name: '', price: '', duration: '60', description: '', homeService: false });
      setShowAddServ(false); fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Service creation failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleDeleteProduct = async (id) => {
    const res = await Swal.fire({ icon: 'warning', title: 'Remove product?', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, delete' });
    if (!res.isConfirmed) return;
    await api.delete(`/api/products/${id}`);
    Swal.fire({ icon: 'success', title: 'Deleted', timer: 1000, showConfirmButton: false });
    fetchAll();
  };

  const handleDeleteService = async (id) => {
    const res = await Swal.fire({ icon: 'warning', title: 'Remove service?', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Yes, delete' });
    if (!res.isConfirmed) return;
    await api.delete(`/api/services/${id}`);
    Swal.fire({ icon: 'success', title: 'Deleted', timer: 1000, showConfirmButton: false });
    fetchAll();
  };

  const handleOrderStatus = async (orderId, status, note) => {
    try {
      await api.put(`/api/orders/${orderId}/status`, { status, note });
      Swal.fire({ icon: 'success', title: `Order → ${status}`, timer: 1200, showConfirmButton: false });
      fetchAll(true);
    } catch { Swal.fire({ icon: 'error', text: 'Status update failed.' }); }
  };

  const handleBookingStatus = async (id, status) => {
    try {
      await api.put(`/api/bookings/${id}`, { status });
      Swal.fire({ icon: 'success', title: `Booking → ${status}`, timer: 1200, showConfirmButton: false });
      fetchAll(true);
    } catch { Swal.fire({ icon: 'error', text: 'Booking update failed.' }); }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(profileForm).forEach(([k, v]) => fd.append(k, v));

      const uploadedFiles = [];
      if (profileLogo) uploadedFiles.push(profileLogo);
      if (profileCover) uploadedFiles.push(profileCover);
      if (profileDoc) uploadedFiles.push(profileDoc);
      if (profileQr) uploadedFiles.push(profileQr);

      const uploadedUrls = await uploadFilesToCloudinary(uploadedFiles);
      let fileIndex = 0;
      if (profileLogo) {
        if (uploadedUrls[fileIndex]) fd.append('logoUrl', uploadedUrls[fileIndex]);
        fd.append('logo', profileLogo);
        fileIndex += 1;
      }
      if (profileCover) {
        if (uploadedUrls[fileIndex]) fd.append('coverUrl', uploadedUrls[fileIndex]);
        fd.append('cover', profileCover);
        fileIndex += 1;
      }
      if (profileDoc) {
        if (uploadedUrls[fileIndex]) fd.append('documentUrl', uploadedUrls[fileIndex]);
        fd.append('document', profileDoc);
        fileIndex += 1;
      }
      if (profileQr) {
        if (uploadedUrls[fileIndex]) fd.append('qrUrl', uploadedUrls[fileIndex]);
        fd.append('qr', profileQr);
      }

      const response = await api.put(`/api/businesses/${myBusiness._id}`, fd, { headers: { ...createIdempotencyHeader('business-profile') } });
      if (response.data?.business) {
        setMyBusiness(response.data.business);
      }
      Swal.fire({ icon: 'success', title: 'Profile Updated!', timer: 1200, showConfirmButton: false });
      setShowEditProfile(false);
      setProfileLogo(null);
      setProfileCover(null);
      setProfileDoc(null);
      fetchAll();
    } catch { Swal.fire({ icon: 'error', text: 'Profile update failed.' }); }
    finally { setIsSubmitting(false); submitGuard.finish(); }
  };

  const handleUploadLogo = async (selectedFile) => {
    if (!selectedFile || !submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      const uploadedUrls = await uploadFilesToCloudinary([selectedFile]);
      if (uploadedUrls[0]) {
        fd.append('logoUrl', uploadedUrls[0]);
      }
      fd.append('logo', selectedFile);
      const response = await api.put(`/api/businesses/${myBusiness._id}`, fd, { headers: { ...createIdempotencyHeader('business-logo') } });
      if (response.data?.business) {
        setMyBusiness(response.data.business);
      }
      Swal.fire({ icon: 'success', title: 'Logo Updated', timer: 1200, showConfirmButton: false });
      fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Logo upload failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleRemoveLogo = async () => {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Remove logo?',
      text: 'This will delete the current business logo.',
      showCancelButton: true,
      confirmButtonText: 'Yes, remove it',
      confirmButtonColor: '#ef4444',
    });
    if (!result.isConfirmed || !submitGuard.begin()) return;

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('removeLogo', 'true');
      const response = await api.put(`/api/businesses/${myBusiness._id}`, fd, { headers: { ...createIdempotencyHeader('business-logo-remove') } });
      if (response.data?.business) {
        setMyBusiness(response.data.business);
      }
      Swal.fire({ icon: 'success', title: 'Logo Removed', timer: 1000, showConfirmButton: false });
      fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Could not remove logo.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const handleAddPromo = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      await api.post('/api/admin/coupons', promoForm, { headers: { ...createIdempotencyHeader('seller-promo') } });
      Swal.fire({ icon: 'success', title: 'Promo Code Created!', timer: 1200, showConfirmButton: false });
      setPromoForm({ code: '', discountPercent: '', maxDiscount: '', expiryDate: '' });
      setShowAddPromo(false); fetchAll();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Failed to create promo.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  /* ─ Analytics ─ */
  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalRevenue    = completedOrders.reduce((s, o) => s + (o.total || 0), 0);
  const pendingOrders   = orders.filter(o => ['placed', 'preparing'].includes(o.status));
  const avgRating       = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';
  const customerCount = new Set(orders.map((order) => order.customerId || order.deliveryAddress?.email).filter(Boolean)).size;
  const repeatCustomerCount = Object.values(orders.reduce((counts, order) => {
    const customerId = order.customerId || order.deliveryAddress?.email;
    if (customerId) counts[customerId] = (counts[customerId] || 0) + 1;
    return counts;
  }, {})).filter((count) => count > 1).length;
  const currentPeriodStart = new Date();
  currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);
  const previousPeriodStart = new Date(currentPeriodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
  const currentPeriodOrders = orders.filter((order) => new Date(order.createdAt || 0) >= currentPeriodStart);
  const previousPeriodOrders = orders.filter((order) => {
    const createdAt = new Date(order.createdAt || 0);
    return createdAt >= previousPeriodStart && createdAt < currentPeriodStart;
  });
  const periodRevenue = (periodOrders) => periodOrders.filter((order) => order.status === 'completed' || order.paymentStatus === 'paid').reduce((sum, order) => sum + Number(order.total || 0), 0);
  const percentChange = (current, previous) => previous > 0 ? `${Math.round(((current - previous) / previous) * 100)}%` : current > 0 ? '+100%' : '0%';
  const revenueChange = percentChange(periodRevenue(currentPeriodOrders), periodRevenue(previousPeriodOrders));
  const orderChange = percentChange(currentPeriodOrders.length, previousPeriodOrders.length);
  const orderItemCounts = orders.flatMap((order) => order.items || []).reduce((counts, item) => {
    const key = item.productId || item.name;
    if (key) counts[key] = (counts[key] || 0) + Number(item.quantity || 1);
    return counts;
  }, {});
  const topProductIds = Object.entries(orderItemCounts).sort(([, first], [, second]) => second - first).map(([id]) => id);
  const productSoldCount = (product) => orderItemCounts[product._id] || orderItemCounts[product.name] || 0;
  const productOrders = orders.filter((order) => order.items?.some((item) => item.type !== 'service'));
  const serviceOrders = orders.filter((order) => order.items?.some((item) => item.type === 'service'));
  const orderTypeTotal = productOrders.length + serviceOrders.length || 1;
  const productOrderPercent = Math.round((productOrders.length / orderTypeTotal) * 100);
  const serviceOrderPercent = Math.round((serviceOrders.length / orderTypeTotal) * 100);

  /* ─ Loading ─ */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        <p className="text-sm text-slate-400">{t('Loading business portal…', 'व्यवसाय पोर्टल खोल्दैछ…')}</p>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     1. NO BUSINESS REGISTERED → Onboarding Form
  ══════════════════════════════════════════════════════════════ */
  if (!myBusiness) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-slate-900/80 to-slate-950/80">
        <div className="w-full h-full overflow-y-auto">
          <div className="p-6 sm:p-8">
            <div className="mb-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20 mb-3">
                <FiPackage className="h-5 w-5 text-amber-400" />
              </div>
              <h2 className="text-2xl font-black text-white">{t('Register Your Business', 'व्यवसाय दर्ता गर्नुहोस्')}</h2>
              <p className="text-sm text-slate-400 mt-1">{t('Fill in your details and submit for admin approval. You\'ll be notified once approved.', 'विवरण भर्नुहोस् र अनुमोदनको लागि पेश गर्नुहोस्।')}</p>
            </div>

            <form onSubmit={handleRegisterBusiness} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label={t('Business Name *', 'पसलको नाम *')} placeholder="e.g. Himalayan Crafts" value={bizForm.name} onChange={e => setBizForm({...bizForm, name: e.target.value})} required />
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{t('Category *', 'वर्ग *')}</label>
                  <select value={bizForm.category} onChange={e => setBizForm({...bizForm, category: e.target.value})} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400">
                    {['Grocery','Restaurants & Food','Furniture','Gift Shop / Crafts','Home Services','Mechanics & Repair','Electronics','Clothing & Fashion','Health & Beauty','Education'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label={t('Location *', 'स्थान *')} placeholder="e.g. Thamel, Kathmandu" value={bizForm.location} onChange={e => setBizForm({...bizForm, location: e.target.value})} required />
                <InputField label="Business Hours" placeholder="09:00 - 18:00" value={bizForm.hours} onChange={e => setBizForm({...bizForm, hours: e.target.value})} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Catalog Type (What do you offer?)</label>
                <select value={bizForm.offeringType} onChange={e => setBizForm({...bizForm, offeringType: e.target.value})} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400">
                  <option value="both">Products & Services</option>
                  <option value="products">Products Only</option>
                  <option value="services">Services Only</option>
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Contact Email" type="email" placeholder="business@email.com" value={bizForm.contactEmail} onChange={e => setBizForm({...bizForm, contactEmail: e.target.value})} />
                <InputField label="Phone Number" type="tel" placeholder="+977-98XXXXXXXX" value={bizForm.phone} onChange={e => setBizForm({...bizForm, phone: e.target.value})} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Registration Number" placeholder="REG-XXXXXXXX" value={bizForm.registrationNumber} onChange={e => setBizForm({...bizForm, registrationNumber: e.target.value})} />
                <InputField label="PAN / VAT Number" placeholder="PAN-XXXXXXXXX" value={bizForm.panVatNumber} onChange={e => setBizForm({...bizForm, panVatNumber: e.target.value})} />
              </div>

              <TextAreaField label={t('Business Description *', 'व्यवसायको विवरण *')} placeholder="Tell customers what you offer, your specialties, years of experience…" value={bizForm.description} onChange={e => setBizForm({...bizForm, description: e.target.value})} rows={4} required />

              <div className="grid gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-300">
                  <p className="font-semibold text-white">Open status</p>
                  <p className="mt-1 text-xs text-slate-400">This is derived from your business hours automatically.</p>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2.5 text-sm text-slate-200">
                  <span>Delivery available</span>
                  <input type="checkbox" checked={Boolean(bizForm.deliveryAvailable)} onChange={(e) => setBizForm({ ...bizForm, deliveryAvailable: e.target.checked })} className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 accent-amber-400" />
                </label>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Delivery radius (km)</label>
                  <input type="number" min="1" max="50" value={bizForm.deliveryRadiusKm} onChange={(e) => setBizForm({ ...bizForm, deliveryRadiusKm: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  <FiUpload className="inline mr-1.5" />{t('Business Certificate / Document', 'व्यवसाय प्रमाणपत्र')}
                </label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setBizDoc(e.target.files[0])} className="text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-3 file:py-1.5 file:text-amber-300 file:font-semibold file:text-xs hover:file:bg-amber-400/20" />
                {bizDoc && <p className="mt-1.5 text-[11px] text-emerald-400">✓ {bizDoc.name}</p>}
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all hover:-translate-y-0.5 active:scale-98 disabled:opacity-60">
                {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : t('Submit Business Registration', 'व्यवसाय दर्ता पेश गर्नुहोस्')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     2. BUSINESS PENDING → Waiting Room
  ══════════════════════════════════════════════════════════════ */
  const approvalStatus = getBusinessApprovalStatus(myBusiness);

  if (approvalStatus === 'pending') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-10">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 animate-pulse">
            <FiClock className="h-7 w-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">{t('Under Review', 'समीक्षाधीन')}</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            {t(`Your business "${myBusiness.name}" has been submitted and is awaiting admin approval. This usually takes a short while.`,
               `तपाईंको व्यवसाय "${myBusiness.name}" पेश भएको छ र प्रशासकको अनुमोदनको प्रतीक्षामा छ।`)}
          </p>

          <div className="space-y-3 text-left rounded-2xl border border-slate-800 bg-slate-900/40 p-4 mb-6">
            <InfoRow icon={<FiPackage />} label="Business" value={myBusiness.name} />
            <InfoRow icon={<FiTag />}     label="Category"  value={myBusiness.category} />
            <InfoRow icon={<FiMap />}     label="Location"  value={myBusiness.location} />
            <InfoRow icon={<FiClock />}   label="Status"    value={<span className="text-amber-400 font-bold">Pending Review</span>} />
          </div>

          {pollingMsg && (
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 mb-4">
              <FiRefreshCw className="animate-spin h-3 w-3" /> {pollingMsg}
            </p>
          )}

          <button onClick={() => fetchAll()} className="flex items-center gap-2 mx-auto text-xs text-amber-400 hover:text-amber-300 transition">
            <FiRefreshCw className="h-3 w-3" /> {t('Check approval status', 'अनुमोदन स्थिति जाँच गर्नुहोस्')}
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     3. BUSINESS REJECTED
  ══════════════════════════════════════════════════════════════ */
  if (approvalStatus === 'rejected') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-10">
          <FiXCircle className="mx-auto h-14 w-14 text-rose-400 mb-4" />
          <h2 className="text-xl font-black text-white mb-2">
            Registration Not Approved
          </h2>
          <p className="text-sm text-slate-400">
            {myBusiness.rejectionReason || t('Your business registration was not approved. Please contact support or resubmit with correct documents.',
               'तपाईंको व्यवसाय दर्ता अनुमोदन भएन। कृपया समर्थनमा सम्पर्क गर्नुहोस् वा सहि कागजातसहित पुनः पेश गर्नुहोस्।')}
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     4. FULL DASHBOARD (approved / verified)
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="mx-auto max-w-full px-3 py-5 sm:px-5 xl:px-8">
      <main className="bg-[#f7f1e8] p-4 text-[#142835] sm:p-6">
      {currentTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ─── 1. BUSINESS PROFILE HEADER ─── */}
          <div style={{
            background: '#FFFFFF', borderRadius: 20, border: '1px solid #F0EAD6',
            overflow: 'hidden', boxShadow: '0 2px 8px rgba(11,26,48,0.04)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '24px 28px', flexWrap: 'wrap', gap: 20,
              background: 'linear-gradient(135deg, #FFFDF7 0%, #FFF9E8 100%)',
              borderBottom: '1px solid #F0EAD6',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 280 }}>
                {/* Business Logo */}
                <div style={{
                  width: 72, height: 72, borderRadius: 18,
                  background: myBusiness.imageUrl ? 'transparent' : 'linear-gradient(135deg, #F2B71D, #D4A017)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', border: '3px solid #F0EAD6', flexShrink: 0,
                }}>
                  {myBusiness.imageUrl ? (
                    <img src={myBusiness.imageUrl} alt={myBusiness.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <FiPackage style={{ width: 28, height: 28, color: '#FFFFFF' }} />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0B1A30', margin: 0 }}>{myBusiness.name}</h2>
                    <span style={{
                      padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: availabilityMeta.isOpen ? '#D1FAE5' : '#FEE2E2',
                      color: availabilityMeta.isOpen ? '#059669' : '#DC2626',
                    }}>{availabilityMeta.isOpen ? t('Open', 'खुला') : t('Closed', 'बन्द')}</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#57657A', margin: '4px 0 0' }}>{myBusiness.description?.slice(0, 80) || t('Fresh Products • Better Quality • Happy Customers', 'ताजा उत्पादनहरू • राम्रो गुणस्तर')}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#57657A' }}>
                      <FiMapPin style={{ width: 13, height: 13, color: '#F2B71D' }} /> {myBusiness.location}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#57657A' }}>
                      <FiStar style={{ width: 13, height: 13, color: '#F2B71D', fill: '#F2B71D' }} /> {myBusiness.rating || '4.8'} ({myBusiness.reviewCount || reviews.length} {t('reviews', 'समीक्षाहरू')})
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => { changeTab('profile'); }} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 12,
                  background: '#0B1A30', color: '#FFFFFF', border: 'none',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }} onMouseEnter={e => { e.currentTarget.style.background = '#1A2D47'; }}
                   onMouseLeave={e => { e.currentTarget.style.background = '#0B1A30'; }}>
                  <FiEdit3 style={{ width: 14, height: 14 }} /> {t('Edit Business Profile', 'प्रोफाइल सम्पादन')}
                </button>
                <button onClick={() => onOpenBusiness?.(myBusiness._id)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 12,
                  background: '#FFFFFF', color: '#0B1A30', border: '1px solid #E5E7EB',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s',
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F2B71D'; }}
                   onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; }}>
                  <FiEye style={{ width: 14, height: 14 }} /> {t('View My Store', 'मेरो पसल हेर्नुहोस्')}
                </button>
              </div>
            </div>
          </div>

          {/* ─── 2. STATS CARDS + BUSINESS STATUS + NOTIFICATIONS ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr)) 340px', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Stats Row */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${offeringType === 'both' ? 4 : 3}, 1fr)`, gap: 14 }}>
                {[
                  { icon: <FiShoppingBag />, label: t('Total Orders', 'कुल अर्डर'), value: orders.length, change: orderChange, color: '#3B82F6', bg: '#EFF6FF' },
                  { icon: <span style={{ fontSize: 16, fontWeight: 800 }}>Rs.</span>, label: t('Total Revenue', 'कुल राजस्व'), value: fmt(totalRevenue), change: revenueChange, color: '#059669', bg: '#ECFDF5' },
                  ...(offeringType !== 'services' ? [{ icon: <FiPackage />, label: t('Products', 'उत्पादनहरू'), value: products.length, change: `${products.length} active`, color: '#F2B71D', bg: '#FFFBEB' }] : []),
                  ...(offeringType !== 'products' ? [{ icon: <FiSettings />, label: t('Services', 'सेवाहरू'), value: services.length, change: `${services.length} active`, color: '#8B5CF6', bg: '#F5F3FF' }] : []),
                ].map((stat, idx) => (
                  <div key={idx} style={{
                    background: stat.bg, borderRadius: 16, padding: '18px 16px',
                    border: `1px solid ${stat.bg}`, position: 'relative', overflow: 'hidden',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                  }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.06)'; }}
                     onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${stat.color}20`, color: stat.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>{stat.icon}</div>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#0B1A30', lineHeight: 1.1 }}>{stat.value}</div>
                    <div style={{ fontSize: 12, color: '#57657A', marginTop: 4 }}>{stat.label}</div>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      marginTop: 8, fontSize: 11, fontWeight: 600,
                      color: '#059669', background: '#D1FAE5',
                      padding: '2px 8px', borderRadius: 20,
                    }}>
                      <FiArrowUp style={{ width: 10, height: 10 }} /> {stat.change} {t('vs. last month', 'गत महिना')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Status + Notifications Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Business Status Card */}
              <div style={{
                background: '#FFFFFF', borderRadius: 16, padding: '18px 20px',
                border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Business Status', 'व्यापार स्थिति')}</h4>
                  <div style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: availabilityMeta.isOpen ? '#059669' : '#D1D5DB',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF',
                      position: 'absolute', top: 2,
                      left: availabilityMeta.isOpen ? 20 : 2,
                      transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: availabilityMeta.isOpen ? '#059669' : '#DC2626' }} />
                    <span style={{ color: '#57657A' }}>{t('Store Status:', 'पसल स्थिति:')}</span>
                    <span style={{ fontWeight: 600, color: '#0B1A30' }}>{availabilityMeta.isOpen ? t('Open', 'खुला') : t('Closed', 'बन्द')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <FiClock style={{ width: 14, height: 14, color: '#F2B71D' }} />
                    <span style={{ color: '#57657A' }}>{t('Operating Hours:', 'सञ्चालन समय:')}</span>
                    <span style={{ fontWeight: 600, color: '#0B1A30' }}>{myBusiness.hours || '09:00 AM – 10:00 PM'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <FiMapPin style={{ width: 14, height: 14, color: '#F2B71D' }} />
                    <span style={{ color: '#57657A' }}>{t('Location:', 'स्थान:')}</span>
                    <span style={{ fontWeight: 600, color: '#0B1A30' }}>{myBusiness.location}</span>
                  </div>
                </div>
              </div>

              {/* Recent Notifications */}
              <div style={{
                background: '#FFFFFF', borderRadius: 16, padding: '18px 20px',
                border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Recent Notifications', 'भर्खरका सूचनाहरू')}</h4>
                  <button style={{ fontSize: 12, fontWeight: 600, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                    {t('View All', 'सबै हेर्नुहोस्')} <FiArrowRight style={{ width: 12, height: 12 }} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(notifications.length > 0 ? notifications.slice(0, 4) : [
                    { _id: 'n1', title: t('New order received', 'नयाँ अर्डर प्राप्त'), message: '2 mins ago', type: 'order' },
                    { _id: 'n2', title: t('Customer rated your business', 'ग्राहकले मूल्याङ्कन गर्नुभयो'), message: '1 hour ago', type: 'review' },
                    { _id: 'n3', title: t('Product is out of stock', 'उत्पादन स्टकमा छैन'), message: '3 hours ago', type: 'alert' },
                    { _id: 'n4', title: t('New Customer registered', 'नयाँ ग्राहक दर्ता भयो'), message: '5 hours ago', type: 'customer' },
                  ]).map(notif => {
                    const iconMap = { order: { icon: <FiShoppingBag />, bg: '#EFF6FF', color: '#3B82F6' }, review: { icon: <FiStar />, bg: '#FFFBEB', color: '#F2B71D' }, alert: { icon: <FiAlertCircle />, bg: '#FEF2F2', color: '#DC2626' }, customer: { icon: <FiUsers />, bg: '#F0FDF4', color: '#059669' } };
                    const style = iconMap[notif.type] || iconMap.order;
                    return (
                      <div key={notif._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          background: style.bg, color: style.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                        }}>{style.icon}</div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#0B1A30', margin: 0 }}>{notif.title}</p>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{notif.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ─── 3. SALES & ORDER OVERVIEW + QUICK ACTIONS ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
            <div style={{
              background: '#FFFFFF', borderRadius: 16, padding: '22px 24px',
              border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Sales & Order Overview', 'बिक्री र अर्डर सिंहावलोकन')}</h4>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['week', 'month', 'year'].map(p => (
                    <button key={p} onClick={() => setOverviewTimePeriod(p)} style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: 'none', cursor: 'pointer',
                      background: overviewTimePeriod === p ? '#0B1A30' : '#F3F4F6',
                      color: overviewTimePeriod === p ? '#FFFFFF' : '#6B7280',
                      transition: 'all 0.2s',
                    }}>
                      {p === 'week' ? t('This Week', 'यो हप्ता') : p === 'month' ? t('This Month', 'यो महिना') : t('This Year', 'यो वर्ष')}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28, alignItems: 'start' }}>
                {/* Revenue Chart */}
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#57657A', fontWeight: 500 }}>{t('Revenue', 'राजस्व')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: '#0B1A30' }}>{fmt(totalRevenue)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#D1FAE5', padding: '2px 6px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <FiArrowUp style={{ width: 10, height: 10 }} /> 18%
                      </span>
                    </div>
                  </div>
                  {/* Bar Chart */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140, paddingTop: 10 }}>
                    {(() => {
                      const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      const dayValues = dayLabels.map((_, i) => {
                        const dayOrders = orders.filter(o => {
                          const d = new Date(o.createdAt || Date.now());
                          return d.getDay() === (i + 1) % 7;
                        });
                        return dayOrders.filter((o) => o.status === 'completed' || o.paymentStatus === 'paid').reduce((s, o) => s + Number(o.total || 0), 0);
                      });
                      const maxVal = Math.max(...dayValues, 1);
                      return dayLabels.map((day, i) => (
                        <div key={day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                          <div style={{
                            width: '100%', maxWidth: 32,
                            height: Math.max(12, (dayValues[i] / maxVal) * 110),
                            borderRadius: '6px 6px 2px 2px',
                            background: i === 4 ? 'linear-gradient(180deg, #F2B71D, #E0A615)' : 'linear-gradient(180deg, #FDEAB0, #FDD95C)',
                            transition: 'height 0.4s ease',
                            position: 'relative',
                          }}>
                            {dayValues[i] > 0 && (
                              <span style={{
                                position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                                fontSize: 9, fontWeight: 700, color: '#57657A', whiteSpace: 'nowrap',
                              }}>{fmt(dayValues[i]).replace('Rs. ', '')}</span>
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 500 }}>{day}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Donut Chart */}
                <div>
                  <span style={{ fontSize: 11, color: '#57657A', fontWeight: 500 }}>{t('Order Type', 'अर्डर प्रकार')}</span>
                  <div style={{ position: 'relative', width: 140, height: 140, margin: '12px auto 0' }}>
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      {(() => {
                        const prodOrders = productOrders.length;
                        const servOrders = serviceOrders.length;
                        const otherOrders = Math.max(0, orders.length - prodOrders - servOrders);
                        const total = prodOrders + servOrders + otherOrders || 1;
                        const segments = [
                          { pct: prodOrders / total, color: '#F2B71D' },
                          { pct: servOrders / total, color: '#059669' },
                          { pct: otherOrders / total, color: '#3B82F6' },
                        ];
                        let offset = 0;
                        return segments.map((seg, i) => {
                          const circumference = Math.PI * 2 * 35;
                          const strokeLen = seg.pct * circumference;
                          const el = (
                            <circle key={i} cx="50" cy="50" r="35" fill="none"
                              stroke={seg.color} strokeWidth="12"
                              strokeDasharray={`${strokeLen} ${circumference - strokeLen}`}
                              strokeDashoffset={-offset}
                              strokeLinecap="round" />
                          );
                          offset += strokeLen;
                          return el;
                        });
                      })()}
                    </svg>
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: '#0B1A30' }}>{orders.length || 0}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>{t('Orders', 'अर्डर')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
                    {[
                      { label: t('Products', 'उत्पादनहरू'), pct: `${productOrderPercent}%`, color: '#F2B71D' },
                      { label: t('Services', 'सेवाहरू'), pct: `${serviceOrderPercent}%`, color: '#059669' },
                      { label: t('Others', 'अन्य'), pct: `${Math.max(0, 100 - productOrderPercent - serviceOrderPercent)}%`, color: '#3B82F6' },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                        <span style={{ color: '#57657A' }}>{item.label} ({item.pct})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, padding: '22px 20px',
              border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0B1A30', margin: '0 0 16px' }}>{t('Quick Actions', 'छिटो कार्यहरू')}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { icon: <FiPackage />, label: t('Add Product', 'उत्पादन थप्नुहोस्'), action: () => { changeTab('products'); setTimeout(() => setShowAddProd(true), 100); } },
                  { icon: <FiSettings />, label: t('Add Service', 'सेवा थप्नुहोस्'), action: () => { changeTab('services'); setTimeout(() => setShowAddServ(true), 100); } },
                  { icon: <FiEye />, label: t('View Orders', 'अर्डर हेर्नुहोस्'), action: () => changeTab('orders') },
                  { icon: <FiTag />, label: t('Manage Offers', 'अफर व्यवस्थापन'), action: () => changeTab('promos') },
                ].map((qa, i) => (
                  <button key={i} onClick={qa.action} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    padding: '18px 12px', borderRadius: 14,
                    background: '#FAFAF8', border: '1px solid #F0EAD6',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#F2B71D'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(242,183,29,0.12)'; }}
                     onMouseLeave={e => { e.currentTarget.style.borderColor = '#F0EAD6'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12,
                      background: '#FFFBEB', color: '#F2B71D',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>{qa.icon}</div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0B1A30', textAlign: 'center' }}>{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── 4. RECENT ORDERS + TOP PRODUCTS + BUSINESS PERFORMANCE ─── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: 20 }}>
            {/* Recent Orders */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, padding: '22px 24px',
              border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Recent Orders', 'भर्खरका अर्डरहरू')}</h4>
                <button onClick={() => changeTab('orders')} style={{ fontSize: 12, fontWeight: 600, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                  {t('View All', 'सबै हेर्नुहोस्')} <FiArrowRight style={{ width: 12, height: 12 }} />
                </button>
              </div>
              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 80px', gap: 8, padding: '8px 0', borderBottom: '1px solid #F0EAD6' }}>
                {[t('Order ID', 'अर्डर'), t('Customer', 'ग्राहक'), t('Amount', 'रकम'), t('Status', 'स्थिति'), t('Time', 'समय')].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</span>
                ))}
              </div>
              {/* Table Rows */}
              {orders.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t('No orders yet', 'अझैसम्म कुनै अर्डर छैन')}</div>
              ) : (
                orders.slice(0, 5).map(o => {
                  const statusStyles = {
                    placed: { bg: '#DBEAFE', color: '#2563EB', label: 'Processing' },
                    preparing: { bg: '#FEF3C7', color: '#D97706', label: 'Preparing' },
                    dispatched: { bg: '#E9D5FF', color: '#7C3AED', label: 'Dispatched' },
                    completed: { bg: '#D1FAE5', color: '#059669', label: 'Delivered' },
                    cancelled: { bg: '#FEE2E2', color: '#DC2626', label: 'Cancelled' },
                    pending: { bg: '#FEF3C7', color: '#D97706', label: 'Pending' },
                  };
                  const sty = statusStyles[o.status] || statusStyles.pending;
                  const timeAgo = (() => {
                    if (!o.createdAt) return '';
                    const diffMs = Date.now() - new Date(o.createdAt).getTime();
                    const mins = Math.floor(diffMs / 60000);
                    if (mins < 60) return `${mins} min ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
                    return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`;
                  })();
                  return (
                    <div key={o._id} style={{
                      display: 'grid', gridTemplateColumns: '70px 1fr 90px 90px 80px', gap: 8,
                      padding: '10px 0', borderBottom: '1px solid #F7F5EC', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0B1A30', fontFamily: 'monospace' }}>#{String(o._id).slice(-3)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #E5E7EB, #D1D5DB)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#6B7280', flexShrink: 0,
                        }}>{(o.deliveryAddress?.name || 'C').charAt(0).toUpperCase()}</div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#0B1A30', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.deliveryAddress?.name || 'Customer'}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0B1A30' }}>{fmt(o.total)}</span>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                        fontSize: 10, fontWeight: 700, background: sty.bg, color: sty.color,
                        textAlign: 'center', whiteSpace: 'nowrap',
                      }}>{sty.label}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{timeAgo}</span>
                    </div>
                  );
                })
              )}
              {orders.length > 0 && (
                <button onClick={() => changeTab('orders')} style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 14,
                  padding: '8px 16px', borderRadius: 10,
                  background: '#059669', color: '#FFFFFF', border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'background 0.2s',
                }} onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
                   onMouseLeave={e => { e.currentTarget.style.background = '#059669'; }}>
                  {t('View All Orders', 'सबै अर्डरहरू हेर्नुहोस्')} <FiArrowRight style={{ width: 12, height: 12 }} />
                </button>
              )}
            </div>

            {/* Top Products */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, padding: '22px 24px',
              border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Top Products', 'शीर्ष उत्पादनहरू')}</h4>
                <button onClick={() => changeTab('products')} style={{ fontSize: 12, fontWeight: 600, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                  {t('View All', 'सबै हेर्नुहोस्')} <FiArrowRight style={{ width: 12, height: 12 }} />
                </button>
              </div>
              {products.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t('No products yet', 'अझैसम्म कुनै उत्पादन छैन')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[...products].sort((first, second) => productSoldCount(second) - productSoldCount(first)).slice(0, 3).map((p, idx) => {
                    const soldCount = productSoldCount(p);
                    return (
                      <div key={p._id} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 14px', borderRadius: 14,
                        background: idx === 0 ? '#FFFBEB' : '#FAFAF8',
                        border: '1px solid #F0EAD6',
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: idx === 0 ? '#F2B71D' : idx === 1 ? '#9CA3AF' : '#CD7F32',
                          color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 800,
                        }}>{idx + 1}</div>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, overflow: 'hidden',
                          background: '#F3F4F6', flexShrink: 0,
                        }}>
                          {p.images?.[0] ? (
                            <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FiPackage style={{ color: '#D1D5DB' }} />
                            </div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1A30', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1A30' }}>{fmt(p.price)}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{soldCount} {t('sold', 'बिक्री')}</span>
                          </div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: '#059669',
                          display: 'flex', alignItems: 'center', gap: 2,
                        }}>
                          <FiArrowUp style={{ width: 10, height: 10 }} /> {productSoldCount(p)} {t('sold', 'बिक्री')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Business Performance */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, padding: '22px 20px',
              border: '1px solid #F0EAD6', boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0B1A30', margin: 0 }}>{t('Business Performance', 'व्यापार प्रदर्शन')}</h4>
                <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>{t('This Month', 'यो महिना')} ▾</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { icon: <FiUsers />, label: t('Customers', 'ग्राहक'), value: customerCount, color: '#3B82F6' },
                  { icon: <FiTrendingUp />, label: t('Sales Growth', 'बिक्री वृद्धि'), value: revenueChange, color: '#059669' },
                  { icon: <FiEye />, label: t('Services Listed', 'सूचीकृत सेवाहरू'), value: services.length, color: '#8B5CF6' },
                  { icon: <FiStar />, label: t('Repeat Customers', 'दोहोरिने ग्राहक'), value: repeatCustomerCount, color: '#F2B71D' },
                ].map((kpi, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: 14,
                    background: '#FAFAF8', border: '1px solid #F0EAD6',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${kpi.color}15`, color: kpi.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                      }}>{kpi.icon}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0B1A30' }}>{kpi.label}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{kpi.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ══════════════ ORDERS ══════════════ */}
      {currentTab === 'orders' && (
        <div className="space-y-4">
          <SectionHeader title={t(`Orders (${orders.length})`, `अर्डरहरू (${orders.length})`)} />
          {orders.length === 0 ? (
            <EmptyState icon={<FiShoppingBag />} msg={t('No orders yet.', 'अझैसम्म कुनै अर्डर छैन।')} />
          ) : (
            <div className="space-y-3">
              {orders.map(o => (
                <div key={o._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-mono font-bold text-white">#{String(o._id).slice(-8).toUpperCase()}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{o.deliveryAddress?.name} · {o.deliveryAddress?.phone}</p>
                      <p className="text-[11px] text-slate-500">{o.deliveryAddress?.address}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${statusColor(o.status)}`}>{o.status}</span>
                  </div>

                  <div className="text-xs text-slate-300 bg-slate-950/40 rounded-xl px-3 py-2">
                    {o.items?.map(i => `${i.name} ×${i.quantity}`).join(' | ')}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <div className="text-xs">
                      <span className="font-bold text-amber-300">{fmt(o.total)}</span>
                      <span className={`ml-2 text-[10px] ${o.paymentStatus === 'paid' ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {o.paymentStatus === 'paid' ? '✓ Paid' : 'Payment Pending'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {o.status === 'placed' && (
                        <>
                          <button onClick={() => handleOrderStatus(o._id, 'preparing', 'Seller accepted order.')} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-400 transition">Accept</button>
                          <button onClick={() => handleOrderStatus(o._id, 'cancelled', 'Seller rejected order.')} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/10 transition">Reject</button>
                        </>
                      )}
                      {o.status === 'preparing' && (
                        <button onClick={() => handleOrderStatus(o._id, 'dispatched', 'Order ready for pickup.')} className="rounded-lg bg-amber-400 px-3 py-1.5 text-[10px] font-bold text-slate-950 hover:bg-amber-300 transition">Ready to Dispatch</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ BOOKINGS ══════════════ */}
      {currentTab === 'bookings' && (
        <div className="space-y-4">
          <SectionHeader title={t(`Service Bookings (${bookings.length})`, `सेवा बुकिङहरू (${bookings.length})`)} />
          {bookings.length === 0 ? (
            <EmptyState icon={<FiCalendar />} msg={t('No service bookings yet.', 'अझैसम्म कुनै बुकिङ छैन।')} />
          ) : (
            <div className="space-y-3">
              {bookings.map(bk => (
                <div key={bk._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-mono font-bold text-white">#{String(bk._id).slice(-8).toUpperCase()}</p>
                    <p className="text-[11px] text-slate-400">{t('Date:', 'मिति:')} <span className="text-slate-200">{bk.date}</span> · {t('Slot:', 'समय:')} <span className="text-slate-200">{bk.timeSlot}</span></p>
                    {bk.staffMember && <p className="text-[11px] text-slate-500">{t('Staff:', 'कर्मचारी:')} {bk.staffMember}</p>}
                    {bk.homeService && <span className="text-[10px] text-purple-400 font-semibold">🏠 Home Service</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase ${statusColor(bk.status)}`}>{bk.status}</span>
                    {bk.status === 'pending' && (
                      <>
                        <button onClick={() => handleBookingStatus(bk._id, 'confirmed')} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-400 transition">Confirm</button>
                        <button onClick={() => handleBookingStatus(bk._id, 'cancelled')} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-[10px] font-bold text-rose-400 hover:bg-rose-500/10 transition">Decline</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ CATALOG ══════════════ */}
      {(currentTab === 'catalog' || currentTab === 'products' || currentTab === 'services') && (
        <div className="space-y-6">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {myBusiness?.offeringType !== 'services' && (
              <button onClick={() => { setShowAddProd(!showAddProd); setShowAddServ(false); setEditingProduct(null); setProdForm({ name: '', brand: '', price: '', discount: '0', stock: '10', description: '', category: '' }); }} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition">
                <FiPlus /> {t('Add Product', 'उत्पादन थप्नुहोस्')}
              </button>
            )}
            {myBusiness?.offeringType !== 'products' && (
              <button onClick={() => { setShowAddServ(!showAddServ); setShowAddProd(false); setEditingService(null); setServForm({ name: '', price: '', duration: '60', description: '', homeService: false }); }} className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-xs font-bold text-slate-200 hover:border-amber-400 hover:text-amber-400 transition">
                <FiPlus /> {t('Add Service', 'सेवा थप्नुहोस्')}
              </button>
            )}
          </div>

          {/* Add / Edit Product Form */}
          {showAddProd && offeringType !== 'services' && (
            <form onSubmit={handleAddProduct} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-white">{editingProduct ? t('Edit Product', 'उत्पादन सम्पादन') : t('New Product', 'नयाँ उत्पादन')}</h4>
                <button type="button" onClick={() => { setShowAddProd(false); setEditingProduct(null); }} className="text-slate-400 hover:text-white"><FiX /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Product Name *" placeholder="e.g. Organic Honey" value={prodForm.name} onChange={e => setProdForm({...prodForm, name: e.target.value})} required />
                <InputField label="Brand" placeholder="Brand name" value={prodForm.brand} onChange={e => setProdForm({...prodForm, brand: e.target.value})} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <InputField label="Price (Rs.) *" type="number" placeholder="0" value={prodForm.price} onChange={e => setProdForm({...prodForm, price: e.target.value})} required />
                <InputField label="Discount (%)" type="number" placeholder="0" value={prodForm.discount} onChange={e => setProdForm({...prodForm, discount: e.target.value})} />
                <InputField label="Stock Qty" type="number" placeholder="10" value={prodForm.stock} onChange={e => setProdForm({...prodForm, stock: e.target.value})} />
              </div>
              <TextAreaField label="Description *" placeholder="Product details, specifications…" value={prodForm.description} onChange={e => setProdForm({...prodForm, description: e.target.value})} rows={3} required />
              {!editingProduct && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1"><FiUpload className="inline mr-1" />Product Image</label>
                  <input type="file" accept="image/*" onChange={e => setProdImg(e.target.files[0])} className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-2.5 file:py-1 file:text-amber-300 file:text-xs file:font-semibold" />
                  {prodImg && <p className="mt-1 text-[11px] text-emerald-400">✓ {prodImg.name}</p>}
                </div>
              )}
              <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition disabled:opacity-60">
                <FiSave /> {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : (editingProduct ? t('Save Changes', 'परिवर्तन सुरक्षित गर्नुहोस्') : t('Add to Catalog', 'क्याटलगमा थप्नुहोस्'))}
              </button>
            </form>
          )}

          {/* Add / Edit Service Form */}
          {showAddServ && offeringType !== 'products' && (
            <form onSubmit={handleAddService} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-white">{editingService ? t('Edit Service', 'सेवा सम्पादन') : t('New Service', 'नयाँ सेवा')}</h4>
                <button type="button" onClick={() => { setShowAddServ(false); setEditingService(null); }} className="text-slate-400 hover:text-white"><FiX /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <InputField label="Service Name *" placeholder="e.g. Home Cleaning" value={servForm.name} onChange={e => setServForm({...servForm, name: e.target.value})} required />
                <InputField label="Price (Rs.) *" type="number" placeholder="0" value={servForm.price} onChange={e => setServForm({...servForm, price: e.target.value})} required />
                <InputField label="Duration (min)" type="number" placeholder="60" value={servForm.duration} onChange={e => setServForm({...servForm, duration: e.target.value})} />
              </div>
              <TextAreaField label="Description *" placeholder="What does this service include?" value={servForm.description} onChange={e => setServForm({...servForm, description: e.target.value})} rows={3} required />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={servForm.homeService} onChange={e => setServForm({...servForm, homeService: e.target.checked})} className="h-4 w-4 rounded accent-amber-400" />
                <span className="text-xs text-slate-300">Available as Home / On-site Service</span>
              </label>
              <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition disabled:opacity-60">
                <FiSave /> {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : (editingService ? t('Save Changes', 'परिवर्तन सुरक्षित गर्नुहोस्') : t('Add Service', 'सेवा थप्नुहोस्'))}
              </button>
            </form>
          )}

          {/* Products List */}
          {offeringType !== 'services' && <div>
            <h4 className="text-sm font-bold text-white mb-3">{t('Products', 'उत्पादनहरू')} ({products.length})</h4>
            {products.length === 0 ? (
              <EmptyState icon={<FiPackage />} msg={t('No products added yet.', 'अझैसम्म कुनै उत्पादन थपिएको छैन।')} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map(p => (
                  <div key={p._id} className="group rounded-2xl border border-slate-800 bg-slate-900/30 p-4 hover:border-slate-600 transition">
                    {p.images?.[0] && <img src={p.images[0]} alt={p.name} className="w-full h-28 object-cover rounded-xl mb-3 opacity-90 group-hover:opacity-100 transition" />}
                    <h5 className="text-sm font-bold text-slate-200">{p.name}</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{p.description}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold text-amber-300">{fmt(p.price)}</span>
                        {p.discount > 0 && <span className="ml-1.5 text-[10px] text-emerald-400">{p.discount}% off</span>}
                        <span className="block text-[10px] text-slate-500">Stock: {p.stock} units</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingProduct(p); setProdForm({ name: p.name, brand: p.brand || '', price: p.price, discount: p.discount || '0', stock: p.stock, description: p.description, category: p.category }); setShowAddProd(true); setShowAddServ(false); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition">
                          <FiEdit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteProduct(p._id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition">
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>}

          {/* Services List */}
          {myBusiness?.offeringType !== 'products' && (
            <div>
              <h4 className="text-sm font-bold text-white mb-3">{t('Services', 'सेवाहरू')} ({services.length})</h4>
              {services.length === 0 ? (
                <EmptyState icon={<FiCalendar />} msg={t('No services added yet.', 'अझैसम्म कुनै सेवा थपिएको छैन।')} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map(s => (
                    <div key={s._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 flex justify-between items-start hover:border-slate-600 transition">
                      <div>
                        <h5 className="text-sm font-bold text-slate-200">{s.name}</h5>
                        <p className="text-[11px] text-slate-500 mt-0.5">{s.description}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-xs font-bold text-amber-300">{fmt(s.price)}</span>
                          <span className="text-[10px] text-slate-500">{s.duration} min</span>
                          {s.homeService && <span className="text-[10px] text-purple-400">🏠 Home</span>}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingService(s); setServForm({ name: s.name, price: s.price, duration: s.duration || '60', description: s.description, homeService: s.homeService }); setShowAddServ(true); setShowAddProd(false); }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-amber-400 transition">
                          <FiEdit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteService(s._id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition">
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ REVIEWS ══════════════ */}
      {currentTab === 'reviews' && (
        <div className="space-y-4">
          <SectionHeader title={t(`Customer Reviews (${reviews.length})`, `ग्राहक समीक्षाहरू (${reviews.length})`)}>
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold">
              <FiStar /> {avgRating} avg
            </div>
          </SectionHeader>
          {reviews.length === 0 ? (
            <EmptyState icon={<FiStar />} msg={t('No reviews yet.', 'अझैसम्म कुनै समीक्षा छैन।')} />
          ) : (
            <div className="space-y-3">
              {reviews.map(r => (
                <div key={r._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">{(r.customerName || 'C').charAt(0)}</div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{r.customerName || 'Customer'}</p>
                        <div className="flex">{Array.from({ length: 5 }).map((_, i) => <FiStar key={i} className={`h-3 w-3 ${i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`} />)}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500">{r.targetType}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{r.comment}</p>

                  {/* Reply box */}
                  <div className="pt-2 border-t border-slate-800">
                    <p className="text-[10px] text-slate-500 mb-1.5">{t('Reply to this review:', 'यो समीक्षालाई जवाफ दिनुहोस्:')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={t('Write a response…', 'जवाफ लेख्नुहोस्…')}
                        value={replyText[r._id] || ''}
                        onChange={e => setReplyText({ ...replyText, [r._id]: e.target.value })}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => {
                          if (!replyText[r._id]?.trim()) return;
                          Swal.fire({ icon: 'success', title: t('Reply Sent!', 'जवाफ पठाइयो!'), text: t('Your response has been recorded.', 'तपाईंको जवाफ दर्ता भयो।'), timer: 1500, showConfirmButton: false });
                          setReplyText({ ...replyText, [r._id]: '' });
                        }}
                        className="rounded-xl bg-amber-400/20 border border-amber-400/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/30 transition"
                      >
                        {t('Send', 'पठाउनुहोस्')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PROMOTIONS ══════════════ */}
      {currentTab === 'promos' && (
        <div className="space-y-5">
          <SectionHeader title={t('Promotional Offers', 'प्रचार प्रस्ताव')}>
            <button onClick={() => setShowAddPromo(!showAddPromo)} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 transition">
              <FiPlus /> {t('Create Promo', 'प्रोमो बनाउनुहोस्')}
            </button>
          </SectionHeader>

          {showAddPromo && (
            <form onSubmit={handleAddPromo} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-white">{t('New Promo Code', 'नयाँ प्रोमो कोड')}</h4>
                <button type="button" onClick={() => setShowAddPromo(false)} className="text-slate-400 hover:text-white"><FiX /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Promo Code *" placeholder="e.g. SAVE20" value={promoForm.code} onChange={e => setPromoForm({...promoForm, code: e.target.value.toUpperCase()})} required />
                <InputField label="Discount %" type="number" placeholder="e.g. 20" value={promoForm.discountPercent} onChange={e => setPromoForm({...promoForm, discountPercent: e.target.value})} required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Max Discount (Rs.)" type="number" placeholder="e.g. 500" value={promoForm.maxDiscount} onChange={e => setPromoForm({...promoForm, maxDiscount: e.target.value})} required />
                <InputField label="Expiry Date *" type="date" value={promoForm.expiryDate} onChange={e => setPromoForm({...promoForm, expiryDate: e.target.value})} required />
              </div>
              <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition disabled:opacity-60">
                <FiTag /> {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : t('Create Promo Code', 'प्रोमो कोड बनाउनुहोस्')}
              </button>
            </form>
          )}

          {coupons.length === 0 ? (
            <EmptyState icon={<FiTag />} msg={t('No promo codes yet. Create one above.', 'अझैसम्म कुनै प्रोमो कोड छैन।')} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {coupons.map(c => (
                <div key={c._id} className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-black text-amber-400">{c.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${c.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>{c.active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="text-xs text-slate-300">{c.discountPercent}% off · up to {fmt(c.maxDiscount)}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Expires: {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : 'N/A'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════ PROFILE ══════════════ */}
      {currentTab === 'profile' && (
        <div className="space-y-5">
          <AccountProfileCard user={user} lang={lang} />
          <SectionHeader title={t('Business Profile', 'व्यवसाय प्रोफाइल')}>
            <button onClick={() => { setShowEditProfile(!showEditProfile); setProfileForm({ name: myBusiness.name, description: myBusiness.description, location: myBusiness.location, hours: myBusiness.hours, contactEmail: myBusiness.contactEmail, phone: myBusiness.phone || '', website: myBusiness.website || '', qrUrl: myBusiness.qrUrl || '', isOpen: myBusiness.isOpen !== false, deliveryAvailable: myBusiness.deliveryAvailable !== false, deliveryRadiusKm: myBusiness.deliveryRadiusKm ?? 5, offeringType: myBusiness.offeringType || 'both' }); }} className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition">
              <FiEdit3 /> {showEditProfile ? t('Cancel Edit', 'सम्पादन रद्द') : t('Edit Profile', 'प्रोफाइल सम्पादन')}
            </button>
          </SectionHeader>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Business Logo</p>
                <p className="text-xs text-slate-400">Add a new logo, replace the current one, or remove it completely.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={isSubmitting} className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition disabled:opacity-60">
                  {myBusiness.imageUrl ? 'Replace Logo' : 'Upload Logo'}
                </button>
                <button type="button" onClick={handleRemoveLogo} disabled={isSubmitting || !myBusiness.imageUrl} className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-50">
                  Remove Logo
                </button>
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleUploadLogo(file);
              }
              e.target.value = '';
            }} />
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
              {myBusiness.imageUrl ? (
                <img src={myBusiness.imageUrl} alt="Business logo" className="h-16 w-16 rounded-xl object-cover border border-slate-700" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs text-slate-500">No Logo</div>
              )}
              <div className="text-xs text-slate-400">
                <p className="font-semibold text-slate-300">Current logo preview</p>
                <p>PNG, JPG, or WebP files are supported.</p>
              </div>
            </div>
          </div>

          {showEditProfile ? (
            <form onSubmit={handleSaveProfile} className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Business Name *" value={profileForm.name || ''} onChange={e => setProfileForm({...profileForm, name: e.target.value})} required />
                <InputField label="Location *" value={profileForm.location || ''} onChange={e => setProfileForm({...profileForm, location: e.target.value})} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Business Hours" value={profileForm.hours || ''} onChange={e => setProfileForm({...profileForm, hours: e.target.value})} placeholder="09:00 - 18:00" />
                <InputField label="Website" type="url" value={profileForm.website || ''} onChange={e => setProfileForm({...profileForm, website: e.target.value})} placeholder="https://..." />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InputField label="Contact Email" type="email" value={profileForm.contactEmail || ''} onChange={e => setProfileForm({...profileForm, contactEmail: e.target.value})} />
                <InputField label="Phone" type="tel" value={profileForm.phone || ''} onChange={e => setProfileForm({...profileForm, phone: e.target.value})} />
              </div>
              <TextAreaField label="Description" value={profileForm.description || ''} onChange={e => setProfileForm({...profileForm, description: e.target.value})} rows={4} />
              <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1"><FiUpload className="inline mr-1" />Logo</label>
                  <input type="file" accept="image/*" onChange={e => setProfileLogo(e.target.files[0])} className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-2.5 file:py-1 file:text-amber-300 file:text-xs file:font-semibold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1"><FiUpload className="inline mr-1" />Cover</label>
                  <input type="file" accept="image/*" onChange={e => setProfileCover(e.target.files[0])} className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-2.5 file:py-1 file:text-amber-300 file:text-xs file:font-semibold" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1"><FiUpload className="inline mr-1" />Document</label>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setProfileDoc(e.target.files[0])} className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-2.5 file:py-1 file:text-amber-300 file:text-xs file:font-semibold" />
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">QR Code URL</label>
                  <input type="url" value={profileForm.qrUrl || ''} onChange={e => setProfileForm({...profileForm, qrUrl: e.target.value})} placeholder="https://..." className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1"><FiUpload className="inline mr-1" />Upload QR Image</label>
                  <input type="file" accept="image/*" onChange={e => setProfileQr(e.target.files[0])} className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-2.5 file:py-1 file:text-amber-300 file:text-xs file:font-semibold" />
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-300">
                  <p className="font-semibold text-white">Open status</p>
                  <p className="mt-1 text-xs text-slate-400">This is derived from your business hours automatically.</p>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200">
                  <span>Delivery available</span>
                  <input type="checkbox" checked={Boolean(profileForm.deliveryAvailable ?? myBusiness?.deliveryAvailable ?? true)} onChange={(e) => setProfileForm({ ...profileForm, deliveryAvailable: e.target.checked })} className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 accent-amber-400" />
                </label>
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Delivery radius (km)</label>
                  <input type="number" min="1" max="50" value={profileForm.deliveryRadiusKm ?? myBusiness?.deliveryRadiusKm ?? 5} onChange={(e) => setProfileForm({ ...profileForm, deliveryRadiusKm: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20" />
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/40 p-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <p className="font-semibold text-white text-sm">Catalog Type Settings</p>
                  <p className="mt-1 text-xs text-slate-400">Choose what your business offers. You must have at least one enabled.</p>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                  <span className="font-semibold">Products: ON/OFF</span>
                  <input type="checkbox" checked={profileForm.offeringType !== 'services'} onChange={(e) => {
                    const isProductsOn = e.target.checked;
                    const isServicesOn = profileForm.offeringType !== 'products';
                    if (!isProductsOn && !isServicesOn) {
                      Swal.fire({ icon: 'warning', title: 'Invalid Selection', text: 'You must have at least one catalog type enabled.' });
                      return;
                    }
                    setProfileForm({ ...profileForm, offeringType: isProductsOn ? (isServicesOn ? 'both' : 'products') : 'services' });
                  }} className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 accent-amber-400" />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-200">
                  <span className="font-semibold">Services: ON/OFF</span>
                  <input type="checkbox" checked={profileForm.offeringType !== 'products'} onChange={(e) => {
                    const isServicesOn = e.target.checked;
                    const isProductsOn = profileForm.offeringType !== 'services';
                    if (!isServicesOn && !isProductsOn) {
                      Swal.fire({ icon: 'warning', title: 'Invalid Selection', text: 'You must have at least one catalog type enabled.' });
                      return;
                    }
                    setProfileForm({ ...profileForm, offeringType: isServicesOn ? (isProductsOn ? 'both' : 'services') : 'products' });
                  }} className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-amber-500 accent-amber-400" />
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={isSubmitting} className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition disabled:opacity-60">
                  <FiSave /> {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : t('Save Profile', 'प्रोफाइल सुरक्षित गर्नुहोस्')}
                </button>
                <button type="button" onClick={() => setShowEditProfile(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-white transition">
                  {t('Cancel', 'रद्द गर्नुहोस्')}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
              <InfoRow icon={<FiPackage />}  label={t('Name',        'नाम')}          value={myBusiness.name} />
              <InfoRow icon={<FiTag />}      label={t('Category',    'वर्ग')}          value={myBusiness.category} />
              <InfoRow icon={<FiMap />}      label={t('Location',    'स्थान')}         value={myBusiness.location} />
              <InfoRow icon={<FiClock />}    label={t('Hours',       'समय')}           value={myBusiness.hours || '—'} />
              <InfoRow icon={<FiInfo />}     label={t('Status',      'स्थिति')}         value={availabilityMeta.openLabel} />
              <InfoRow icon={<FiTruck />}    label={t('Delivery',    'डेलिभरी')}       value={availabilityMeta.deliveryLabel} />
              <InfoRow icon={<FiMail />}     label={t('Email',       'इमेल')}          value={myBusiness.contactEmail || '—'} />
              <InfoRow icon={<FiPhone />}    label={t('Phone',       'फोन')}           value={myBusiness.phone || '—'} />
              <InfoRow icon={<FiStar />}     label={t('Rating',      'मूल्याङ्कन')}    value={`${myBusiness.rating} ⭐ (${myBusiness.reviewCount} reviews)`} />
              <InfoRow icon={<FiInfo />}     label={t('Description', 'विवरण')}         value={myBusiness.description} multiline />
              {myBusiness.qrUrl && (
                <div className="pt-3">
                  <p className="text-[11px] font-semibold text-slate-400 mb-2">{t('Payment QR Code', 'भुक्तानी QR कोड')}</p>
                  <img src={myBusiness.qrUrl} alt="Business payment QR" className="h-40 w-40 rounded-2xl border border-slate-700 object-contain" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      </main>
    </div>
  );
}

/* ── Small helper components ── */
function InfoRow({ icon, label, value, multiline }) {
  return (
    <div className={`flex ${multiline ? 'flex-col gap-1' : 'items-start gap-3'} py-2 border-b border-slate-800/60 last:border-0`}>
      <div className="flex items-center gap-2 min-w-[120px]">
        <span className="text-slate-500 shrink-0">{icon}</span>
        <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      </div>
      <span className={`text-sm text-slate-200 ${multiline ? 'leading-relaxed text-xs text-slate-300' : ''}`}>{value}</span>
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center">
      <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/60 text-slate-500">{icon}</div>
      <p className="text-xs text-slate-500">{msg}</p>
    </div>
  );
}
