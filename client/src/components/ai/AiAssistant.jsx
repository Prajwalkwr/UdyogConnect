import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { FiCheckCircle, FiChevronDown, FiMapPin, FiNavigation, FiRefreshCw, FiSend, FiStar, FiTrash2, FiX } from 'react-icons/fi';
import { Bot } from 'lucide-react';
import {
  AI_MESSAGES,
  AI_OPEN_EVENT,
  MAX_QUESTION_LENGTH,
  RADIUS_OPTIONS,
  askAssistant,
  clearChatHistory,
  formatNpr,
  loadChatHistory,
  saveChatHistory,
} from '../../utils/aiAssistant';

const SUGGESTIONS = {
  guest: ['Find businesses near me', 'Find electronics under NPR 5000', 'Find services near me', 'Customer care contact'],
  customer: ['Where is my order?', 'Find businesses near me', 'Find services near me', 'Customer care contact'],
  seller: ['How is my business doing?', 'Which of my products are low on stock?', 'How do I accept eSewa?', 'How do I handle a new order?'],
  admin: ['Give me a platform overview', 'How many businesses are pending approval?', 'How does business approval work?', 'Find businesses near me'],
};
const HIDDEN_ON = /^\/(checkout|payment|payment-success|forgot-password|reset-password)(\/|$)/;
const NEAR_ME = /\b(near\s*(me|by)?|nearby|nearest|closest|around me|within \d+\s*km)\b/i;

