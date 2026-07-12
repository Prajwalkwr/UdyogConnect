import React, { useState, useEffect } from 'react';
import { FiShoppingBag, FiCalendar, FiTrendingUp, FiPlus, FiTrash2, FiFileText, FiEdit3, FiCheckCircle, FiUsers, FiStar, FiTag, FiBell, FiSettings, FiBox, FiDatabase, FiCreditCard } from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';
import { buildMultipartFormData, appendOptionalFile } from '../utils/mediaUpload';
import { buildSellerProfilePayload, getSellerDashboardSections, getSellerWorkflowSteps } from '../utils/sellerWorkflow';

export default function SellerDashboard({ user, lang, currency }) {
  const [myBusiness, setMyBusiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubMenu, setActiveSubMenu] = useState('overview');

  // Business registration form
  const [bizName, setBizName] = useState('');
  const [bizDesc, setBizDesc] = useState('');
  const [bizLoc, setBizLoc] = useState('');
  const [bizCat, setBizCat] = useState('Grocery');
  const [bizHours, setBizHours] = useState('09:00 - 18:00');
  const [bizEmail, setBizEmail] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizLogo, setBizLogo] = useState(null);
  const [bizCover, setBizCover] = useState(null);
  const [bizDoc, setBizDoc] = useState(null);

  // Catalog items lists
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);

  // Add Product Form
  const [showAddProd, setShowAddProd] = useState(false);
  const [pName, setPName] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pDiscount, setPDiscount] = useState('0');
  const [pStock, setPStock] = useState('10');
  const [pDesc, setPDesc] = useState('');
  const [pImg, setPImg] = useState(null);

  // Add Service Form
  const [showAddServ, setShowAddServ] = useState(false);
  const [sName, setSName] = useState('');
  const [sPrice, setSPrice] = useState('');
  const [sDuration, setSDuration] = useState('60');
  const [sDesc, setSDesc] = useState('');
  const [sHome, setSHome] = useState(false);

  // Orders and Bookings list
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]);

  const [profileForm, setProfileForm] = useState({
    name: '',
    location: '',
    category: 'Grocery',
    hours: '09:00 - 18:00',
    phone: '',
    contactEmail: '',
    description: '',
  });

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  const sellerSections = getSellerDashboardSections(lang);
  const workflowSteps = getSellerWorkflowSteps(lang);

  useEffect(() => {
    if (user) {
      fetchSellerData();
    }
  }, [user]);

  const fetchSellerData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Fetch all businesses and filter ours
      const bizRes = await axios.get('/api/businesses');
      const mine = bizRes.data.find((b) => b.ownerId === user._id);
      
      if (mine) {
        setMyBusiness(mine);
        setProfileForm({
          name: mine.name || '',
          location: mine.location || '',
          category: mine.category || 'Grocery',
          hours: mine.hours || '09:00 - 18:00',
          phone: mine.phone || '',
          contactEmail: mine.contactEmail || '',
          description: mine.description || '',
        });
        // Load details (products, services)
        const detailRes = await axios.get(`/api/businesses/${mine._id}`);
        setProducts(detailRes.data.products);
        setServices(detailRes.data.services);

        // Load orders
        const orderRes = await axios.get('/api/orders', { headers: { Authorization: `Bearer ${token}` } });
        setOrders(orderRes.data);

        // Load bookings
        const bookingRes = await axios.get('/api/bookings', { headers: { Authorization: `Bearer ${token}` } });
        setBookings(bookingRes.data);
      }
      setLoading(false);
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  const handleRegisterBusiness = async (e) => {
    e.preventDefault();
    if (!bizName || !bizDesc || !bizLoc) return;

    try {
      const token = localStorage.getItem('token');
      const formData = buildMultipartFormData({
        name: bizName,
        description: bizDesc,
        location: bizLoc,
        category: bizCat,
        hours: bizHours,
        contactEmail: bizEmail,
        phone: bizPhone,
      });
      appendOptionalFile(formData, 'logo', bizLogo);
      appendOptionalFile(formData, 'cover', bizCover);
      appendOptionalFile(formData, 'document', bizDoc);

      await axios.post('/api/businesses', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({
        icon: 'success',
        title: translate('Registration Submitted', 'दर्ता विवरण पेश भयो'),
        text: translate('Your business listing is pending admin safety verification.', 'प्रशासकले प्रमाणित गरेपछि यो प्रकाशित हुनेछ।'),
      });
      setBizLogo(null);
      setBizCover(null);
      setBizDoc(null);
      fetchSellerData();
    } catch (err) {
      Swal.fire({ icon: 'error', text: 'Registration failed.' });
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('businessId', myBusiness._id);
      formData.append('name', pName);
      formData.append('brand', pBrand || myBusiness.name);
      formData.append('price', pPrice);
      formData.append('discount', pDiscount);
      formData.append('stock', pStock);
      formData.append('description', pDesc);
      formData.append('category', myBusiness.category);
      if (pImg) {
        formData.append('image', pImg);
      }

      await axios.post('/api/products', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      Swal.fire({ icon: 'success', title: 'Product Added to Catalog' });
      setPName('');
      setPBrand('');
      setPPrice('');
      setPDiscount('0');
      setPStock('10');
      setPDesc('');
      setPImg(null);
      setShowAddProd(false);
      fetchSellerData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Product upload failed.' });
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/services',
        {
          businessId: myBusiness._id,
          name: sName,
          price: sPrice,
          duration: sDuration,
          description: sDesc,
          homeService: sHome,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire({ icon: 'success', title: 'Service Added to Catalog' });
      setSName('');
      setSPrice('');
      setSDuration('60');
      setSDesc('');
      setSHome(false);
      setShowAddServ(false);
      fetchSellerData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Service creation failed.' });
    }
  };

  const handleRemoveProduct = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire('Deleted', 'Catalog item removed.', 'success');
      fetchSellerData();
    } catch (e) {
      Swal.fire('Error', 'Deletion failed.', 'error');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const payload = buildSellerProfilePayload(profileForm);
      await axios.put(`/api/businesses/${myBusiness._id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire({ icon: 'success', title: translate('Profile Updated', 'प्रोफाइल अद्यावधिक भयो') });
      fetchSellerData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Profile update failed.' });
    }
  };

  const handleUpdateStock = async (productId, delta) => {
    try {
      const product = products.find((item) => item._id === productId);
      if (!product) return;
      const nextStock = Math.max(0, Number(product.stock || 0) + delta);
      const token = localStorage.getItem('token');
      await axios.put(`/api/products/${productId}`, { stock: nextStock }, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire({ icon: 'success', title: translate('Stock Updated', 'स्टक अद्यावधिक भयो') });
      fetchSellerData();
    } catch (e) {
      Swal.fire({ icon: 'error', text: 'Stock update failed.' });
    }
  };

  const handleOrderStatusUpdate = async (orderId, newStatus, trackingNote) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `/api/orders/${orderId}/status`,
        { status: newStatus, note: trackingNote },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire('Updated', `Order advanced to ${newStatus}.`, 'success');
      fetchSellerData();
    } catch (e) {
      Swal.fire('Error', 'Update status action failed.', 'error');
    }
  };

  const handleBookingStatusUpdate = async (bookingId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/bookings/${bookingId}`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
      Swal.fire('Updated', `Booking is now ${newStatus}.`, 'success');
      fetchSellerData();
    } catch (e) {
      Swal.fire('Error', 'Update booking status failed.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400 mx-auto"></div>
        <p className="mt-3 text-sm">{translate('Accessing business portal...', 'ड्यासबोर्ड खोल्दैछ...')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 text-left">
      {!myBusiness ? (
        /* 1. Shop registration uploader */
        <div className="mx-auto max-w-2xl rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 sm:p-8 space-y-6 shadow-2xl">
          <div>
            <h3 className="text-xl font-extrabold text-white">{translate('Business Portal Onboarding', 'व्यवसाय पोर्टल दर्ता')}</h3>
            <p className="text-xs text-slate-400 mt-1">{translate('Provide legal proof, cover specifications, and description details to register.', 'आफ्नो पसल दर्ता गरी स्थानीय बजारमा सामेल हुनुहोस्।')}</p>
          </div>

          <form onSubmit={handleRegisterBusiness} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                placeholder={translate('Business Name', 'पसलको नाम')}
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
                required
              />
              <select
                value={bizCat}
                onChange={(e) => setBizCat(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300 outline-none"
              >
                <option value="Grocery">Grocery</option>
                <option value="Restaurants">Restaurants & Food</option>
                <option value="Furniture">Furniture</option>
                <option value="Gift Shop">Gift Shop / Crafts</option>
                <option value="Home Services">Home Services</option>
                <option value="Mechanics">Mechanics & Repair</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="text"
                placeholder={translate('Location (e.g. Pokhara)', 'स्थान (उदा: पोखरा)')}
                value={bizLoc}
                onChange={(e) => setBizLoc(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
                required
              />
              <input
                type="text"
                placeholder="Hours (e.g. 09:00 - 18:00)"
                value={bizHours}
                onChange={(e) => setBizHours(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <input
                type="email"
                placeholder="Contact Email"
                value={bizEmail}
                onChange={(e) => setBizEmail(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
              />
              <input
                type="tel"
                placeholder="Contact Phone"
                value={bizPhone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
              />
            </div>

            <textarea
              placeholder="Business Description (Tell customer what you offer...)"
              value={bizDesc}
              onChange={(e) => setBizDesc(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
              rows="4"
              required
            />

            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/20 p-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                  {translate('Business Logo', 'व्यवसाय लोगो')}
                </label>
                <input type="file" accept="image/*" onChange={(e) => setBizLogo(e.target.files[0])} className="text-xs text-slate-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                  {translate('Cover Image', 'कभर तस्विर')}
                </label>
                <input type="file" accept="image/*" onChange={(e) => setBizCover(e.target.files[0])} className="text-xs text-slate-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-450 mb-1">
                  {translate('Upload Business Certificate (PDF/Image Proof)', 'पसल प्रमाणपत्र (PDF वा तस्विर प्रमाणपत्र)')}
                </label>
                <input type="file" onChange={(e) => setBizDoc(e.target.files[0])} className="text-xs text-slate-400" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-xs font-bold text-slate-950"
            >
              Submit Onboarding Registration
            </button>
          </form>
        </div>
      ) : (
        /* 2. Seller dashboard workspace */
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar controls */}
          <aside className="w-full lg:w-64 space-y-2 flex-shrink-0">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 font-bold text-slate-950 text-xl">
                {myBusiness.name.charAt(0)}
              </div>
              <h4 className="mt-3 font-bold text-white text-sm">{myBusiness.name}</h4>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider mt-1.5 inline-block border ${
                myBusiness.verified === 'verified'
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-550/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-550/20'
              }`}>
                {myBusiness.verified === 'verified' ? '✓ Verified Shop' : 'Verification Pending'}
              </span>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/10 p-2 space-y-1">
              {sellerSections.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setActiveSubMenu(m.key)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                    activeSubMenu === m.key
                      ? 'bg-emerald-500/10 text-emerald-350 border border-emerald-500/20'
                      : 'text-slate-450 hover:bg-slate-900/60 hover:text-white'
                  }`}
                >
                  {m.key === 'overview' && <FiBox />}
                  {m.key === 'profile' && <FiEdit3 />}
                  {m.key === 'catalog' && <FiFileText />}
                  {m.key === 'orders' && <FiShoppingBag />}
                  {m.key === 'inventory' && <FiDatabase />}
                  {m.key === 'customers' && <FiUsers />}
                  {m.key === 'reviews' && <FiStar />}
                  {m.key === 'promotions' && <FiTag />}
                  {m.key === 'analytics' && <FiTrendingUp />}
                  {m.key === 'notifications' && <FiBell />}
                  {m.key === 'settings' && <FiSettings />}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* Details pane */}
          <main className="flex-1 space-y-6">
            {activeSubMenu === 'overview' && (
              <div className="space-y-6">
                <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6">
                  <h3 className="text-lg font-extrabold text-white">{translate('Business Owner Workflow', 'व्यवसाय मालिकको कार्यप्रवाह')}</h3>
                  <p className="mt-2 text-sm text-slate-400">{translate('You manage only your own business. The admin manages the wider marketplace.', 'तपाईंले आफ्नो व्यवसाय मात्र व्यवस्थापन गर्नुहुन्छ। प्रशासकले सम्पूर्ण बजार व्यवस्थापन गर्छ।')}</p>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {workflowSteps.map((step, index) => (
                      <div key={step.key} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">{index + 1}</div>
                        <h4 className="mt-2 text-sm font-bold text-white">{step.title}</h4>
                        <p className="mt-1 text-xs text-slate-400">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { title: translate('Total Products/Services', 'कुल उत्पादन/सेवाहरू'), value: `${products.length + services.length}`, icon: <FiBox className="text-amber-400" /> },
                    { title: translate('Pending Orders', 'पेन्डिङ अर्डरहरू'), value: orders.filter((o) => o.status === 'placed' || o.status === 'preparing').length, icon: <FiShoppingBag className="text-cyan-400" /> },
                    { title: translate('Completed Orders', 'पूर्ण भएका अर्डरहरू'), value: orders.filter((o) => o.status === 'completed').length, icon: <FiCheckCircle className="text-emerald-400" /> },
                  ].map((metric) => (
                    <div key={metric.title} className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5">
                      <div className="text-2xl">{metric.icon}</div>
                      <div className="mt-3 text-2xl font-black text-white">{metric.value}</div>
                      <div className="text-xs text-slate-400 mt-1">{metric.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSubMenu === 'profile' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Business Profile', 'व्यवसाय प्रोफाइल')}</h3>
                <p className="text-sm text-slate-400">{translate('Edit the details that customers see for your shop and keep your approval status current.', 'ग्राहकहरूले तपाईंको पसलको लागि देख्ने विवरण सम्पादन गर्नुहोस् र स्वीकृति स्थिति अद्यावधिक राख्नुहोस्।')}</p>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Business Name" required />
                    <input value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Location" required />
                    <input value={profileForm.category} onChange={(e) => setProfileForm({ ...profileForm, category: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Category" />
                    <input value={profileForm.hours} onChange={(e) => setProfileForm({ ...profileForm, hours: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Hours" />
                    <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Phone" />
                    <input type="email" value={profileForm.contactEmail} onChange={(e) => setProfileForm({ ...profileForm, contactEmail: e.target.value })} className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" placeholder="Contact Email" />
                  </div>
                  <textarea value={profileForm.description} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none" rows="4" placeholder="Business Description" />
                  <button type="submit" className="rounded-full bg-amber-400 px-5 py-2.5 text-xs font-bold text-slate-950">Save Profile</button>
                </form>
              </div>
            )}

            {/* A. Catalog manager */}
            {activeSubMenu === 'catalog' && (
              <div className="space-y-6">
                {/* Catalog action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowAddProd(true);
                      setShowAddServ(false);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-350"
                  >
                    <FiPlus />
                    <span>Add Product</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowAddServ(true);
                      setShowAddProd(false);
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-850 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                  >
                    <FiPlus />
                    <span>Add Booking Service</span>
                  </button>
                </div>

                {/* Add Product form overlay */}
                {showAddProd && (
                  <form onSubmit={handleAddProduct} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Add product listing</h4>
                      <button type="button" onClick={() => setShowAddProd(false)} className="text-rose-450 text-xs">Close</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        placeholder="Product Name"
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                        required
                      />
                      <input
                        type="text"
                        placeholder="Brand (Optional)"
                        value={pBrand}
                        onChange={(e) => setPBrand(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        type="number"
                        placeholder="Price (NPR)"
                        value={pPrice}
                        onChange={(e) => setPPrice(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Discount (%)"
                        value={pDiscount}
                        onChange={(e) => setPDiscount(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                      <input
                        type="number"
                        placeholder="Stock qty"
                        value={pStock}
                        onChange={(e) => setPStock(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <textarea
                      placeholder="Product specifications..."
                      value={pDesc}
                      onChange={(e) => setPDesc(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      rows="3"
                      required
                    />
                    <div className="flex justify-between items-center bg-slate-900/60 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Product image</span>
                      <input type="file" onChange={(e) => setPImg(e.target.files[0])} className="text-xs text-slate-400" />
                    </div>
                    <button type="submit" className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950">Upload to Catalog</button>
                  </form>
                )}

                {/* Add Service form overlay */}
                {showAddServ && (
                  <form onSubmit={handleAddService} className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450">Add service listing</h4>
                      <button type="button" onClick={() => setShowAddServ(false)} className="text-rose-450 text-xs">Close</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        type="text"
                        placeholder="Service Name"
                        value={sName}
                        onChange={(e) => setSName(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Price (NPR)"
                        value={sPrice}
                        onChange={(e) => setSPrice(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                        required
                      />
                      <input
                        type="number"
                        placeholder="Duration (Minutes)"
                        value={sDuration}
                        onChange={(e) => setSDuration(e.target.value)}
                        className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <textarea
                      placeholder="Service descriptions..."
                      value={sDesc}
                      onChange={(e) => setSDesc(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white"
                      rows="3"
                      required
                    />
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={sHome} onChange={(e) => setSHome(e.target.checked)} className="h-4 w-4 rounded accent-emerald-500" />
                      <span className="text-xs text-slate-350">Provide as Home Service</span>
                    </div>
                    <button type="submit" className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950">Add service</button>
                  </form>
                )}

                {/* Catalog lists */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Product list ({products.length})</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {products.map((p) => (
                      <div key={p._id} className="rounded-2xl border border-slate-850 bg-slate-900/30 p-3.5 flex justify-between items-start">
                        <div>
                          <h5 className="text-xs font-bold text-slate-200">{p.name}</h5>
                          <span className="text-[10px] text-slate-450 block mt-0.5">Stock: {p.stock} units</span>
                          <span className="text-[10px] text-slate-450 block">Price: NPR {p.price} (discount: {p.discount}%)</span>
                        </div>
                        <button onClick={() => handleRemoveProduct(p._id)} className="text-rose-400 p-1 hover:text-rose-300">
                          <FiTrash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <h4 className="text-sm font-bold text-white uppercase tracking-wider pt-4">Service list ({services.length})</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {services.map((s) => (
                      <div key={s._id} className="rounded-2xl border border-slate-850 bg-slate-900/30 p-3.5">
                        <h5 className="text-xs font-bold text-slate-200">{s.name}</h5>
                        <p className="text-[10px] text-slate-450 mt-1">Price: NPR {s.price} | Duration: {s.duration} min</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeSubMenu === 'inventory' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Inventory Management', 'इन्वेन्टरी व्यवस्थापन')}</h3>
                <div className="grid gap-3">
                  {products.map((p) => (
                    <div key={p._id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-white text-sm">{p.name}</div>
                        <div className="text-xs text-slate-400">{translate('Stock', 'स्टक')}: {p.stock} • {translate('Price', 'मूल्य')}: NPR {p.price}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleUpdateStock(p._id, -1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">-</button>
                        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${p.stock <= 5 ? 'bg-rose-500/10 text-rose-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                          {p.stock <= 5 ? translate('Low Stock', 'कम स्टक') : translate('Available', 'उपलब्ध')}
                        </span>
                        <button onClick={() => handleUpdateStock(p._id, 1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSubMenu === 'customers' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Customer Management', 'ग्राहक व्यवस्थापन')}</h3>
                <p className="text-sm text-slate-400">{translate('You can view customer purchase history and contact details only for your own business.', 'तपाईंले आफ्नो व्यवसायका लागि मात्र ग्राहकको खरिद इतिहास र सम्पर्क विवरण हेर्न सक्नुहुन्छ।')}</p>
                <div className="grid gap-3">
                  {orders.map((o) => (
                    <div key={o._id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="font-bold text-white text-sm">{o.deliveryAddress?.name || translate('Customer', 'ग्राहक')}</div>
                      <div className="text-xs text-slate-400 mt-1">{o.items?.map((i) => i.name).join(', ')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSubMenu === 'reviews' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Reviews & Ratings', 'समीक्षा र रेटिङ')}</h3>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                  {translate('You can view customer ratings, read reviews, and report inappropriate review content to the admin.', 'तपाईंले ग्राहक रेटिङ हेर्न, समीक्षा पढ्न र अनुचित सामग्री प्रशासकलाई रिपोर्ट गर्न सक्नुहुन्छ।')}
                </div>
              </div>
            )}

            {activeSubMenu === 'promotions' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Promotions & Discounts', 'प्रमोशन र छुट')}</h3>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                  {translate('Create discount offers, coupon codes, seasonal promotions, and feature products for your shop.', 'आफ्नो पसलका लागि छुट प्रस्ताव, कूपन कोड, मौसमिय प्रचार र featured उत्पादन सिर्जना गर्नुहोस्।')}
                </div>
              </div>
            )}

            {activeSubMenu === 'notifications' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Notifications', 'सूचनाहरू')}</h3>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                  {translate('Receive alerts for new orders, cancellations, low stock, reviews, and admin announcements.', 'नयाँ अर्डर, रद्द, कम स्टक, समीक्षा र प्रशासकीय सूचना सुचनाहरू प्राप्त गर्नुहोस्।')}
                </div>
              </div>
            )}

            {activeSubMenu === 'settings' && (
              <div className="rounded-[32px] border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Settings', 'सेटिङ')}</h3>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                  {translate('Manage your password, email, notifications, and logout preferences.', 'आफ्नो पासवर्ड, इमेल, सूचना र लगआउट प्राथमिकताहरू व्यवस्थापन गर्नुहोस्।')}
                </div>
              </div>
            )}

            {/* B. Incoming Orders Dispatch board */}
            {activeSubMenu === 'orders' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Order Board', 'नयाँ अर्डर बोर्ड')}</h3>

                {orders.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    No active orders placed.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((o) => (
                      <div key={o._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-white font-mono">{o._id}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">Customer: {o.deliveryAddress.name}</span>
                          </div>
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            o.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                            o.status === 'cancelled' ? 'bg-rose-500/10 text-rose-400' :
                            'bg-amber-500/10 text-amber-400'
                          }`}>
                            {o.status}
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 font-medium">
                          {o.items.map((i) => `${i.name} (x${i.quantity})`).join(', ')}
                        </div>

                        <div className="flex justify-between items-center border-t border-slate-850 pt-3">
                          <span className="text-xs font-bold text-amber-300">Total: NPR {o.total}</span>
                          
                          {/* Seller flow controls */}
                          <div className="flex gap-2">
                            {o.status === 'placed' && (
                              <>
                                <button
                                  onClick={() => handleOrderStatusUpdate(o._id, 'preparing', 'Seller accepted order.')}
                                  className="rounded-lg bg-emerald-500 px-3 py-1 text-[10px] font-bold text-slate-950"
                                >
                                  Accept & Prep
                                </button>
                                <button
                                  onClick={() => handleOrderStatusUpdate(o._id, 'cancelled', 'Seller rejected order.')}
                                  className="rounded-lg bg-rose-500 px-3 py-1 text-[10px] font-bold text-slate-950"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {o.status === 'preparing' && (
                              <button
                                onClick={() => handleOrderStatusUpdate(o._id, 'preparing', 'Order is ready, awaiting rider pickup.')}
                                className="rounded-lg bg-amber-400 px-3 py-1 text-[10px] font-bold text-slate-950"
                              >
                                Ready to Dispatch
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* C. Service bookings calendar slot approver */}
            {activeSubMenu === 'bookings' && (
              <div className="space-y-4">
                <h3 className="text-lg font-extrabold text-white">{translate('Service Bookings', 'बुकिङ तालिका')}</h3>

                {bookings.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    No service bookings received.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings.map((bk) => (
                      <div key={bk._id} className="rounded-3xl border border-slate-850 bg-slate-900/30 p-4 flex flex-col justify-between sm:flex-row sm:items-center">
                        <div>
                          <h4 className="font-bold text-slate-200 text-xs sm:text-sm">Service Booking Appointment</h4>
                          <p className="text-xs text-slate-400 mt-1">Date: {bk.date} | Slot: {bk.timeSlot}</p>
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider mt-2 ${
                            bk.status === 'confirmed' ? 'bg-cyan-500/10 text-cyan-300' :
                            bk.status === 'cancelled' ? 'bg-rose-500/10 text-rose-300' :
                            'bg-amber-500/10 text-amber-300'
                          }`}>
                            {bk.status}
                          </span>
                        </div>
                        {bk.status === 'pending' && (
                          <div className="mt-4 sm:mt-0 flex gap-2">
                            <button
                              onClick={() => handleBookingStatusUpdate(bk._id, 'confirmed')}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[10px] font-bold text-slate-950"
                            >
                              Approve / Confirm
                            </button>
                            <button
                              onClick={() => handleBookingStatusUpdate(bk._id, 'cancelled')}
                              className="rounded-lg bg-rose-500 px-3 py-1.5 text-[10px] font-bold text-slate-950"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* D. Seller reports & Analytics */}
            {activeSubMenu === 'analytics' && (
              <div className="space-y-6">
                <h3 className="text-lg font-extrabold text-white">{translate('Business Report Metrics', 'व्यवसाय रिपोर्ट र तथ्याङ्क')}</h3>

                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { title: 'Total Catalog', value: `${products.length + services.length} items`, icon: <FiFileText className="text-amber-400" /> },
                    { title: 'Completed Orders', value: orders.filter((o) => o.status === 'completed').length, icon: <FiCheckCircle className="text-emerald-400" /> },
                    { title: 'Sales Volume', value: `NPR ${orders.filter((o) => o.status === 'completed' || o.paymentStatus === 'paid').reduce((acc, o) => acc + o.total, 0)}`, icon: <FiTrendingUp className="text-cyan-400" /> },
                  ].map((metric) => (
                    <div key={metric.title} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                      <div className="text-2xl">{metric.icon}</div>
                      <div className="mt-3 text-2xl font-black text-white">{metric.value}</div>
                      <div className="text-xs text-slate-400 mt-1">{metric.title}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Loyalty Program Stats</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Small business customer retention is active. All items generate loyalty codes (+10 points) which users can redeem on subsequent orders.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
