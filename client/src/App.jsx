import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from './utils/api';
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
const BusinessProfilePage = lazy(() => import('./components/business-profile/BusinessProfilePage'));
const CartCheckout = lazy(() => import('./components/CartCheckout'));
const ChatAndAI = lazy(() => import('./components/ChatAndAI'));

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
  const cartOwnerRef = useRef(null);
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
  const [cartOpen, setCartOpen] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState('loading');

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
        });
        socket.on('new_order', () => setLiveOrderTick((t) => t + 1));
        socket.on('support_ticket_update', () => setLiveOrderTick((t) => t + 1));
        socket.on('connect_error', () => {
          // Socket failure must never block the UI.
        });
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

  const wishlist = user?.wishlist || {};
  const wishlistCount = ['products', 'businesses', 'services'].reduce((total, type) => {
    const items = Array.isArray(wishlist[type]) ? wishlist[type] : [];
    return total + new Set(items.map((item) => String(item?._id || item?.id || item))).size;
  }, 0);

  const handleWishlistToggle = async (type, id) => {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }

    const itemId = String(id || '').trim();
    if (!itemId) return false;

    const toIdList = (items) => (Array.isArray(items) ? items : [])
      .map((item) => String(item?._id || item?.id || item || '').trim())
      .filter(Boolean);

    const currentItems = toIdList(user.wishlist?.[type]);
    const isSaved = currentItems.includes(itemId);
    const updatedWishlist = {
      products: toIdList(user.wishlist?.products),
      services: toIdList(user.wishlist?.services),
      businesses: toIdList(user.wishlist?.businesses),
    };
    updatedWishlist[type] = isSaved
      ? currentItems.filter((item) => item !== itemId)
      : [...currentItems, itemId];

    try {
      const response = await api.put('/api/auth/wishlist', { wishlist: updatedWishlist });
      const savedWishlist = response.data?.wishlist || updatedWishlist;
      const serverUser = response.data?.user;
      const updatedUser = normalizeUser({
        ...(serverUser || user),
        wishlist: savedWishlist,
      });
      persistUser(updatedUser);
      return !isSaved;
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.response?.data?.message || 'Unable to update wishlist.' });
      return isSaved;
    }
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
    else if (view === 'checkout') setCartOpen(true);
    else if (view === 'wishlist') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setDashboardTab('wishlist');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
      else navigate('/customer');
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
      setDashboardTab('dashboard');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
    }
    else if (view === 'account' || view === 'customer-dashboard') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      setDashboardTab('dashboard');
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
    if (location.pathname !== '/') navigate('/');
  }, [clearSessionNotice, lang, location.pathname, navigate, sessionNotice]);

  const handleSidebarNav = (tab) => {
    if (tab === 'cart') {
      setCartOpen(true);
      return;
    }
    setDashboardTab(tab);
    if (user) {
      if (user.role === 'admin' && location.pathname !== '/admin') navigate('/admin');
      else if (user.role === 'seller' && location.pathname !== '/business') navigate('/business');
      else if (user.role === 'customer' && location.pathname !== '/customer') navigate('/customer');
    }
  };

  // Check if we are on a dashboard route
  const isDashboardRoute = ['/business', '/customer', '/admin'].some((p) =>
    location.pathname.startsWith(p)
  );

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
          orderCount: 0,
          serviceCount: 0,
          cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
          wishlistCount,
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
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
          <Suspense fallback={<div className="mx-auto max-w-lg py-20 text-center text-sm text-white">Loading checkout...</div>}>
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
          onToggleWishlist={handleWishlistToggle}
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
                  onToggleWishlist={handleWishlistToggle}
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
                    onToggleWishlist={handleWishlistToggle}
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
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onOpenDashboard={handleOpenDashboard}
                  searchQuery={marketplaceSearch}
                  activeTab={dashboardTab}
                  onTabChange={setDashboardTab}
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
                  onToggleWishlist={handleWishlistToggle}
                  onRequireAuth={() => {
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                  onOpenChat={() => {}}
                />
              }
            />

            <Route
              path="/business"
              element={
                <RoleRoute user={user} allow={['seller']} authReady={authReady}>
                  <SellerDashboard user={user} lang={lang} onLogout={handleLogout} liveOrderTick={liveOrderTick} activeTab={dashboardTab} onTabChange={setDashboardTab} onOpenBusiness={handleOpenBusinessProfile} notifications={notifications} />
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
            <Route path="/payment-success" element={<PaymentSuccess />} />
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
