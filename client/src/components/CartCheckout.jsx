import React, { useState, useEffect } from 'react';
import { FiShoppingBag, FiTrash2, FiMapPin, FiTruck, FiCreditCard, FiCheckCircle, FiTag, FiX } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { resolveCheckoutBusinessId } from '../utils/checkout';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';
import { isValidNepalPhone } from '../utils/authFlow';

export default function CartCheckout({
  cart,
  user,
  lang,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onClose,
  onOrderSuccess,
}) {
  const [promoCode, setPromoCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Form State
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' | 'pickup'
  const [paymentMethod, setPaymentMethod] = useState('COD'); // 'COD' | 'Card' | 'QR'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // QR Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutBusinessName, setCheckoutBusinessName] = useState('');
  const [checkoutBusinessQrUrl, setCheckoutBusinessQrUrl] = useState('');
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      if (user.addresses && user.addresses.length > 0) {
        setLocation(user.addresses[0].location || '');
        setAddress(user.addresses[0].address || '');
      }
    }
  }, [user]);

  useEffect(() => {
    const businessId = resolveCheckoutBusinessId(cart);
    if (!businessId) {
      setCheckoutBusinessName('');
      setCheckoutBusinessQrUrl('');
      return;
    }

    let cancelled = false;
    const loadBusiness = async () => {
      try {
        const response = await api.get(`/api/businesses/${businessId}`);
        if (cancelled) return;
        setCheckoutBusinessName(response.data.business?.name || '');
        setCheckoutBusinessQrUrl(response.data.business?.qrUrl || '');
      } catch (err) {
        if (!cancelled) {
          setCheckoutBusinessName('');
          setCheckoutBusinessQrUrl('');
        }
      }
    };
    loadBusiness();
    return () => { cancelled = true; };
  }, [cart]);

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
    if (!submitGuard.begin()) return;
    if (!name || !email || !phone || !location || (!address && deliveryMethod === 'delivery')) {
      Swal.fire({ icon: 'error', text: translate('Please fill all delivery contact fields, including your location.', 'कृपया सबै डेलिभरी विवरणहरू, साथै तपाईंको स्थान भर्नुहोस्।') });
      submitGuard.finish();
      return;
    }

    if (!isValidNepalPhone(phone)) {
      Swal.fire({ icon: 'error', text: translate('Phone number must start with 9 and contain only digits.', 'फोन नम्बर 9 बाट सुरु हुनुपर्छ र अंक मात्र हुनुपर्छ।') });
      submitGuard.finish();
      return;
    }

    if (paymentMethod === 'Card' && (!cardNumber || !cardExpiry || !cardCvc)) {
      Swal.fire({ icon: 'error', text: 'Please fill credit/debit card information.' });
      submitGuard.finish();
      return;
    }

    if (paymentMethod === 'QR' && !showQrModal) {
      setShowQrModal(true);
      submitGuard.finish();
      return;
    }

    setPlacingOrder(true);
    try {
      const businessId = resolveCheckoutBusinessId(cart);
      const response = await api.post(
        '/api/checkout',
        {
          businessId,
          items: cart.map((item) => ({
            ...item,
            businessId: item.businessId || item.business?.id || businessId || item.sellerId || item.vendorId || '',
          })),
          promoCode: couponData ? couponData.code : undefined,
          paymentMethod,
          deliveryAddress: { name, email, phone, location, address, method: deliveryMethod },
        },
        { headers: { ...createIdempotencyHeader('checkout-order') } }
      );

      const placedOrder = response.data.order;

      // For card payments, create a Stripe Checkout session and redirect the user.
      if (paymentMethod === 'Card') {
        const sessResp = await api.post('/api/payment/create-session', { orderId: placedOrder._id });
        if (sessResp.data && sessResp.data.url) {
          // Redirect to Stripe Checkout
          window.location.href = sessResp.data.url;
          return;
        }
        throw new Error('Failed to initiate card payment.');
      }

      // QR simulated validation (instant)
      if (paymentMethod === 'QR') {
        await api.post('/api/payment/confirm', { orderId: placedOrder._id, status: 'paid' });
      }

      Swal.fire({
        icon: 'success',
        title: translate('Order Confirmed!', 'अर्डर सफल भयो!'),
        text: `Your order has been placed. Order ID: ${placedOrder._id}`,
        confirmButtonColor: '#fbbf24',
      });

      onClearCart();
      setShowQrModal(false);
      onOrderSuccess();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Order checkout failed.' });
    } finally {
      setPlacingOrder(false);
      submitGuard.finish();
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <div className="rounded-[30px] border border-[#e7dcc7] bg-[#f8f2ea] p-4 shadow-[0_25px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-[#eadfca] pb-4">
          <div>
            <h2 className="text-2xl font-black text-[#1a1a2e] sm:text-3xl">{translate('Shopping Cart', 'किनमेल झोला')}</h2>
            <p className="mt-1 text-xs text-slate-500">{translate('Review items and finalize checkout options', 'विवरण समीक्षा गरी अर्डर पूरा गर्नुहोस्')}</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close cart">
              <FiX className="h-5 w-5" />
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <div className="mt-6 rounded-[28px] border border-[#e7dcc7] bg-[#fffdf9] py-20 text-center">
            <FiShoppingBag className="mx-auto h-12 w-12 text-slate-500" />
            <p className="mt-4 text-sm text-slate-500">{translate('Your cart is currently empty.', 'तपाईंको कार्ट हाल खाली छ।')}</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
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
                  <input
                    type="text"
                    placeholder={translate('Full Name', 'पूरा नाम')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    required
                  />
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input
                    type="tel"
                    placeholder={translate('Phone Number', 'फोन नम्बर')}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    required
                  />
                  <input
                    type="text"
                    placeholder={translate('Location / City', 'स्थान / शहर')}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    required
                  />
                </div>

                {deliveryMethod === 'delivery' && (
                  <input
                    type="text"
                    placeholder={translate('Street Address / Landmark', 'सडक ठेगाना / स्थलचिन्ह')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="mt-4 w-full rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] px-4 py-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 outline-none focus:border-[#f2b71d]"
                    required
                  />
                )}
              </div>
            </div>

            <div className="space-y-4">
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
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      { value: 'COD', label: 'Cash / COD' },
                      { value: 'Card', label: 'Credit Card' },
                      { value: 'QR', label: 'QR Scan' },
                    ].map((pay) => (
                      <button
                        key={pay.value}
                        onClick={() => setPaymentMethod(pay.value)}
                        className={`rounded-xl border py-2 text-xs font-semibold transition ${
                          paymentMethod === pay.value ? 'border-[#f2b71d] bg-[#fff1c7] text-[#1a1a2e]' : 'border-[#e8dfd0] bg-[#fffaf0] text-slate-500'
                        }`}
                      >
                        {pay.label}
                      </button>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'Card' && (
                  <div className="mt-5 rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] p-4 space-y-3">
                    <div className="relative">
                      <FiCreditCard className="absolute left-3 top-3 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Card Number"
                        maxLength="16"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full rounded-xl border border-[#e8dfd0] bg-white py-2 pl-9 pr-3 text-xs text-[#1a1a2e] placeholder:text-slate-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="MM/YY"
                        maxLength="5"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full rounded-xl border border-[#e8dfd0] bg-white py-2 px-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 text-center"
                      />
                      <input
                        type="password"
                        placeholder="CVC"
                        maxLength="3"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full rounded-xl border border-[#e8dfd0] bg-white py-2 px-3 text-xs text-[#1a1a2e] placeholder:text-slate-400 text-center"
                      />
                    </div>
                  </div>
                )}

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
                  className="mt-5 w-full rounded-full bg-gradient-to-r from-[#f2b71d] to-[#d4a017] py-3 text-xs font-bold text-[#1a1a2e] shadow-lg shadow-[#f2b71d]/20 hover:shadow-[#f2b71d]/30"
                >
                  Place order ({displayPrice(total)})
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
                <span>{placingOrder ? translate('Confirming...', 'पुष्टि हुँदैछ...') : translate('Simulate Scan & Approve', 'स्क्यान र पुष्टि गर्नुहोस्')}</span>
              </button>
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
