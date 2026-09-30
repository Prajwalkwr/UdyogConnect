import React, { useState, useEffect, useRef } from 'react';
import { FiShoppingBag, FiTrash2, FiMapPin, FiTruck, FiCheckCircle, FiTag, FiArrowLeft, FiMail } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { resolveCheckoutBusinessId } from '../utils/checkout';
import { createSubmissionGuard, createIdempotencyKey } from '../utils/submitProtection';
import { validateCheckoutForm, sanitizeCheckoutWords, sanitizeCheckoutEmail, isCheckoutGmail } from '../utils/validation';
import { NEPAL_PLACES } from '../utils/nepalPlaces';
import { notifyOrdersUpdated } from '../utils/bill';
import { redirectToEsewa } from '../utils/esewa';
import { checkoutLocationOf } from '../utils/deliveryAddress';
import OrderSuccess from './bill/OrderSuccess';

export default function CartCheckout({
  cart,
  user,
  lang,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onClose,
  onOrderSuccess,
  embedded = false,
}) {
  const [promoCode, setPromoCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Form State
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' | 'pickup'
  const [paymentMethod, setPaymentMethod] = useState('COD'); // 'COD' | 'QR' | 'Card' | 'eSewa'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // QR Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutBusinessName, setCheckoutBusinessName] = useState('');
  const [checkoutBusinessQrUrl, setCheckoutBusinessQrUrl] = useState('');
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [esewaEnabled, setEsewaEnabled] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);
  // One key per checkout attempt: retries of the same cart reuse it so the server never creates a second order.
  const checkoutKeyRef = useRef(null);
  const cartSignature = cart.map((item) => `${item.id}:${item.quantity}`).join('|');

  useEffect(() => {
    checkoutKeyRef.current = null;
  }, [cartSignature, paymentMethod, deliveryMethod]);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/payment/config')
      .then((response) => { if (!cancelled) setStripeEnabled(Boolean(response.data?.stripeEnabled)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      const list = Array.isArray(user.addresses) ? user.addresses : [];
      const saved = list.find((entry) => entry?.city) || list[0] || null;
      setName(sanitizeCheckoutWords(saved?.fullName || user.name).trim());
      setEmail(isCheckoutGmail(user.email) ? String(user.email).trim().toLowerCase() : '');
      setPhone(String(saved?.phone || user.phone || '').replace(/\D/g, '').slice(0, 10));
      if (saved) {
        setLocation(checkoutLocationOf(saved));
        setAddress(sanitizeCheckoutWords(saved.address).trim());
      }
    }
  }, [user]);

  useEffect(() => {
    const businessId = resolveCheckoutBusinessId(cart);
    if (!businessId) {
      setCheckoutBusinessName('');
      setCheckoutBusinessQrUrl('');
      setEsewaEnabled(false);
      return;
    }

    let cancelled = false;
    const loadBusiness = async () => {
      try {
        const response = await api.get(`/api/businesses/${businessId}`);
        if (cancelled) return;
        setCheckoutBusinessName(response.data.business?.name || '');
        setCheckoutBusinessQrUrl(response.data.business?.qrUrl || '');
        setEsewaEnabled(Boolean(response.data.business?.esewaEnabled));
      } catch (err) {
        if (!cancelled) {
          setCheckoutBusinessName('');
          setCheckoutBusinessQrUrl('');
          setEsewaEnabled(false);
        }
      }
    };
    loadBusiness();
    return () => { cancelled = true; };
  }, [cart]);

  useEffect(() => {
    if (paymentMethod === 'eSewa' && !esewaEnabled) setPaymentMethod('COD');
  }, [esewaEnabled, paymentMethod]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleApplyCoupon = async () => {
    if (!promoCode) return;
    try {
      const response = await api.get('/api/admin/coupons');
      const match = response.data.find(
        (c) => c.code === promoCode.toUpperCase() && c.active
      );

      if (match) {
        setCouponData(match);
        setDiscountPercent(match.discountPercent);
        Swal.fire({
          icon: 'success',
          title: translate('Promo Code Applied!', 'कुपन लागु भयो!'),
          text: `${match.discountPercent}% off has been applied.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({ icon: 'error', text: translate('Invalid or expired coupon.', 'अमान्य वा म्याद समाप्त कुपन।') });
        setCouponData(null);
        setDiscountPercent(0);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const deliveryFee = deliveryMethod === 'delivery' ? 70 : 0;
  let rawDiscount = (subtotal * discountPercent) / 100;
  if (couponData && rawDiscount > couponData.maxDiscount) {
    rawDiscount = couponData.maxDiscount;
  }

  const tax = parseFloat(((subtotal + deliveryFee - rawDiscount) * 0.13).toFixed(2));
  const total = parseFloat((subtotal + deliveryFee + tax - rawDiscount).toFixed(2));

  const displayPrice = (val) => {
    return `Rs. ${val}`;
  };

  const handlePlaceOrder = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) return;
    setFieldErrors({});

    const validation = validateCheckoutForm({
      fullName: name,
      email,
      phone,
      address,
      city: location,
    });
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    if (!submitGuard.begin()) return;

    if (paymentMethod === 'QR' && !showQrModal) {
      setShowQrModal(true);
      submitGuard.finish();
      return;
    }

    setPlacingOrder(true);
    let redirecting = false;
    try {
      const businessId = resolveCheckoutBusinessId(cart);
      if (!checkoutKeyRef.current) checkoutKeyRef.current = createIdempotencyKey('checkout');
      // Only ids and quantities matter: the server prices every item from the database.
      const checkoutPayload = {
        businessId,
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          quantity: item.quantity,
          businessId: item.businessId || item.business?.id || businessId || item.sellerId || item.vendorId || '',
        })),
        promoCode: couponData ? couponData.code : undefined,
        paymentMethod,
        deliveryAddress: {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone,
          location: location.trim(),
          address: address.trim(),
          method: deliveryMethod,
        },
      };
      const checkoutHeaders = { headers: { 'Idempotency-Key': checkoutKeyRef.current } };

      // eSewa: the backend signs the request with this business's own merchant account.
      // The order is only created after the backend verifies the payment with eSewa.
      if (paymentMethod === 'eSewa') {
        const esewaResponse = await api.post('/api/checkout/esewa', checkoutPayload, checkoutHeaders);
        if (esewaResponse.data.simulator) {
          const choice = await Swal.fire({
            icon: 'info',
            title: translate('eSewa test mode', 'eSewa परीक्षण मोड'),
            text: translate(
              "If eSewa's sandbox login shows \"Service is currently unavailable\", use the local test payment instead.",
              'eSewa sandbox लगइन नचलेमा स्थानीय परीक्षण भुक्तानी प्रयोग गर्नुहोस्।'
            ),
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: translate('Open eSewa test site', 'eSewa परीक्षण साइट'),
            denyButtonText: translate('Use local test payment', 'स्थानीय परीक्षण भुक्तानी'),
            confirmButtonColor: '#60bb46',
            denyButtonColor: '#1a1a2e',
          });
          if (choice.isDenied) {
            redirecting = true;
            window.location.assign(`/payment/esewa/simulator?tx=${encodeURIComponent(esewaResponse.data.transactionUuid)}`);
            return;
          }
          if (!choice.isConfirmed) return;
        }
        redirecting = true;
        redirectToEsewa(esewaResponse.data);
        return;
      }

      const response = await api.post('/api/checkout', checkoutPayload, checkoutHeaders);

      const { order: placedOrder, bill, requiresPayment } = response.data;

      if (requiresPayment) {
        const session = await api.post('/api/payment/create-session', { orderId: placedOrder._id });
        redirecting = true;
        window.location.assign(session.data.url);
        return;
      }

      checkoutKeyRef.current = null;
      setShowQrModal(false);
      setConfirmation({ order: placedOrder, bill });
      onClearCart();
      notifyOrdersUpdated();
    } catch (err) {
      const serverFieldErrors = err.response?.data?.errors;
      if (serverFieldErrors && typeof serverFieldErrors === 'object') setFieldErrors(serverFieldErrors);
      Swal.fire({ icon: 'error', text: err.response?.data?.message || err.message || 'Order checkout failed.' });
    } finally {
      if (!redirecting) {
        setPlacingOrder(false);
        submitGuard.finish();
      }
    }
  };

  const processingLabel = paymentMethod === 'eSewa'
    ? translate('Redirecting to eSewa...', 'eSewa मा लैजाँदै...')
    : paymentMethod === 'Card'
      ? translate('Processing Payment...', 'भुक्तानी प्रक्रिया हुँदैछ...')
      : translate('Processing Order...', 'अर्डर प्रक्रिया हुँदैछ...');
  const paymentOptions = [
    { value: 'COD', label: 'Cash / COD' },
    ...(esewaEnabled ? [{ value: 'eSewa', label: 'eSewa' }] : []),
    { value: 'QR', label: 'QR Scan' },
    ...(stripeEnabled ? [{ value: 'Card', label: 'Card' }] : []),
  ];

  if (confirmation) {
    return (
      <div className={embedded ? '' : 'mx-auto min-h-full max-w-[1400px] px-4 py-8 sm:px-6'}>
        <OrderSuccess
          order={confirmation.order}
          bill={confirmation.bill}
          user={user}
          onContinue={() => {
            setConfirmation(null);
            onOrderSuccess?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-full bg-[#f8f2ea]'}>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#102341]">{translate('My Cart', 'मेरो कार्ट')}</h2>
            <p className="mt-0.5 text-xs text-[#68778c]">{translate('Review items and finalize checkout options', 'विवरण समीक्षा गरी अर्डर पूरा गर्नुहोस्')}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full border border-[#E5EBF2] bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#f2b71d] hover:text-[#1a1a2e]"
            >
              <FiShoppingBag className="h-4 w-4" />
              {translate('Continue shopping', 'किनमेल जारी राख्नुहोस्')}
            </button>
          )}
        </div>
      ) : (
      <header className={`${onClose ? 'sticky top-0 z-10' : ''} border-b border-[#eadfca] bg-[#f8f2ea]/95 backdrop-blur`}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-4 sm:px-6">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full border border-[#e8dfd0] bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#f2b71d] hover:text-[#1a1a2e]"
              aria-label="Close checkout"
            >
              <FiArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{translate('Continue shopping', 'किनमेल जारी राख्नुहोस्')}</span>
            </button>
          )}
          <div>
            <h2 className="text-xl font-black text-[#1a1a2e] sm:text-3xl">{translate('Shopping Cart', 'किनमेल झोला')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{translate('Review items and finalize checkout options', 'विवरण समीक्षा गरी अर्डर पूरा गर्नुहोस्')}</p>
          </div>
        </div>
      </header>
      )}

      <div className={embedded ? '' : 'mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8'}>
        {cart.length === 0 ? (
          <div className={`rounded-[28px] border py-20 text-center ${embedded ? 'border-[#E5EBF2] bg-white shadow-sm' : 'border-[#e7dcc7] bg-[#fffdf9]'}`}>
            <FiShoppingBag className="mx-auto h-12 w-12 text-slate-500" />
            <p className="mt-4 text-sm text-slate-500">{translate('Your cart is currently empty.', 'तपाईंको कार्ट हाल खाली छ।')}</p>
            {embedded && onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-[#F2B71D] px-5 py-2.5 text-sm font-bold text-[#102341] transition hover:bg-[#e0a615]"
              >
                {translate('Explore Businesses →', 'व्यवसायहरू हेर्नुहोस् →')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={`grid lg:grid-cols-[1.2fr_0.8fr] ${embedded ? 'gap-5' : 'gap-8'}`}>
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{translate('Cart items', 'अर्डर सूची')}</h3>
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 rounded-[24px] border border-[#e8dfd0] bg-white p-4 shadow-sm"
                >
                  <div>
                    <h4 className="text-sm font-bold text-[#1a1a2e]">{item.name}</h4>
                    <p className="mt-0.5 text-[10px] text-slate-500">{item.seller}</p>
                  </div>
                  <div className="flex items-center gap-3.5">
                    <div className="flex flex-col items-end gap-1">
                      {item.stock !== undefined && (
                        <span className="text-[10px] text-slate-500">Stock: {item.stock}</span>
                      )}
                      <div className="flex items-center rounded-xl border border-[#e8dfd0] bg-[#fffaf0] p-1">
                        <button
                          onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                          className="px-2 text-slate-500 hover:text-slate-800"
                        >
                          -
                        </button>
                        <span className="px-2 text-xs font-bold text-[#1a1a2e]">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                          disabled={item.quantity >= Math.min(20, item.stock || 20)}
                          className={`px-2 ${item.quantity >= Math.min(20, item.stock || 20) ? 'cursor-not-allowed text-slate-400' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <span className="text-xs font-black text-[#d49a00] sm:text-sm">
                      {displayPrice(item.price * item.quantity)}
                    </span>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1 text-slate-500 hover:text-rose-500"
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="rounded-[24px] border border-[#e8dfd0] bg-white p-4 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{translate('Discount Code', 'कुपन कोड')}</span>
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <FiTag className="absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. NEPAL50"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] py-2.5 pl-9 pr-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    />
                  </div>
                  <button
                    onClick={handleApplyCoupon}
                    className="rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 text-xs font-semibold text-[#1a1a2e] hover:bg-[#fef1c7]"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#e8dfd0] bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{translate('Delivery Details', 'डेलिभरी ठेगाना')}</h3>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      placeholder={translate('Full Name *', 'पूरा नाम *')}
                      value={name}
                      onChange={(e) => {
                        setName(sanitizeCheckoutWords(e.target.value));
                        setFieldErrors((prev) => ({ ...prev, name: '' }));
                      }}
                      className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    />
                    {fieldErrors.name && <span className="text-rose-500 text-[11px] mt-1 block">❌ {fieldErrors.name}</span>}
                  </div>
                  <div>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="Email *"
                      value={email}
                      onChange={(e) => { setEmail(sanitizeCheckoutEmail(e.target.value)); setFieldErrors(prev => ({ ...prev, email: '' })); }}
                      className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    />
                    {fieldErrors.email ? (
                      <span className="text-rose-500 text-[11px] mt-1 block">❌ {fieldErrors.email}</span>
                    ) : (
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <FiMail className="h-3 w-3" />
                        {translate('Your bill will be sent to this email.', 'तपाईंको बिल यही इमेलमा पठाइनेछ।')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      placeholder={translate('Phone Number *', 'फोन नम्बर *')}
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setPhone(digits);
                        setFieldErrors((prev) => ({ ...prev, phone: '' }));
                      }}
                      className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    />
                    {fieldErrors.phone && <span className="text-rose-500 text-[11px] mt-1 block">❌ {fieldErrors.phone}</span>}
                  </div>
                  <div>
                    <input
                      type="text"
                      required
                      list="nepal-places-list"
                      autoComplete="address-level2"
                      placeholder={translate('Location / City * (Nepal)', 'स्थान / शहर * (नेपाल)')}
                      value={location}
                      onChange={(e) => { setLocation(sanitizeCheckoutWords(e.target.value)); setFieldErrors(prev => ({ ...prev, city: '' })); }}
                      className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    />
                    <datalist id="nepal-places-list">
                      {NEPAL_PLACES.map((place) => (
                        <option key={place} value={place} />
                      ))}
                    </datalist>
                    {fieldErrors.city && <span className="text-rose-500 text-[11px] mt-1 block">❌ {fieldErrors.city}</span>}
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    type="text"
                    required
                    autoComplete="street-address"
                    placeholder={translate('Street / Landmark *', 'सडक / स्थलचिन्ह *')}
                    value={address}
                    onChange={(e) => { setAddress(sanitizeCheckoutWords(e.target.value)); setFieldErrors(prev => ({ ...prev, address: '' })); }}
                    className="w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                  />
                  {fieldErrors.address && <span className="text-rose-500 text-[11px] mt-1 block">❌ {fieldErrors.address}</span>}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">{translate('All fields are required to place your order.', 'अर्डर गर्न सबै विवरण अनिवार्य छन्।')}</p>
              </div>
            </div>

            <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{translate('Order Summary', 'अर्डर विवरण')}</h3>

              <div className="rounded-[28px] border border-[#e8dfd0] bg-white p-6 shadow-sm">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{translate('Delivery Method', 'डेलिभरी विधि')}</span>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDeliveryMethod('delivery')}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold ${
                        deliveryMethod === 'delivery' ? 'border-[#f2b71d] bg-[#fff1c7] text-[#1a1a2e]' : 'border-[#e8dfd0] bg-[#fffaf0] text-slate-500'
                      }`}
                    >
                      <FiTruck />
                      <span>Home Delivery</span>
                    </button>
                    <button
                      onClick={() => setDeliveryMethod('pickup')}
                      className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold ${
                        deliveryMethod === 'pickup' ? 'border-[#f2b71d] bg-[#fff1c7] text-[#1a1a2e]' : 'border-[#e8dfd0] bg-[#fffaf0] text-slate-500'
                      }`}
                    >
                      <FiMapPin />
                      <span>Self Pickup</span>
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{translate('Payment Option', 'भुक्तानी विकल्प')}</span>
                  <div className={`mt-2 grid gap-2 ${paymentOptions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {paymentOptions.map((pay) => (
                      <button
                        key={pay.value}
                        type="button"
                        onClick={() => setPaymentMethod(pay.value)}
                        className={`rounded-xl border py-2 text-xs font-semibold transition ${
                          paymentMethod === pay.value
                            ? pay.value === 'eSewa' ? 'border-[#60bb46] bg-[#eaf7e4] text-[#2f7d1c]' : 'border-[#f2b71d] bg-[#fff1c7] text-[#1a1a2e]'
                            : 'border-[#e8dfd0] bg-[#fffaf0] text-slate-500'
                        }`}
                      >
                        {pay.label}
                      </button>
                    ))}
                  </div>
                  {paymentMethod === 'eSewa' && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      {translate(
                        `You'll pay ${checkoutBusinessName || 'the business'} directly on eSewa. Your order is confirmed after eSewa verifies the payment.`,
                        `तपाईंले eSewa मार्फत ${checkoutBusinessName || 'व्यवसाय'}लाई सिधै भुक्तानी गर्नुहुनेछ।`
                      )}
                    </p>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] p-4 text-xs text-slate-500 space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{displayPrice(subtotal)}</span>
                  </div>
                  {rawDiscount > 0 && (
                    <div className="flex justify-between font-bold text-emerald-600">
                      <span>Discount</span>
                      <span>-{displayPrice(rawDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Delivery Charges</span>
                    <span>{displayPrice(deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (13% Tax)</span>
                    <span>{displayPrice(tax)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-[#e8dfd0] pt-3 text-sm font-black text-[#1a1a2e]">
                    <span>Total Payable</span>
                    <span className="text-[#d49a00]">{displayPrice(total)}</span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={placingOrder}
                  aria-busy={placingOrder}
                  className="mt-5 w-full rounded-full bg-gradient-to-r from-[#f2b71d] to-[#d4a017] py-3 text-xs font-bold text-[#1a1a2e] shadow-lg shadow-[#f2b71d]/20 hover:shadow-[#f2b71d]/30 disabled:cursor-wait disabled:opacity-70"
                >
                  {placingOrder
                    ? processingLabel
                    : paymentMethod === 'eSewa'
                      ? `Pay with eSewa (${displayPrice(total)})`
                      : `Place order (${displayPrice(total)})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[28px] border border-[#e8dfd0] bg-white p-6 text-center shadow-2xl">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">{translate('Scan to Pay', 'स्क्यान गरी भुक्तानी गर्नुहोस्')}</h4>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {checkoutBusinessName ? `${translate('Pay the business', 'व्यवसायलाई भुक्तान गर्नुहोस्')}: ${checkoutBusinessName}` : translate('Scan the QR code with your mobile banking or eSewa app.', 'मोबाइल बैंकिङ वा eSewa एपबाट QR स्क्यान गर्नुहोस्।')}
              </p>
              <div className="mx-auto mt-4 flex h-48 w-48 items-center justify-center rounded-2xl bg-white p-3 shadow-inner ring-1 ring-[#e8dfd0]">
                {checkoutBusinessQrUrl ? (
                  <img src={checkoutBusinessQrUrl} alt="Business payment QR" className="h-full w-full rounded-2xl object-contain" />
                ) : (
                  <div className="grid h-full w-full grid-cols-5 gap-2.5 opacity-90">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div
                        key={i}
                        className={`rounded ${
                          (i % 3 === 0 && i % 2 === 0) || i === 0 || i === 4 || i === 20 || i === 24
                            ? 'bg-slate-950'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                {checkoutBusinessQrUrl
                  ? translate('Scan with eSewa, Khalti, or Mobile Banking app. Business-specific QR code is shown when available.', 'eSewa, Khalti वा मोबाइल बैंकिङ प्रयोग गरी स्क्यान गर्नुहोस्। उपलब्ध भएमा व्यवसाय-विशिष्ट QR कोड देखाइन्छ।')
                  : translate('This business has not uploaded a QR code yet. Complete payment via your preferred method and confirm when ready.', 'यस व्यवसायले अझै QR कोड अपलोड गरेको छैन। तपाईंको मनपर्ने तरिका प्रयोग गरी भुक्तानी गरी पुष्टि गर्नुहोस्।')}
              </p>
              <button
                onClick={() => handlePlaceOrder(null)}
                disabled={placingOrder}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                <FiCheckCircle />
                <span>{placingOrder ? processingLabel : translate("I've Paid — Place Order", 'भुक्तानी गरें — अर्डर गर्नुहोस्')}</span>
              </button>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                {translate('The business confirms QR payments. Your bill shows the payment as pending until then.', 'व्यवसायले QR भुक्तानी पुष्टि गर्छ। त्यतिन्जेल बिलमा भुक्तानी बाँकी देखिन्छ।')}
              </p>
              <button
                onClick={() => setShowQrModal(false)}
                className="mt-3 text-xs text-slate-500 hover:text-slate-700"
              >
                {translate('Cancel', 'रद्द गर्नुहोस्')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
