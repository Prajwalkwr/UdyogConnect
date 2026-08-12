import React, { useState, useEffect } from 'react';
import { FiShoppingBag, FiTrash2, FiMapPin, FiTruck, FiCreditCard, FiCheckCircle, FiTag } from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';

export default function CartCheckout({
  cart,
  user,
  lang,
  currency,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
}) {
  const [promoCode, setPromoCode] = useState('');
  const [couponData, setCouponData] = useState(null);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Form State
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' | 'pickup'
  const [paymentMethod, setPaymentMethod] = useState('COD'); // 'COD' | 'Card' | 'Wallet' | 'QR'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Card fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // QR Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  /* Phone key filter — only allow digits, +, -, space, (, ) */
  const handlePhoneKeyDown = (e) => {
    const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
    if (allowed.includes(e.key)) return;
    if (/^[\d+\-() ]$/.test(e.key)) return;
    e.preventDefault();
  };

  const handlePhonePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (!/^[+\d\s\-()]+$/.test(pasted)) {
      e.preventDefault();
    }
  };

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      if (user.addresses && user.addresses.length > 0) {
        setAddress(user.addresses[0].address);
      }
    }
  }, [user]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleApplyCoupon = async () => {
    if (!promoCode) return;
    try {
      const response = await axios.get('/api/admin/coupons');
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
    if (currency === 'USD') {
      return `$ ${(parseFloat(val) / 130).toFixed(2)}`;
    }
    return `रु ${val}`;
  };

  const handlePlaceOrder = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) return;
    if (!name || !email || !phone || (!address && deliveryMethod === 'delivery')) {
      Swal.fire({ icon: 'error', text: translate('Please fill all delivery contact fields.', 'कृपया सबै डेलिभरी विवरणहरू भर्नुहोस्।') });
      return;
    }

    if (paymentMethod === 'Card' && (!cardNumber || !cardExpiry || !cardCvc)) {
      Swal.fire({ icon: 'error', text: 'Please fill credit/debit card information.' });
      return;
    }

    if (paymentMethod === 'QR' && !showQrModal) {
      setShowQrModal(true);
      return;
    }

    setPlacingOrder(true);
    try {
      const token = localStorage.getItem('token');

      // ── Resolve businessId per item ──────────────────────────────────────────
      // Fetch current product list from server so we can look up businessId for
      // any cart item that is missing it (old cart, missing field, etc.)
      let productLookup = {};
      try {
        const prodRes = await axios.get('/api/products');
        if (Array.isArray(prodRes.data)) {
          prodRes.data.forEach(p => {
            if (p._id && p.businessId) productLookup[p._id] = p.businessId;
          });
        }
      } catch (_) {}

      // Build items with guaranteed businessId
      const resolvedItems = cart.map(item => {
        const bizId = item.businessId || productLookup[item.id] || '';
        return {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          businessId: bizId,
          seller: item.seller,
          type: item.type || 'product',
        };
      });

      // Top-level businessId: first non-empty one from resolved items
      const realBusinessId = resolvedItems.find(i => i.businessId)?.businessId || '';

      const response = await axios.post(
        '/api/checkout',
        {
          businessId: realBusinessId,
          items: resolvedItems,
          promoCode: couponData ? couponData.code : undefined,
          paymentMethod,
          deliveryAddress: { name, email, phone, address, method: deliveryMethod },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const placedOrder = response.data.order;

      // Card / Wallet / QR Simulated payment confirmation
      if (paymentMethod === 'Card' || paymentMethod === 'Wallet' || paymentMethod === 'QR') {
        await axios.post(
          '/api/payment/confirm',
          { orderId: placedOrder._id, status: 'paid' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      Swal.fire({
        icon: 'success',
        title: translate('Order Confirmed! 🎉', 'अर्डर सफल भयो! 🎉'),
        html: `<p style="font-size:13px;color:#94a3b8">Order ID: <strong style="color:#fbbf24;font-family:monospace">#${String(placedOrder._id).slice(-8).toUpperCase()}</strong></p>
               <p style="font-size:12px;color:#64748b;margin-top:4px">You can track your order in My Orders.</p>`,
        confirmButtonColor: '#fbbf24',
        confirmButtonText: 'View Orders',
      });

      onClearCart();
      setShowQrModal(false);
      onOrderSuccess();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Order checkout failed. Please try again.' });
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-left sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">{translate('Shopping Cart', 'किनमेल झोला')}</h2>
          <p className="text-xs text-slate-400 mt-1">{translate('Review items and finalize checkout options', 'विवरण समीक्षा गरी अर्डर पूरा गर्नुहोस्')}</p>
        </div>
      </div>

      {cart.length === 0 ? (
        <div className="py-20 text-center rounded-[32px] border border-slate-850 bg-slate-900/10 mt-6">
          <FiShoppingBag className="mx-auto h-12 w-12 text-slate-650" />
          <p className="mt-4 text-sm text-slate-400">{translate('Your cart is currently empty.', 'तपाईंको कार्ट हाल खाली छ।')}</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Cart items list */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-450">{translate('Cart items', 'अर्डर सूची')}</h3>
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/30 p-4"
              >
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">{item.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.seller}</p>
                </div>
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center rounded-xl bg-slate-950 border border-slate-850 p-1">
                    <button
                      onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                      className="px-2 text-slate-450 hover:text-white"
                    >
                      -
                    </button>
                    <span className="px-2 text-xs font-bold text-white">{item.quantity}</span>
                    <button
                      onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                      className="px-2 text-slate-450 hover:text-white"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-black text-amber-300 text-xs sm:text-sm">
                    {displayPrice(item.price * item.quantity)}
                  </span>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="text-slate-500 hover:text-rose-450 p-1"
                  >
                    <FiTrash2 className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Promo Code section */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/20 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{translate('Discount Code', 'कुपन कोड')}</span>
              <div className="mt-2 flex gap-2">
                <div className="relative flex-1">
                  <FiTag className="absolute top-3.5 left-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="e.g. NEPAL50"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-650 outline-none focus:border-amber-400"
                  />
                </div>
                <button
                  onClick={handleApplyCoupon}
                  className="rounded-2xl bg-slate-900 border border-slate-750 px-4 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Address Details */}
            <div className="rounded-[32px] border border-slate-800 bg-slate-900/30 p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-450">{translate('Delivery Details', 'डेलिभरी ठेगाना')}</h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder={translate('Full Name', 'पूरा नाम')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder={translate('Phone Number', 'फोन नम्बर')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={handlePhoneKeyDown}
                  onPaste={handlePhonePaste}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
                  required
                />
                {deliveryMethod === 'delivery' && (
                  <input
                    type="text"
                    placeholder={translate('Address (e.g. Kathmandu)', 'ठेगाना (उदा: काठमाडौं)')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Checkout Summary & Options */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-450">{translate('Order Summary', 'अर्डर विवरण')}</h3>

            <div className="rounded-[32px] border border-slate-800 bg-slate-905 p-6 space-y-5">
              {/* Delivery choices */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{translate('Delivery Method', 'डेलिभरी विधि')}</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold ${
                      deliveryMethod === 'delivery' ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-slate-800 bg-slate-950/60 text-slate-400'
                    }`}
                  >
                    <FiTruck />
                    <span>Home Delivery</span>
                  </button>
                  <button
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-semibold ${
                      deliveryMethod === 'pickup' ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-slate-800 bg-slate-950/60 text-slate-400'
                    }`}
                  >
                    <FiMapPin />
                    <span>Self Pickup</span>
                  </button>
                </div>
              </div>

              {/* Payment Methods */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-450">{translate('Payment Option', 'भुक्तानी विकल्प')}</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { value: 'COD', label: 'Cash / COD' },
                    { value: 'Card', label: 'Credit Card' },
                    { value: 'Wallet', label: 'Wallet Pay' },
                    { value: 'QR', label: 'QR Scan' },
                  ].map((pay) => (
                    <button
                      key={pay.value}
                      onClick={() => setPaymentMethod(pay.value)}
                      className={`rounded-xl border py-2 text-xs font-semibold transition ${
                        paymentMethod === pay.value ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-slate-800 bg-slate-950/60 text-slate-400'
                      }`}
                    >
                      {pay.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card info inputs */}
              {paymentMethod === 'Card' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3 animate-fade-in">
                  <div className="relative">
                    <FiCreditCard className="absolute top-3 left-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Card Number"
                      maxLength="16"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-650"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="MM/YY"
                      maxLength="5"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-650 text-center"
                    />
                    <input
                      type="password"
                      placeholder="CVC"
                      maxLength="3"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 px-3 text-xs text-white placeholder-slate-650 text-center"
                    />
                  </div>
                </div>
              )}

              {/* Invoice Calculations */}
              <div className="rounded-2xl border border-slate-850 bg-slate-950/60 p-4 text-xs text-slate-400 space-y-2 font-medium">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{displayPrice(subtotal)}</span>
                </div>
                {rawDiscount > 0 && (
                  <div className="flex justify-between text-emerald-400 font-bold">
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
                <div className="mt-2 flex justify-between border-t border-slate-800 pt-3 text-sm font-black text-white">
                  <span>Total Payable</span>
                  <span className="text-amber-400">{displayPrice(total)}</span>
                </div>
              </div>

              {/* Checkout Placement Trigger */}
              <button
                onClick={handlePlaceOrder}
                className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-[0.99]"
              >
                Place order ({displayPrice(total)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR MODAL */}
      {showQrModal && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[32px] border border-slate-800 bg-slate-900 p-6 text-center space-y-4 shadow-2xl">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">{translate('Scan to Pay', 'स्क्यान गरी भुक्तानी गर्नुहोस्')}</h4>
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-2xl bg-white p-3 shadow-inner">
              {/* Simulated QR Code matrix */}
              <div className="grid grid-cols-5 gap-2.5 h-full w-full opacity-90">
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
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {translate('Scan with eSewa, Khalti, or Mobile Banking app. Simulated QR code for platform checkout.', 'eSewa, Khalti वा मोबाइल बैंकिङ मार्फत भुक्तानी गर्नुहोस्।')}
            </p>
            <button
              onClick={() => handlePlaceOrder(null)}
              disabled={placingOrder}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
            >
              <FiCheckCircle />
              <span>{placingOrder ? 'Confirming...' : 'Simulate Scan & Approve'}</span>
            </button>
            <button
              onClick={() => setShowQrModal(false)}
              className="text-xs text-slate-500 hover:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
