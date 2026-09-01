import React, { useEffect, useState, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from './utils/api';
import Swal from 'sweetalert2';
import { normalizeUser } from './utils/authFlow';
import { readStoredJson, removeStoredValue } from './utils/storage';
import { io as socketIO } from 'socket.io-client';

// Import Modular Components
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import Marketplace from './components/Marketplace';
import DetailsModal from './components/DetailsModal';
import CartCheckout from './components/CartCheckout';
import ChatAndAI from './components/ChatAndAI';
import CustomerDashboard from './components/CustomerDashboard';
import SellerDashboard from './components/SellerDashboard';
import AdminDashboard from './components/AdminDashboard';
import PaymentSuccess from './components/PaymentSuccess';
import BusinessProfilePage from './components/business-profile/BusinessProfilePage';

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

function App() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const user = useSelector((state) => state.user);
  const cart = useSelector((state) => state.cart);

  // Global settings
  const [lang, setLang] = useState('en'); // 'en' | 'ne'
  const [notifications, setNotifications] = useState([]);
  const [liveOrderTick, setLiveOrderTick] = useState(0); // increments on new_order socket event

  // Socket ref
  const socketRef = useRef(null);

  // Data lists
  const [businesses, setBusinesses] = useState([]);
  const [products, setProducts] = useState([]);
  const sellerBusiness = user?.role === 'seller'
    ? businesses.find((business) => String(business.ownerId) === String(user._id || user.id))
    : null;

  // Modal open states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

  // Dashboard active tab (driven from sidebar)
  const [dashboardTab, setDashboardTab] = useState(null);

  // Sync token, notifications, and Socket.IO connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    const parsedUser = readStoredJson('user', null);

    if (token) {
      if (parsedUser) {
        const normalizedUser = normalizeUser(parsedUser);
        dispatch({ type: 'SET_USER', payload: normalizedUser });
      }
      fetchNotifications();

      // ── Real-time Socket.IO connection ────────────────────────
      const backendUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || window.location.origin;
      const socket = socketIO(backendUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });
      socketRef.current = socket;

      // Receive a notification pushed by the server in real-time
      socket.on('new_notification', () => {
        fetchNotifications();
        setLiveOrderTick((t) => t + 1);
      });

      // Receive a new_order event — trigger seller/admin dashboard refresh
      socket.on('new_order', () => {
        setLiveOrderTick((t) => t + 1);
      });

      socket.on('support_ticket_update', () => {
        setLiveOrderTick((t) => t + 1);
      });

      return () => {
        socket.disconnect();
        socketRef.current = null;
      };
    }
  }, [dispatch, user?._id]);

  // Load Marketplace Catalogs
  const fetchMarketplaceData = () => {
    api.get('/api/businesses')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setBusinesses(list);
        dispatch({ type: 'SET_BUSINESSES', payload: list });
      })
      .catch(() => {
        setBusinesses([]);
        dispatch({ type: 'SET_BUSINESSES', payload: [] });
      });

    api.get('/api/products')
      .then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        setProducts(items);
      })
      .catch(() => {
        setProducts([]);
      });
  };

  useEffect(() => {
    fetchMarketplaceData();
  }, [dispatch]);

  const fetchNotifications = () => {
    if (!localStorage.getItem('token')) {
      setNotifications([]);
      return;
    }

    api
      .get('/api/notifications')
      .then((res) => {
        const notificationsData = Array.isArray(res.data) ? res.data : [];
        setNotifications(notificationsData);
      })
      .catch(() => {
        setNotifications([]);
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
      return;
    }

    const currentItems = Array.isArray(user.wishlist?.[type]) ? user.wishlist[type] : [];
    const itemId = String(id);
    const isSaved = currentItems.some((item) => String(item?._id || item?.id || item) === itemId);
    const updatedWishlist = {
      products: Array.isArray(user.wishlist?.products) ? [...user.wishlist.products] : [],
      services: Array.isArray(user.wishlist?.services) ? [...user.wishlist.services] : [],
      businesses: Array.isArray(user.wishlist?.businesses) ? [...user.wishlist.businesses] : [],
    };
    updatedWishlist[type] = isSaved
      ? currentItems.filter((item) => String(item?._id || item?.id || item) !== itemId)
      : [...currentItems, id];

    try {
      await api.put('/api/auth/profile', { wishlist: updatedWishlist });
      const updatedUser = { ...user, wishlist: updatedWishlist };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      dispatch({ type: 'SET_USER', payload: updatedUser });
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.response?.data?.message || 'Unable to update wishlist.' });
    }
  };

  const handleLogout = () => {
    removeStoredValue('token');
    removeStoredValue('user');
    dispatch({ type: 'SET_USER', payload: null });
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
    const normalizedUser = normalizeUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    dispatch({ type: 'SET_USER', payload: normalizedUser });
    setNotifications([]);
    fetchNotifications();

    // Redirect to dashboards based on role
    if (normalizedUser.role === 'admin') navigate('/admin');
    else if (normalizedUser.role === 'seller') navigate('/business');
    else navigate('/customer');
  };

  const handleOpenDashboard = (view) => {
    if (view === 'home') navigate('/');
    else if (view === 'checkout') navigate('/checkout');
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
      setDashboardTab('dashboard');
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
      else navigate('/customer');
    }
  };

  const handleOpenBusinessProfile = (businessId) => {
    navigate(`/business-profile/${businessId}`);
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      removeStoredValue('token');
      removeStoredValue('user');
      dispatch({ type: 'SET_USER', payload: null });
      setNotifications([]);
      if (location.pathname !== '/') {
        navigate('/');
      }
    };

    const handleStorage = (event) => {
      if (event.key === 'token' && !event.newValue) {
        dispatch({ type: 'SET_USER', payload: null });
        setNotifications([]);
      }
    };

    window.addEventListener('api-unauthorized', handleUnauthorized);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('api-unauthorized', handleUnauthorized);
      window.removeEventListener('storage', handleStorage);
    };
  }, [dispatch, location.pathname, navigate]);

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
        onOpenChat={() => {}}
        notifications={notifications}
        onClearNotifications={handleClearNotifications}
        activeTab={dashboardTab}
        onTabChange={setDashboardTab}
        sidebarCounts={{
          productCount: products.length,
          orderCount: 0,
          serviceCount: 0,
          cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
          wishlistCount,
        }}
        businessOfferingType={sellerBusiness?.offeringType || user?.businessOfferingType || 'both'}
        hideSidebar={user?.role === 'seller' && !sellerBusiness}
      />

      {/* Global Modal Windows */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
        lang={lang}
        initialMode={authMode}
      />

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
      <main className={isDashboardRoute && user ? 'app-content' : ''}>
        <div className={isDashboardRoute && user ? 'content-body' : ''}>
          <Routes>
            <Route
              path="/"
              element={
                <Marketplace
                  user={user}
                  businesses={businesses}
                  products={products}
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
                    navigate('/customer');
                  }}
                />
              }
            />

            <Route
              path="/customer"
              element={
                <CustomerDashboard
                  user={user}
                  lang={lang}
                  businesses={businesses}
                  products={products}
                  onOpenProduct={(id) => setSelectedProductId(id)}
                  onOpenBusiness={handleOpenBusinessProfile}
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onOpenDashboard={handleOpenDashboard}
                  activeTab={dashboardTab}
                  onTabChange={setDashboardTab}
                />
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
              element={<SellerDashboard user={user} lang={lang} onLogout={handleLogout} liveOrderTick={liveOrderTick} activeTab={dashboardTab} onTabChange={setDashboardTab} notifications={notifications} />}
            />

            <Route path="/admin" element={<AdminDashboard user={user} lang={lang} liveOrderTick={liveOrderTick} activeTab={dashboardTab} onTabChange={setDashboardTab} />} />

            {/* Rider role temporarily removed */}
            <Route path="/payment-success" element={<PaymentSuccess />} />
          </Routes>
        </div>
      </main>

      {/* Floating Chat & AI system */}
      <ChatAndAI user={user} lang={lang} />

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
