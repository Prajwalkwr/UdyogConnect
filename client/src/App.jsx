import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from './utils/api';
import { notifyOrdersUpdated } from './utils/bill';
import { CONTENT_REPORTS_EVENT } from './utils/reports';
import Swal from 'sweetalert2';
import { useAuth } from './context/AuthContext';
import RoleRoute from './components/RoleRoute';
import { getSessionToken, getSessionUser } from './utils/sessionAuth';
import { normalizeUser } from './utils/authFlow';

// Import Modular Components
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import Marketplace from './components/Marketplace';
import DetailsModal from './components/DetailsModal';
const CustomerDashboard = lazy(() => import('./components/CustomerDashboard'));
const SellerDashboard = lazy(() => import('./components/SellerDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const PaymentSuccess = lazy(() => import('./components/PaymentSuccess'));
const EsewaPaymentReturn = lazy(() => import('./components/EsewaPaymentReturn'));
const EsewaSimulator = lazy(() => import('./components/EsewaSimulator'));
const BusinessProfilePage = lazy(() => import('./components/business-profile/BusinessProfilePage'));
const CartCheckout = lazy(() => import('./components/CartCheckout'));
const ChatAndAI = lazy(() => import('./components/ChatAndAI'));
const CustomerMessagesPage = lazy(() => import('./components/messaging/CustomerMessagesPage'));
const ForgotPasswordPage = lazy(() => import('./components/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./components/auth/ResetPasswordPage'));

// Wrapper for checking paths and initializing overlays
function DetailsPathWrapper({ setSelectedProductId }) {
  const { id } = useParams();
  useEffect(() => {
    if (id) {
      setSelectedProductId(id);
    }
  }, [id, setSelectedProductId]);
  return null;
}

const getCartStorageKey = (user) => `cart:${user?._id || user?.id || 'guest'}`;
const readCartForUser = (user) => {
  try {
    const stored = JSON.parse(localStorage.getItem(getCartStorageKey(user)) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
};

function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useSelector((state) => state.user);
  const cart = useSelector((state) => state.cart);
  const { establishSession, endSession, persistUser, sessionNotice, clearSessionNotice, authReady } = useAuth();

  // Global settings
  const [lang, setLang] = useState('en'); // 'en' | 'ne'
  const [notifications, setNotifications] = useState([]);
  const [liveOrderTick, setLiveOrderTick] = useState(0); // increments on new_order socket event

  // Socket ref
  const socketRef = useRef(null);
  const cartOwnerRef = useRef(undefined);
  const cartSwitchingRef = useRef(false);

  // Data lists
  const [businesses, setBusinesses] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const sellerBusiness = user?.role === 'seller'
    ? businesses.find((business) => String(business.ownerId) === String(user._id || user.id))
    : null;
  const hideSellerSidebar = user?.role === 'seller' && !sellerBusiness;
  const sellerProductCount = sellerBusiness
    ? products.filter((product) => String(product.businessId) === String(sellerBusiness._id)).length
    : 0;
  const sellerServiceCount = sellerBusiness
    ? services.filter((service) => String(service.businessId) === String(sellerBusiness._id)).length
    : 0;

  // Modal open states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [marketplaceCategory, setMarketplaceCategory] = useState('All');
  const [marketplaceSearch, setMarketplaceSearch] = useState('');

  // Dashboard active tab (driven from sidebar)
  const [dashboardTab, setDashboardTab] = useState(null);
  const [sellerOrderCount, setSellerOrderCount] = useState(0);
  const [sellerBookingCount, setSellerBookingCount] = useState(0);
  const [customerBookingCount, setCustomerBookingCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState('loading');
  const [messageUnread, setMessageUnread] = useState(0);
  const [adminReportCount, setAdminReportCount] = useState(0);

  useEffect(() => {
    if (!cartOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [cartOpen]);

  useEffect(() => {
    const userId = user?._id || user?.id || null;
    const currentOwner = cartOwnerRef.current;
    if (currentOwner === userId) return;
    cartSwitchingRef.current = true;
    cartOwnerRef.current = userId;
    dispatch({ type: 'SET_CART', payload: readCartForUser(user) });
  }, [dispatch, user?._id, user?.id]);

  useEffect(() => {
    const userId = user?._id || user?.id || null;
    if (cartOwnerRef.current !== userId) return;
    if (cartSwitchingRef.current) {
      cartSwitchingRef.current = false;
      return;
    }
    localStorage.setItem(getCartStorageKey(user), JSON.stringify(cart));
  }, [cart, user]);

  // Sync notifications and a single Socket.IO connection for the signed-in user
  useEffect(() => {
    const token = getSessionToken();
    if (!token || !user?._id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return undefined;
    }

    fetchNotifications();

    let cancelled = false;
    let socket;

    const connectSocket = async () => {
      try {
        const { io } = await import('socket.io-client');
        if (cancelled) return;
        const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
          || (import.meta.env.DEV ? window.location.origin : 'https://udyogconnect.onrender.com');
        socket = io(backendUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
          autoConnect: true,
        });
        socketRef.current = socket;

        socket.on('new_notification', () => {
          fetchNotifications();
          setLiveOrderTick((t) => t + 1);
          window.dispatchEvent(new CustomEvent('bookings-updated'));
          api.get('/api/conversations/unread-count')
            .then((res) => setMessageUnread(Number(res.data?.unreadTotal || 0)))
            .catch(() => {});
        });
        socket.on('new_booking', () => {
          fetchNotifications();
          setLiveOrderTick((t) => t + 1);
          window.dispatchEvent(new CustomEvent('bookings-updated'));
        });
        socket.on('booking_updated', () => {
          setLiveOrderTick((t) => t + 1);
          window.dispatchEvent(new CustomEvent('bookings-updated'));
        });
        socket.on('chat:message', () => {
          api.get('/api/conversations/unread-count')
            .then((res) => setMessageUnread(Number(res.data?.unreadTotal || 0)))
            .catch(() => {});
        });
        socket.on('chat:unread', () => {
          api.get('/api/conversations/unread-count')
            .then((res) => setMessageUnread(Number(res.data?.unreadTotal || 0)))
            .catch(() => {});
        });
        socket.on('new_order', () => {
          setLiveOrderTick((t) => t + 1);
          notifyOrdersUpdated();
        });
        socket.on('order_status_update', () => {
          setLiveOrderTick((t) => t + 1);
          notifyOrdersUpdated();
        });
        socket.on('support_ticket_update', () => setLiveOrderTick((t) => t + 1));
        socket.on('content_report', () => window.dispatchEvent(new CustomEvent(CONTENT_REPORTS_EVENT)));
        socket.on('connect_error', () => {
          // Socket failure must never block the UI.
        });

        api.get('/api/conversations/unread-count')
          .then((res) => {
            if (!cancelled) setMessageUnread(Number(res.data?.unreadTotal || 0));
          })
          .catch(() => {});
      } catch (err) {
        console.warn('Realtime connection unavailable:', err?.message || err);
      }
    };

    connectSocket();

    return () => {
      cancelled = true;
      if (socket) socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [user?._id]);

  useEffect(() => {
    if (user?.role !== 'admin') {
      setAdminReportCount(0);
      return undefined;
    }
    let cancelled = false;
    const refresh = () => {
      api.get('/api/admin/content-reports/summary')
        .then((res) => { if (!cancelled) setAdminReportCount(Number(res.data?.open) || 0); })
        .catch(() => {});
    };
    refresh();
    window.addEventListener(CONTENT_REPORTS_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(CONTENT_REPORTS_EVENT, refresh);
    };
  }, [user?._id, user?.role]);

  // Keep sidebar order/booking badges in sync
  useEffect(() => {
    const token = getSessionToken();
    if (!token || !user?._id) {
      setSellerOrderCount(0);
      setSellerBookingCount(0);
      setCustomerBookingCount(0);
      return undefined;
    }

    let cancelled = false;
    const refreshCounts = async () => {
      try {
        if (user.role === 'seller') {
          const [ordRes, bkRes] = await Promise.all([
            api.get('/api/orders'),
            api.get('/api/bookings'),
          ]);
          if (cancelled) return;
          const orders = Array.isArray(ordRes.data) ? ordRes.data : [];
          const bookings = Array.isArray(bkRes.data) ? bkRes.data : [];
          setSellerOrderCount(orders.length);
          setSellerBookingCount(bookings.filter((b) => ['pending', 'confirmed'].includes(String(b.status || '').toLowerCase())).length);
          setCustomerBookingCount(0);
        } else if (user.role === 'customer') {
          const bkRes = await api.get('/api/bookings');
          if (cancelled) return;
          const bookings = Array.isArray(bkRes.data) ? bkRes.data : [];
          setCustomerBookingCount(bookings.filter((b) => ['pending', 'confirmed'].includes(String(b.status || '').toLowerCase())).length);
          setSellerOrderCount(0);
          setSellerBookingCount(0);
        }
      } catch {
        /* keep previous counts */
      }
    };

    refreshCounts();
    const onBookingsUpdated = () => refreshCounts();
    window.addEventListener('bookings-updated', onBookingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('bookings-updated', onBookingsUpdated);
    };
  }, [user?._id, user?.role, liveOrderTick]);

  // Load Marketplace Catalogs (ignore stale responses after unmount / remount)
  const fetchMarketplaceData = () => {
    setCatalogStatus('loading');
    const requestId = Symbol('catalog');
    fetchMarketplaceData.currentRequest = requestId;

    Promise.allSettled([
      api.get('/api/businesses'),
      api.get('/api/products'),
      api.get('/api/services'),
    ]).then(([businessResult, productResult, serviceResult]) => {
      if (fetchMarketplaceData.currentRequest !== requestId) return;

      if (businessResult.status === 'fulfilled') {
        const list = Array.isArray(businessResult.value.data) ? businessResult.value.data : [];
        setBusinesses(list);
        dispatch({ type: 'SET_BUSINESSES', payload: list });
      } else {
        setBusinesses([]);
        dispatch({ type: 'SET_BUSINESSES', payload: [] });
      }
      setProducts(productResult.status === 'fulfilled' && Array.isArray(productResult.value.data) ? productResult.value.data : []);
      setServices(serviceResult.status === 'fulfilled' && Array.isArray(serviceResult.value.data) ? serviceResult.value.data : []);
      const failed = [businessResult, productResult, serviceResult].some((result) => result.status === 'rejected');
      setCatalogStatus(failed ? 'error' : 'ready');
    });
  };

  useEffect(() => {
    fetchMarketplaceData();
    return () => {
      fetchMarketplaceData.currentRequest = null;
    };
  }, [dispatch]);

  const fetchNotifications = () => {
    const token = getSessionToken();
    const requestUser = getSessionUser();
    const requestUserId = String(requestUser?._id || requestUser?.id || '');
    if (!token || !requestUserId) {
      setNotifications([]);
      return;
    }

    api
      .get('/api/notifications')
      .then((res) => {
        const currentUser = getSessionUser();
        const currentUserId = String(currentUser?._id || currentUser?.id || '');
        if (currentUserId !== requestUserId || getSessionToken() !== token) return;
        const notificationsData = Array.isArray(res.data) ? res.data : [];
        setNotifications(notificationsData);
      })
      .catch(() => {
        const currentUser = getSessionUser();
        const currentUserId = String(currentUser?._id || currentUser?.id || '');
        if (currentUserId === requestUserId) setNotifications([]);
      });
  };

  const handleClearNotifications = () => {
    api.put('/api/notifications/read', {}).then(() => {
      fetchNotifications();
    });
  };

  const savedBusinessIds = Array.isArray(user?.wishlist?.businesses) ? user.wishlist.businesses : [];
  const savedBusinessCount = new Set(
    savedBusinessIds.map((item) => String(item?._id || item?.id || item || '').trim()).filter(Boolean)
  ).size;

  const handleSaveBusinessToggle = async (businessId) => {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }

    const itemId = String(businessId || '').trim();
    if (!itemId) return false;

    const toIdList = (items) => (Array.isArray(items) ? items : [])
      .map((item) => String(item?._id || item?.id || item || '').trim())
      .filter(Boolean);

    const currentItems = toIdList(user.wishlist?.businesses);
    const isSaved = currentItems.includes(itemId);
    const updatedWishlist = {
      products: [],
      services: [],
      businesses: isSaved
        ? currentItems.filter((item) => item !== itemId)
        : [...currentItems, itemId],
    };

    try {
      const response = await api.put('/api/auth/wishlist', { wishlist: updatedWishlist });
      const savedWishlist = response.data?.wishlist || updatedWishlist;
      const serverUser = response.data?.user;
      const updatedUser = normalizeUser({
        ...(serverUser || user),
        wishlist: {
          products: [],
          services: [],
          businesses: toIdList(savedWishlist.businesses),
        },
      });
      persistUser(updatedUser);
      return !isSaved;
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.response?.data?.message || 'Unable to update saved businesses.' });
      return isSaved;
    }
  };

  const handleToggleSavedBusiness = async (typeOrId, maybeId) => {
    // Support both handleToggleSavedBusiness(businessId) and legacy (type, id)
    if (maybeId !== undefined) {
      if (typeOrId !== 'businesses') return false;
      return handleSaveBusinessToggle(maybeId);
    }
    return handleSaveBusinessToggle(typeOrId);
  };

  const handleLogout = () => {
    localStorage.setItem(getCartStorageKey(user), JSON.stringify(cart));
    endSession();
    setNotifications([]);
    Swal.fire({
      icon: 'success',
      title: lang === 'en' ? 'Signed Out' : 'साइन आउट भयो',
      text: lang === 'en' ? 'Logged out successfully.' : 'सफलतापूर्वक बाहिरिनुभयो।',
      timer: 1200,
      showConfirmButton: false,
    });
    navigate('/');
  };

  const openLoginPage = () => {
    navigate('/');
    setAuthMode('login');
    setShowAuthModal(true);
  };

  // The reset signs out every older session, including one still open in this browser.
  const handlePasswordReset = () => {
    if (!user) return;
    localStorage.setItem(getCartStorageKey(user), JSON.stringify(cart));
    endSession();
    setNotifications([]);
  };

  const handleAuthSuccess = (data) => {
    const normalizedUser = establishSession(data);
    setNotifications([]);
    fetchNotifications();

    // Customers land on the public homepage; sellers/admins go to their dashboards
    if (normalizedUser.role === 'admin') navigate('/admin');
    else if (normalizedUser.role === 'seller') navigate('/business');
    else {
      setDashboardTab(null);
      navigate('/');
    }
  };

  const openCart = () => {
    if (user?.role === 'customer' && location.pathname.startsWith('/customer')) {
      setDashboardTab('cart');
      if (location.pathname !== '/customer') navigate('/customer');
      return;
    }
    setCartOpen(true);
  };

  const handleOpenDashboard = (view) => {
    if (typeof view === 'string' && view.startsWith('category:')) {
      setMarketplaceCategory(view.slice('category:'.length));
      navigate('/');
    }
    else if (view === 'home') {
      setMarketplaceCategory('All');
      setDashboardTab(null);
      navigate('/');
    }
    else if (view === 'checkout') openCart();
    else if (view === 'saved' || view === 'wishlist') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setDashboardTab('saved');
      navigate('/customer');
    }
    else if (view === 'dashboard') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      // Customers treat "home" as the marketplace; open account area only when explicitly needed
      if (user.role === 'customer') {
        setDashboardTab(null);
        navigate('/');
        return;
      }
      setDashboardTab(user.role === 'seller' ? 'overview' : 'dashboard');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
    }
    else if (view === 'account' || view === 'customer-dashboard') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setDashboardTab(user.role === 'seller' ? 'overview' : 'dashboard');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
      else navigate('/customer');
    }
  };

  const handleMarketplaceSearch = (query) => {
    setMarketplaceCategory('All');
    const nextQuery = String(query || '').trim();
    setMarketplaceSearch(nextQuery);
    setDashboardTab(null);
    if (location.pathname !== '/') navigate('/');
  };

  const handleOpenBusinessProfile = (businessId) => {
    navigate(`/business-profile/${businessId}`);
  };

  useEffect(() => {
    if (!sessionNotice) return undefined;
    Swal.fire({
      icon: 'info',
      title: lang === 'en' ? 'Session ended' : 'सत्र समाप्त',
      text: sessionNotice,
    });
    clearSessionNotice();
    setNotifications([]);
    const onRecoveryPage = /^\/(forgot-password|reset-password)(\/|$)/.test(location.pathname);
    if (location.pathname !== '/' && !onRecoveryPage) navigate('/');
  }, [clearSessionNotice, lang, location.pathname, navigate, sessionNotice]);

  const handleSidebarNav = (tab) => {
    if (tab === 'cart') {
      openCart();
      return;
    }
    if (tab === 'messages') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setDashboardTab('messages');
      if (user.role === 'seller') navigate('/business?tab=messages');
      else if (user.role === 'customer') navigate('/customer/messages');
      return;
    }
    setDashboardTab(tab);
    if (user) {
      if (user.role === 'admin' && location.pathname !== '/admin') navigate('/admin');
      else if (user.role === 'seller' && location.pathname !== '/business') navigate('/business');
      else if (user.role === 'customer' && location.pathname !== '/customer') navigate('/customer');
    }
  };

  // Check if we are on a dashboard route (/business-profile must not match /business)
  const isDashboardRoute =
    location.pathname === '/business'
    || location.pathname.startsWith('/customer')
    || location.pathname.startsWith('/admin');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (location.pathname === '/business') {
      const tab = params.get('tab');
      if (tab === 'messages' || tab === 'bookings' || tab === 'orders') {
        setDashboardTab(tab);
      }
    }
    if (location.pathname.startsWith('/customer/messages')) {
      setDashboardTab('messages');
    }
  }, [location.pathname, location.search]);

  return (
    <div style={{ minHeight: '100vh', background: '#F5F6FA', fontFamily: "'Inter', sans-serif" }}>
      {/* Navbar / Sidebar — renders sidebar on dashboard routes, top bar otherwise */}
      <Navbar
        user={user}
        cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
        onOpenAuth={(mode = 'login') => { setAuthMode(mode); setShowAuthModal(true); }}
        onLogout={handleLogout}
        lang={lang}
        setLang={setLang}
        onOpenDashboard={handleOpenDashboard}
        onSearch={handleMarketplaceSearch}
        onOpenChat={() => {}}
        notifications={notifications}
        onClearNotifications={handleClearNotifications}
        activeTab={dashboardTab}
        onTabChange={handleSidebarNav}
        sidebarCounts={{
          productCount: user?.role === 'seller' ? sellerProductCount : products.length,
          catalogCount: user?.role === 'seller' ? sellerProductCount + sellerServiceCount : products.length,
          orderCount: user?.role === 'seller' ? sellerOrderCount : 0,
          bookingCount: user?.role === 'seller' ? sellerBookingCount : customerBookingCount,
          serviceCount: 0,
          cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
          savedBusinessCount,
          messageCount: messageUnread,
          reportCount: adminReportCount,
          notifCount: notifications.filter((n) => !n.read).length,
        }}
        businessOfferingType={sellerBusiness?.offeringType || user?.businessOfferingType || 'both'}
        hideSidebar={hideSellerSidebar}
      />

      {/* Global Modal Windows */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        lang={lang}
        initialMode={authMode}
      />

      {cartOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f8f2ea]" role="dialog" aria-modal="true" aria-label="Checkout">
          <Suspense fallback={<div className="mx-auto max-w-lg py-20 text-center text-sm text-slate-500">Loading checkout...</div>}>
          <CartCheckout
            cart={cart}
            user={user}
            lang={lang}
            onUpdateQty={(id, qty) => dispatch({ type: 'UPDATE_CART_QUANTITY', payload: { id, quantity: qty } })}
            onRemoveItem={(id) => dispatch({ type: 'REMOVE_FROM_CART', payload: id })}
            onClearCart={() => dispatch({ type: 'CLEAR_CART' })}
            onClose={() => setCartOpen(false)}
            onOrderSuccess={() => setCartOpen(false)}
          />
          </Suspense>
        </div>
      )}

      {(selectedBusinessId || selectedProductId) && (
        <DetailsModal
          businessId={selectedBusinessId}
          productId={selectedProductId}
          onClose={() => {
            setSelectedBusinessId(null);
            setSelectedProductId(null);
            if (location.pathname.startsWith('/product/')) {
              navigate('/');
            }
          }}
          onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
          lang={lang}
          user={user}
          onToggleWishlist={handleToggleSavedBusiness}
        />
      )}

      {/* Main Routes */}
      <main className={isDashboardRoute && user ? `app-content${hideSellerSidebar ? ' no-sidebar' : ''}` : ''}>
        <div className={isDashboardRoute && user ? `content-body${hideSellerSidebar ? ' content-body--flush' : ''}` : ''}>
          <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-slate-500">Loading page...</div>}>
          <Routes>
            <Route
              path="/"
              element={
                <Marketplace
                  user={user}
                  businesses={businesses}
                  products={products}
                  initialCategory={marketplaceCategory}
                  initialSearchQuery={marketplaceSearch}
                  catalogStatus={catalogStatus}
                  onRetryCatalog={fetchMarketplaceData}
                  lang={lang}
                  onOpenProduct={(id) => setSelectedProductId(id)}
                  onOpenBusiness={handleOpenBusinessProfile}
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onOpenDashboard={handleOpenDashboard}
                  onToggleWishlist={handleToggleSavedBusiness}
                />
              }
            />

            <Route
              path="/product/:id"
              element={
                <>
                  <DetailsPathWrapper setSelectedProductId={setSelectedProductId} />
                  <Marketplace
                    user={user}
                    businesses={businesses}
                    products={products}
                    initialCategory={marketplaceCategory}
                    initialSearchQuery={marketplaceSearch}
                  catalogStatus={catalogStatus}
                  onRetryCatalog={fetchMarketplaceData}
                    lang={lang}
                    onOpenProduct={(id) => setSelectedProductId(id)}
                    onOpenBusiness={handleOpenBusinessProfile}
                    onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                    onOpenDashboard={handleOpenDashboard}
                    onToggleWishlist={handleToggleSavedBusiness}
                  />
                </>
              }
            />

            <Route
              path="/checkout"
              element={
                <CartCheckout
                  cart={cart}
                  user={user}
                  lang={lang}
                  onUpdateQty={(id, qty) => dispatch({ type: 'UPDATE_CART_QUANTITY', payload: { id, quantity: qty } })}
                  onRemoveItem={(id) => dispatch({ type: 'REMOVE_FROM_CART', payload: id })}
                  onClearCart={() => dispatch({ type: 'CLEAR_CART' })}
                  onOrderSuccess={() => {
                    navigate('/');
                  }}
                />
              }
            />

            <Route
              path="/customer/messages"
              element={
                <RoleRoute user={user} allow={['customer']} authReady={authReady}>
                  <CustomerMessagesPage
                    user={user}
                    socket={socketRef.current}
                    onUnreadChange={setMessageUnread}
                  />
                </RoleRoute>
              }
            />

            <Route
              path="/customer"
              element={
                <RoleRoute user={user} allow={['customer']} authReady={authReady}>
                <CustomerDashboard
                  user={user}
                  lang={lang}
                  businesses={businesses}
                  products={products}
                  cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
                  onOpenProduct={(id) => setSelectedProductId(id)}
                  onOpenBusiness={handleOpenBusinessProfile}
                  onToggleSavedBusiness={handleToggleSavedBusiness}
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onOpenDashboard={handleOpenDashboard}
                  searchQuery={marketplaceSearch}
                  activeTab={dashboardTab}
                  onTabChange={setDashboardTab}
                  cartContent={(
                    <CartCheckout
                      embedded
                      cart={cart}
                      user={user}
                      lang={lang}
                      onUpdateQty={(id, qty) => dispatch({ type: 'UPDATE_CART_QUANTITY', payload: { id, quantity: qty } })}
                      onRemoveItem={(id) => dispatch({ type: 'REMOVE_FROM_CART', payload: id })}
                      onClearCart={() => dispatch({ type: 'CLEAR_CART' })}
                      onClose={() => handleOpenDashboard('home')}
                      onOrderSuccess={() => setDashboardTab('orders')}
                    />
                  )}
                />
                </RoleRoute>
              }
            />

            <Route
              path="/business-profile/:id"
              element={
                <BusinessProfilePage
                  user={user}
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onToggleWishlist={handleToggleSavedBusiness}
                  onRequireAuth={() => {
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                  onOpenChat={() => {}}
                  onOpenMessages={(conversationId) => {
                    navigate(conversationId ? `/customer/messages?c=${conversationId}` : '/customer/messages');
                  }}
                />
              }
            />

            <Route
              path="/business"
              element={
                <RoleRoute user={user} allow={['seller']} authReady={authReady}>
                  <SellerDashboard
                    user={user}
                    lang={lang}
                    onLogout={handleLogout}
                    liveOrderTick={liveOrderTick}
                    activeTab={dashboardTab}
                    onTabChange={setDashboardTab}
                    onOpenBusiness={handleOpenBusinessProfile}
                    notifications={notifications}
                    socket={socketRef.current}
                    onMessageUnreadChange={setMessageUnread}
                    onBusinessChanged={fetchMarketplaceData}
                  />
                </RoleRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <RoleRoute user={user} allow={['admin']} authReady={authReady}>
                  <AdminDashboard user={user} lang={lang} onLogout={handleLogout} liveOrderTick={liveOrderTick} activeTab={dashboardTab} onTabChange={setDashboardTab} />
                </RoleRoute>
              }
            />

            {/* Rider role temporarily removed */}
            <Route path="/forgot-password" element={<ForgotPasswordPage onBackToLogin={openLoginPage} />} />
            <Route path="/reset-password" element={<ResetPasswordPage onBackToLogin={openLoginPage} />} />
            <Route
              path="/reset-password/:token"
              element={<ResetPasswordPage onBackToLogin={openLoginPage} onPasswordReset={handlePasswordReset} />}
            />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/payment/esewa/success" element={<EsewaPaymentReturn outcome="success" />} />
            <Route path="/payment/esewa/failure" element={<EsewaPaymentReturn outcome="failure" />} />
            <Route path="/payment/esewa/simulator" element={<EsewaSimulator />} />
          </Routes>
          </Suspense>
        </div>
      </main>

      {/* Floating Chat & AI system */}
      <Suspense fallback={null}>
        <ChatAndAI user={user} lang={lang} />
      </Suspense>

      {/* Footer — only on non-dashboard pages */}
      {!isDashboardRoute && (
        <footer style={{
          borderTop: '1px solid #E5E7EB',
          background: '#FFFFFF',
          padding: '24px 0',
          textAlign: 'center',
          fontSize: 13,
          color: '#9CA3AF',
        }}>
          <div className="homepage-footer-content"><strong>UdyogConnect</strong><a href="#about">About</a><a href="#businesses">Businesses</a><a href="#products">Products</a><a href="#services">Services</a><a href="#contact">Help &amp; Contact</a><a href="#about">Privacy Policy</a><a href="#about">Terms &amp; Conditions</a><span>© 2026 UdyogConnect · Supporting local businesses in Nepal.</span></div>
        </footer>
      )}
    </div>
  );
}

export default App;