const distanceLabel = (km) => (km === null || km === undefined ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

function Thumb({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-xl border border-[var(--mp-border)] object-cover" />;
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--mp-cream)] text-base font-bold text-[var(--mp-brown)]">
      {String(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

const actionClass = 'rounded-full border border-[var(--mp-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--mp-brown)] transition hover:border-[var(--mp-gold)] hover:text-[var(--mp-gold)]';
const primaryClass = 'rounded-full bg-[var(--mp-gold)] px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-[var(--mp-brown)] disabled:cursor-not-allowed disabled:bg-slate-300';

function BusinessResult({ business, onOpenBusiness, onOpenProduct }) {
  const top = business.topItem;
  return (
    <div className="rounded-2xl border border-[var(--mp-border)] bg-white p-3">
      <div className="flex gap-3">
        <Thumb src={business.imageUrl} name={business.name} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-bold text-[var(--mp-ink)]">
            <span className="truncate">{business.name}</span>
            {business.verified && <FiCheckCircle className="shrink-0 text-emerald-600" title="Verified business" aria-label="Verified" />}
          </p>
          <p className="truncate text-[11px] text-[var(--mp-muted)]">{[business.category, business.location].filter(Boolean).join(' · ')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {business.reviewCount > 0
              ? <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--mp-ink)]"><FiStar className="fill-[var(--mp-gold)] text-[var(--mp-gold)]" />{business.rating} ({business.reviewCount})</span>
              : <span className="text-[var(--mp-muted)]">No reviews yet</span>}
            {distanceLabel(business.distanceKm) && <span className="inline-flex items-center gap-0.5 text-[var(--mp-muted)]"><FiMapPin />{distanceLabel(business.distanceKm)}</span>}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${business.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
              {business.isOpen ? 'Open now' : 'Closed'}
            </span>
          </div>
          {top && (
            <p className="mt-1 truncate text-[11px] text-[var(--mp-brown)]">
              {top.type === 'service' ? 'Service' : 'Top item'}: <b>{top.name}</b> · {formatNpr(top.price)}
            </p>
          )}
          {business.hoursText && <p className="mt-0.5 truncate text-[11px] text-[var(--mp-muted)]">Hours: {business.hoursText}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <button type="button" className={actionClass} onClick={() => onOpenBusiness(business.id)}>View Business</button>
        {top?.type === 'product' && <button type="button" className={actionClass} onClick={() => onOpenProduct(top.id)}>View Product</button>}
        {top?.type === 'service' && <button type="button" className={primaryClass} onClick={() => onOpenBusiness(business.id, 'services')}>Book Service</button>}
      </div>
    </div>
  );
}

function ProductResult({ product, onOpenProduct, onOpenBusiness, onAddToCart }) {
  return (
    <div className="rounded-2xl border border-[var(--mp-border)] bg-white p-3">
      <div className="flex gap-3">
        <Thumb src={product.imageUrl} name={product.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--mp-ink)]">{product.name}</p>
          <p className="text-[11px]">
            <button type="button" onClick={() => onOpenBusiness(product.businessId)} className="block max-w-full truncate text-left text-[var(--mp-muted)] hover:text-[var(--mp-gold)]">
              {product.businessName}{distanceLabel(product.distanceKm) ? ` · ${distanceLabel(product.distanceKm)}` : ''}
            </button>
          </p>
          <p className="mt-1 text-[12px]">
            <b className="text-[var(--mp-ink)]">{formatNpr(product.finalPrice)}</b>
            {product.discount > 0 && <span className="ml-1.5 text-[11px] text-[var(--mp-muted)] line-through">{formatNpr(product.price)}</span>}
            <span className={`ml-2 text-[10px] font-bold ${product.inStock ? 'text-emerald-700' : 'text-rose-600'}`}>
              {product.inStock ? (product.stock <= 5 ? `Only ${product.stock} left` : 'In stock') : 'Unavailable'}
            </span>
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <button type="button" className={actionClass} onClick={() => onOpenProduct(product.id)}>View Product</button>
        <button type="button" className={primaryClass} disabled={!product.inStock} onClick={() => onAddToCart(product)}>Add to Cart</button>
      </div>
    </div>
  );
}

function ServiceResult({ service, onOpenBusiness }) {
  return (
    <div className="rounded-2xl border border-[var(--mp-border)] bg-white p-3">
      <div className="flex gap-3">
        <Thumb src={service.imageUrl} name={service.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--mp-ink)]">{service.name}</p>
          <p className="text-[11px]">
            <button type="button" onClick={() => onOpenBusiness(service.businessId)} className="block max-w-full truncate text-left text-[var(--mp-muted)] hover:text-[var(--mp-gold)]">
              {service.businessName}{distanceLabel(service.distanceKm) ? ` · ${distanceLabel(service.distanceKm)}` : ''}
            </button>
          </p>
          <p className="mt-1 text-[12px]">
            <b className="text-[var(--mp-ink)]">{formatNpr(service.price)}</b>
            {service.durationMinutes ? <span className="ml-1.5 text-[11px] text-[var(--mp-muted)]">{service.durationMinutes} min</span> : null}
            {service.homeService && <span className="ml-2 rounded-full bg-[var(--mp-cream)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--mp-brown)]">Home service</span>}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <button type="button" className={actionClass} onClick={() => onOpenBusiness(service.businessId)}>View Business</button>
        <button type="button" className={primaryClass} onClick={() => onOpenBusiness(service.businessId, 'services')}>Book Service</button>
      </div>
    </div>
  );
}

const telHref = (value) => `tel:${String(value).replace(/[^\d+]/g, '')}`;
const whatsappHref = (value) => `https://wa.me/${String(value).replace(/\D/g, '')}`;

function ContactCard({ contact, onOpenBusiness }) {
  const rows = [
    contact.phone && ['Phone', contact.phone],
    contact.whatsapp && ['WhatsApp', contact.whatsapp],
    contact.email && ['Email', contact.email],
    contact.hours && ['Hours', contact.hours],
    contact.address && ['Address', contact.address],
  ].filter(Boolean);
  return (
    <div className="rounded-2xl border border-[var(--mp-border)] bg-white p-3">
      <p className="text-sm font-bold text-[var(--mp-ink)]">{contact.title}</p>
      <dl className="mt-1.5 space-y-0.5 text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-16 shrink-0 text-[var(--mp-muted)]">{label}</dt>
            <dd className="min-w-0 break-words font-semibold text-[var(--mp-ink)]">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {contact.phone && <a className={primaryClass} href={telHref(contact.phone)}>Call</a>}
        {contact.whatsapp && <a className={actionClass} href={whatsappHref(contact.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {contact.email && <a className={contact.phone ? actionClass : primaryClass} href={`mailto:${contact.email}`}>Email</a>}
        {contact.kind === 'business' && contact.businessId && (
          <button type="button" className={actionClass} onClick={() => onOpenBusiness(contact.businessId)}>View Business</button>
        )}
      </div>
    </div>
  );
}

/** Cards in answer order, with a "You may also like" heading before the first similar suggestion. */
function ItemList({ items, render }) {
  const firstSimilar = items.findIndex((item) => item.match === 'similar');
  return items.map((item, index) => (
    <React.Fragment key={item.id}>
      {index === firstSimilar && <p className="pt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--mp-muted)]">You may also like</p>}
      {render(item)}
    </React.Fragment>
  ));
}

function StatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-white px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--mp-muted)]">{label}</p>
          <p className="text-sm font-bold text-[var(--mp-ink)]">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="rounded-xl border border-dashed border-[var(--mp-border)] bg-white/70 px-2.5 py-1.5 text-[11px]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between font-semibold text-[var(--mp-brown)]" aria-expanded={open}>
        <span>Source: {sources.map((source) => `${source.doc} › ${source.section}`).join('; ')}</span>
        <FiChevronDown className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && sources.map((source) => (
        <p key={source.id} className="mt-1.5 whitespace-pre-line text-[var(--mp-muted)]"><b className="text-[var(--mp-ink)]">{source.section}:</b> {source.text}</p>
      ))}
    </div>
  );
}

