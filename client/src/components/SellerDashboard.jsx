import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FiShoppingBag, FiCalendar, FiTrendingUp, FiPlus, FiTrash2,
  FiFileText, FiEdit3, FiCheckCircle, FiClock, FiStar,
  FiRefreshCw, FiXCircle, FiBell, FiTag, FiSettings,
  FiPackage, FiDollarSign, FiAlertCircle, FiUpload, FiSave,
  FiX, FiEye, FiMap, FiPhone, FiMail, FiInfo, FiTruck
} from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';
import { uploadFilesToCloudinary } from '../utils/mediaUpload';
import { getBusinessAvailabilityMeta } from '../utils/businessAvailability';

/* ─── small helpers ─────────────────────────────────────────────── */
const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

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
export default function SellerDashboard({ user, lang }) {
  const t = (en, ne) => lang === 'en' ? en : ne;

  const [myBusiness, setMyBusiness]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState('overview');
  const [pollingMsg, setPollingMsg]   = useState('');

  // Catalog state
  const [products,  setProducts]  = useState([]);
  const [services,  setServices]  = useState([]);
  const [orders,    setOrders]    = useState([]);
  const [bookings,  setBookings]  = useState([]);
  const [reviews,   setReviews]   = useState([]);

  // Onboarding form
  const [bizForm, setBizForm] = useState({
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
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);
  const logoInputRef = useRef(null);

  // Review replies
  const [replyText, setReplyText] = useState({});

  /* ── Fetch all seller data ── */
  const fetchAll = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const bizRes = await api.get('/api/businesses');
      // Match by user._id or user.id (handle both formats)
      const userId = user._id || user.id;
      const mine = bizRes.data.find((b) => b.ownerId === userId);

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

  /* ── Poll every 15 s for status change after pending submission ── */
  useEffect(() => {
    if (!myBusiness || myBusiness.verified !== 'pending') return;

    setPollingMsg('Checking approval status…');
    const interval = setInterval(async () => {
      try {
        const res = await api.get('/api/businesses');
        const userId = user?._id || user?.id;
        const mine = res.data.find((b) => b.ownerId === userId);
        if (mine && mine.verified !== myBusiness.verified) {
          setMyBusiness(mine);
          setPollingMsg('');
          if (mine.verified === 'verified' || mine.verified === 'approved') {
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
  }, [myBusiness?.verified, user]);

  /* ────────────────────────────────── HANDLERS ────────────────── */

  const handleRegisterBusiness = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!bizForm.name || !bizForm.description || !bizForm.location) {
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

      await api.post('/api/businesses', fd, { headers: { ...createIdempotencyHeader('business-register') } });
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
        fd.append('logo', selectedFile);
      }
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-950/80 p-8 shadow-2xl">
          <div className="mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20 mb-4">
              <FiPackage className="h-5 w-5 text-amber-400" />
            </div>
            <h2 className="text-2xl font-black text-white">{t('Register Your Business', 'व्यवसाय दर्ता गर्नुहोस्')}</h2>
            <p className="text-sm text-slate-400 mt-1">{t('Fill in your details and submit for admin approval. You\'ll be notified once approved.', 'विवरण भर्नुहोस् र अनुमोदनको लागि पेश गर्नुहोस्।')}</p>
          </div>

          <form onSubmit={handleRegisterBusiness} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField label={t('Business Name *', 'पसलको नाम *')} placeholder="e.g. Himalayan Crafts" value={bizForm.name} onChange={e => setBizForm({...bizForm, name: e.target.value})} required />
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">{t('Category *', 'वर्ग *')}</label>
                <select value={bizForm.category} onChange={e => setBizForm({...bizForm, category: e.target.value})} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400">
                  {['Grocery','Restaurants & Food','Furniture','Gift Shop / Crafts','Home Services','Mechanics & Repair','Electronics','Clothing & Fashion','Health & Beauty','Education'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField label="Contact Email" type="email" placeholder="business@email.com" value={bizForm.contactEmail} onChange={e => setBizForm({...bizForm, contactEmail: e.target.value})} />
              <InputField label="Phone Number" type="tel" placeholder="+977-98XXXXXXXX" value={bizForm.phone} onChange={e => setBizForm({...bizForm, phone: e.target.value})} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField label="Registration Number" placeholder="REG-XXXXXXXX" value={bizForm.registrationNumber} onChange={e => setBizForm({...bizForm, registrationNumber: e.target.value})} />
              <InputField label="PAN / VAT Number" placeholder="PAN-XXXXXXXXX" value={bizForm.panVatNumber} onChange={e => setBizForm({...bizForm, panVatNumber: e.target.value})} />
            </div>

            <TextAreaField label={t('Business Description *', 'व्यवसायको विवरण *')} placeholder="Tell customers what you offer, your specialties, years of experience…" value={bizForm.description} onChange={e => setBizForm({...bizForm, description: e.target.value})} rows={4} required />

            <div className="grid gap-4 rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4 md:grid-cols-2">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">QR Code URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={bizForm.qrUrl}
                  onChange={e => setBizForm({ ...bizForm, qrUrl: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20"
                />
              </div>
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2"><FiUpload className="inline mr-1.5" />Upload QR Code</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setBizQr(e.target.files[0])}
                  className="w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-400/10 file:px-3 file:py-1.5 file:text-amber-300 file:font-semibold file:text-xs hover:file:bg-amber-400/20"
                />
                {bizQr && <p className="mt-1.5 text-[11px] text-emerald-400">✓ {bizQr.name}</p>}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all hover:-translate-y-0.5 active:scale-98 disabled:opacity-60">
              {isSubmitting ? t('Processing...', 'प्रोसेस हुँदै...') : t('Submit Business Registration', 'व्यवसाय दर्ता पेश गर्नुहोस्')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     2. BUSINESS PENDING → Waiting Room
  ══════════════════════════════════════════════════════════════ */
  if (myBusiness.verified === 'pending') {
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
  if (myBusiness.verified === 'rejected' || myBusiness.verified === 'suspended') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-10">
          <FiXCircle className="mx-auto h-14 w-14 text-rose-400 mb-4" />
          <h2 className="text-xl font-black text-white mb-2">
            {myBusiness.verified === 'suspended' ? 'Business Suspended' : 'Registration Not Approved'}
          </h2>
          <p className="text-sm text-slate-400">
            {t('Your business registration was not approved. Please contact support or resubmit with correct documents.',
               'तपाईंको व्यवसाय दर्ता अनुमोदन भएन। कृपया समर्थनमा सम्पर्क गर्नुहोस् वा सहि कागजातसहित पुनः पेश गर्नुहोस्।')}
          </p>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     4. FULL DASHBOARD (approved / verified)
  ══════════════════════════════════════════════════════════════ */
  const tabs = [
    { key: 'overview',   label: t('Overview',   'सिंहावलोकन'),   icon: <FiTrendingUp /> },
    { key: 'orders',     label: t('Orders',      'अर्डर'),          icon: <FiShoppingBag /> },
    { key: 'bookings',   label: t('Bookings',    'बुकिङ'),          icon: <FiCalendar /> },
    { key: 'catalog',    label: t('Catalog',     'क्याटलग'),        icon: <FiFileText /> },
    { key: 'reviews',    label: t('Reviews',     'समीक्षाहरू'),     icon: <FiStar /> },
    { key: 'promos',     label: t('Promotions',  'प्रोमो'),         icon: <FiTag /> },
    { key: 'profile',    label: t('Profile',     'प्रोफाइल'),       icon: <FiSettings /> },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">

      {/* ── Top Header Bar ── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-xl font-black text-white">
            {myBusiness.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-black text-white">{myBusiness.name}</h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                <FiCheckCircle className="h-3 w-3" /> {t('Approved Business', 'अनुमोदित व्यवसाय')}
              </span>
              <span className="text-[10px] text-slate-500">{myBusiness.category} · {myBusiness.location}</span>
            </div>
          </div>
        </div>
        <button onClick={() => fetchAll(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-400 transition">
          <FiRefreshCw className="h-3 w-3" /> {t('Refresh', 'रिफ्रेस')}
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-6 flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'orders'   && pendingOrders.length > 0 && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">{pendingOrders.length}</span>}
            {tab.key === 'bookings' && bookings.filter(b => b.status === 'pending').length > 0 && <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black text-white">{bookings.filter(b => b.status === 'pending').length}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════ OVERVIEW ══════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<FiDollarSign />} label="Total Revenue"      value={fmt(totalRevenue)}             color="emerald" />
            <StatCard icon={<FiShoppingBag />} label="Completed Orders"  value={completedOrders.length}        color="blue"    />
            <StatCard icon={<FiPackage />}     label="Products & Services" value={products.length + services.length} color="amber" />
            <StatCard icon={<FiStar />}        label="Average Rating"    value={`${avgRating} ⭐`}             color="purple"  />
          </div>

          {/* Recent Orders Summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-5">
            <SectionHeader title={t('Recent Orders', 'भर्खरका अर्डरहरू')}>
              <button onClick={() => setActiveTab('orders')} className="text-xs text-amber-400 hover:underline">{t('View all', 'सबै हेर्नुहोस्')}</button>
            </SectionHeader>
            {orders.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">{t('No orders yet.', 'अझैसम्म कुनै अर्डर छैन।')}</p>
            ) : (
              <div className="space-y-2">
                {orders.slice(0, 5).map(o => (
                  <div key={o._id} className="flex items-center justify-between rounded-xl bg-slate-950/40 px-4 py-2.5">
                    <div>
                      <span className="text-xs font-mono text-slate-300">{String(o._id).slice(-8).toUpperCase()}</span>
                      <span className="text-[10px] text-slate-500 ml-2">{o.items?.map(i => i.name).join(', ').slice(0, 30)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-300">{fmt(o.total)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusColor(o.status)}`}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Stats Row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-center">
              <div className="text-2xl font-black text-white">{pendingOrders.length}</div>
              <div className="text-xs text-slate-400 mt-1">{t('Pending Orders', 'बाँकी अर्डर')}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-center">
              <div className="text-2xl font-black text-white">{bookings.filter(b => b.status === 'pending').length}</div>
              <div className="text-xs text-slate-400 mt-1">{t('Pending Bookings', 'बाँकी बुकिङ')}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-center">
              <div className="text-2xl font-black text-white">{reviews.length}</div>
              <div className="text-xs text-slate-400 mt-1">{t('Customer Reviews', 'ग्राहक समीक्षाहरू')}</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ ORDERS ══════════════ */}
      {activeTab === 'orders' && (
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
      {activeTab === 'bookings' && (
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
      {activeTab === 'catalog' && (
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
          {showAddProd && (
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
          {showAddServ && (
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
          <div>
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
          </div>

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
      {activeTab === 'reviews' && (
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
      {activeTab === 'promos' && (
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
      {activeTab === 'profile' && (
        <div className="space-y-5">
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