function AnswerBody({ data, handlers, navigate }) {
  const { businesses = [], products = [], services = [] } = data.results || {};
  return (
    <div className="mt-2 space-y-2 text-[11px]">
      {data.contact && <ContactCard contact={data.contact} onOpenBusiness={handlers.onOpenBusiness} />}
      <ItemList items={products} render={(product) => <ProductResult product={product} {...handlers} />} />
      <ItemList items={services} render={(service) => <ServiceResult service={service} {...handlers} />} />
      {!data.contact && businesses.map((business) => <BusinessResult key={`b-${business.id}`} business={business} {...handlers} />)}

      {data.orders?.length > 0 && (
        <div className="space-y-1.5">
          {data.orders.map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[12px]">
              <div className="min-w-0">
                <p className="font-bold text-[var(--mp-ink)]">{order.number} · {order.businessName}</p>
                <p className="text-[11px] text-[var(--mp-muted)]">{order.itemCount} item{order.itemCount === 1 ? '' : 's'} · {formatNpr(order.total)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--mp-cream)] px-2 py-0.5 text-[10px] font-bold text-[var(--mp-brown)]">{order.statusLabel}</span>
            </div>
          ))}
          <button type="button" className={actionClass} onClick={() => navigate('/customer')}>Open my orders</button>
        </div>
      )}

      {data.bookings?.length > 0 && (
        <div className="space-y-1.5">
          {data.bookings.map((booking) => (
            <div key={booking.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[12px]">
              <div className="min-w-0">
                <p className="truncate font-bold text-[var(--mp-ink)]">{booking.serviceName} · {booking.businessName}</p>
                <p className="text-[11px] text-[var(--mp-muted)]">{booking.date} · {booking.timeSlot}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--mp-cream)] px-2 py-0.5 text-[10px] font-bold capitalize text-[var(--mp-brown)]">{booking.status}</span>
            </div>
          ))}
          <button type="button" className={actionClass} onClick={() => navigate('/customer')}>Open my bookings</button>
        </div>
      )}

      {data.sellerStats && (
        <div className="space-y-1.5">
          <StatGrid items={[
            ['Orders (30 days)', data.sellerStats.ordersLast30Days],
            ['Waiting to accept', data.sellerStats.newOrders],
            ['Earned (30 days)', formatNpr(data.sellerStats.revenueLast30Days)],
            ['Pending bookings', data.sellerStats.pendingBookings],
            ['Products', data.sellerStats.products],
            ['Rating', data.sellerStats.rating ? `${data.sellerStats.rating} (${data.sellerStats.reviewCount})` : 'No reviews'],
          ]}
          />
          {data.sellerStats.lowStock?.length > 0 && (
            <p className="rounded-xl bg-white px-3 py-2 text-[11px] text-[var(--mp-muted)]">
              Low stock: {data.sellerStats.lowStock.map((item) => `${item.name} (${item.stock})`).join(', ')}
            </p>
          )}
          <button type="button" className={actionClass} onClick={() => navigate('/business')}>Open business dashboard</button>
        </div>
      )}

      {data.adminStats && (
        <div className="space-y-1.5">
          <StatGrid items={[
            ['Approved', data.adminStats.businessesByStatus?.approved || 0],
            ['Pending approval', data.adminStats.businessesByStatus?.pending || 0],
            ['Customers', data.adminStats.usersByRole?.customer || 0],
            ['Sellers', data.adminStats.usersByRole?.seller || 0],
            ['Orders (30 days)', data.adminStats.ordersLast30Days],
            ['Order value', formatNpr(data.adminStats.orderValueLast30Days)],
          ]}
          />
          <button type="button" className={actionClass} onClick={() => navigate('/admin')}>Open admin dashboard</button>
        </div>
      )}

      <Sources sources={data.sources} />
    </div>
  );
}

export default function AiAssistant({ user, onOpenBusiness, onOpenProduct, onAddToCart }) {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const userId = String(user?._id || user?.id || '');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadChatHistory(userId));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [radiusKm, setRadiusKm] = useState(5);
  const [coords, setCoords] = useState(null);
  const [locationState, setLocationState] = useState('idle');
  const abortRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const historyOwnerRef = useRef(userId);

  const suggestions = SUGGESTIONS[user?.role] || SUGGESTIONS.guest;

  useEffect(() => {
    if (historyOwnerRef.current === userId) return;
    historyOwnerRef.current = userId;
    abortRef.current?.abort();
    setLoading(false);
    setMessages(loadChatHistory(userId));
  }, [userId]);

  useEffect(() => {
    saveChatHistory(userId, messages);
  }, [userId, messages]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const requestLocation = useCallback(() => new Promise((resolve) => {
    if (coords) return resolve(coords);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationState('unsupported');
      return resolve(null);
    }
    setLocationState('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(next);
        setLocationState('on');
        resolve(next);
      },
      () => {
        setLocationState('denied');
        resolve(null);
      },
      { maximumAge: 10 * 60 * 1000, timeout: 8000 },
    );
  }), [coords]);

  // Never prompts: GPS is used up front only when permission was already granted.
  useEffect(() => {
    if (!open || coords || locationState !== 'idle' || typeof navigator === 'undefined' || !navigator.permissions?.query) return undefined;
    let active = true;
    navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
      if (active && permission.state === 'granted') requestLocation();
    }).catch(() => {});
    return () => { active = false; };
  }, [open, coords, locationState, requestLocation]);

  const send = useCallback(async (raw) => {
    const question = String(raw || '').trim().slice(0, MAX_QUESTION_LENGTH);
    if (!question || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setLoading(true);

    const location = NEAR_ME.test(question) && locationState === 'idle' ? await requestLocation() : coords;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const result = await askAssistant({ message: question, location, radiusKm, signal: controller.signal });
    if (result.aborted || controller.signal.aborted) return;
    setLoading(false);
    setMessages((prev) => [...prev, result.ok
      ? { role: 'assistant', text: result.data.explanation || AI_MESSAGES.empty, data: result.data, question }
      : { role: 'assistant', text: result.error, error: true, question }]);
  }, [coords, loading, locationState, radiusKm, requestLocation]);

  useEffect(() => {
    const onOpen = (event) => {
      setOpen(true);
      const prompt = event?.detail?.prompt;
      if (prompt) send(prompt);
    };
    window.addEventListener(AI_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(AI_OPEN_EVENT, onOpen);
  }, [send]);

  const handlers = {
    onOpenBusiness: (id, tab) => {
      onOpenBusiness(id, tab);
      if (window.matchMedia?.('(max-width: 639px)').matches) setOpen(false);
    },
    onOpenProduct: (id) => onOpenProduct(id),
    onAddToCart: (product) => {
      if (!product.inStock) return;
      onAddToCart({
        id: product.id,
        name: product.name,
        price: product.finalPrice,
        quantity: 1,
        seller: product.businessName,
        stock: product.stock,
        businessId: product.businessId,
      });
      Swal.fire({ icon: 'success', title: 'Added to cart', text: product.name });
    },
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages([]);
    clearChatHistory(userId);
  };

  if (HIDDEN_ON.test(routerLocation.pathname)) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[5.25rem] right-6 z-45 inline-flex items-center gap-2 rounded-full border border-[var(--mp-gold)] bg-[var(--mp-paper)] px-4 py-2.5 text-sm font-bold text-[var(--mp-brown)] shadow-lg transition hover:scale-105 hover:bg-white active:scale-95"
          aria-label="Ask UdyogConnect AI"
        >
          <span aria-hidden className="text-sm">🤖</span>
          <span className="hidden text-sm sm:inline">Ask UdyogConnect AI</span>
          <span className="text-sm sm:hidden">Ask AI</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="UdyogConnect AI assistant"
          className="fixed inset-x-2 bottom-2 top-16 z-[60] flex flex-col overflow-hidden rounded-[24px] border border-[var(--mp-border)] bg-[var(--mp-paper)] shadow-2xl sm:inset-x-auto sm:bottom-[5.25rem] sm:right-6 sm:top-auto sm:h-[min(640px,calc(100vh-7rem))] sm:w-[400px]"
        >
          <header className="flex items-center justify-between border-b border-[var(--mp-border)] bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--mp-gold)] text-white"><Bot className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-bold text-[var(--mp-ink)]">UdyogConnect AI</p>
                <p className="text-[10px] text-[var(--mp-muted)]">Answers from live UdyogConnect listings</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={clearChat} className="rounded-full p-2 text-[var(--mp-muted)] hover:bg-[var(--mp-cream)]" aria-label="Clear chat" title="Clear chat">
                  <FiTrash2 />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-[var(--mp-muted)] hover:bg-[var(--mp-cream)]" aria-label="Close assistant">
                <FiX className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--mp-border)] bg-[var(--mp-cream)] px-3 py-2 text-[11px]">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--mp-muted)]">Radius</span>
            {RADIUS_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                aria-pressed={radiusKm === km}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${radiusKm === km ? 'bg-[var(--mp-gold)] text-white' : 'bg-white text-[var(--mp-brown)] hover:text-[var(--mp-gold)]'}`}
              >
                {km} km
              </button>
            ))}
            <button
              type="button"
              onClick={() => requestLocation()}
              className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${locationState === 'on' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-[var(--mp-brown)] hover:text-[var(--mp-gold)]'}`}
              disabled={locationState === 'locating'}
            >
              <FiNavigation className="h-3 w-3" />
              {{ on: 'Using your location', locating: 'Locating…', denied: 'Location off', unsupported: 'No location' }[locationState] || 'Use my location'}
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3" aria-live="polite">
            {messages.length === 0 && (
              <div className="py-6 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--mp-gold)] shadow-sm"><Bot className="h-7 w-7" /></span>
                <p className="mt-3 text-base font-bold text-[var(--mp-ink)]">How can I help?</p>
                <p className="mt-1 text-xs text-[var(--mp-muted)]">{AI_MESSAGES.prompt}</p>
                <div className="mt-4 flex flex-col gap-2 text-xs">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-2xl border border-[var(--mp-border)] bg-white px-3 py-2 text-left text-xs font-semibold text-[var(--mp-brown)] transition hover:border-[var(--mp-gold)] hover:text-[var(--mp-gold)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (message.role === 'user' ? (
              <div key={index} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--mp-brown)] px-3 py-2 text-[13px] text-white">{message.text}</p>
              </div>
            ) : (
              <div key={index} className="flex gap-2">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--mp-gold)] shadow-sm"><Bot className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className={`rounded-2xl rounded-tl-md px-3 py-2 text-[13px] leading-relaxed ${message.error ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'bg-white text-[var(--mp-ink)]'}`}>
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                    {message.data?.mode === 'ai' && <p className="mt-1 text-[10px] text-[var(--mp-muted)]">AI summary of the listings below</p>}
                    {message.restored && !message.error && (
                      <p className="mt-1 text-[10px] text-[var(--mp-muted)]">Earlier answer. Prices and stock may have changed.</p>
                    )}
                    {(message.error || message.restored) && message.question && (
                      <p className="mt-1.5 text-[11px]">
                        <button type="button" onClick={() => send(message.question)} disabled={loading} className="inline-flex items-center gap-1 font-bold text-[var(--mp-gold)] hover:underline disabled:opacity-50">
                          <FiRefreshCw className="h-3 w-3" /> {message.error ? 'Try again' : 'Ask again'}
                        </button>
                      </p>
                    )}
                  </div>
                  {message.data && <AnswerBody data={message.data} handlers={handlers} navigate={navigate} />}
                </div>
              </div>
            )))}

            {loading && (
              <div className="flex gap-2" role="status">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--mp-gold)] shadow-sm"><Bot className="h-4 w-4" /></span>
                <p className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-white px-3 py-2 text-[13px] text-[var(--mp-muted)]">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--mp-gold)] border-t-transparent" />
                  {AI_MESSAGES.loading}
                </p>
              </div>
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-[var(--mp-border)] bg-white px-3 py-2.5 text-[13px]"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="ai-assistant-input" className="sr-only">Ask UdyogConnect AI</label>
            <textarea
              id="ai-assistant-input"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={MAX_QUESTION_LENGTH}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask about a business, product or service…"
              className="max-h-28 min-h-[40px] flex-1 resize-none rounded-2xl border border-[var(--mp-border)] bg-[var(--mp-paper)] px-3 py-2 text-[13px] text-[var(--mp-ink)] outline-none focus:border-[var(--mp-gold)]"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mp-gold)] text-white transition hover:bg-[var(--mp-brown)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send"
            >
              <FiSend />
            </button>
          </form>
          {input.length > MAX_QUESTION_LENGTH - 50 && (
            <p className="bg-white px-4 pb-2 text-right text-[10px] text-[var(--mp-muted)]">{input.length}/{MAX_QUESTION_LENGTH}</p>
          )}
        </section>
      )}
    </>
  );
}
