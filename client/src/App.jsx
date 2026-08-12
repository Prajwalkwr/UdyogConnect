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
  const [currency, setCurrency] = useState('Rs.'); // 'Rs.' | 'USD'
  const [notifications, setNotifications] = useState([]);
  const [liveOrderTick, setLiveOrderTick] = useState(0); // increments on new_order socket event

  // Socket ref
  const socketRef = useRef(null);

  // Data lists
  const [businesses, setBusinesses] = useState([]);
  const [products, setProducts] = useState([]);

  // Modal open states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

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
      });

      // Receive a new_order event — trigger seller/admin dashboard refresh
      socket.on('new_order', () => {
        setLiveOrderTick((t) => t + 1);
      });

      return () => {
        socket.disconnect();
        socketRef.current = null;
      };
    }
  }, [dispatch]);

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
    else if (view === 'dashboard') {
      if (!user) {
        setShowAuthModal(true);
        return;
      }
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'seller') navigate('/business');
      else navigate('/customer');
    }
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950 flex flex-col justify-between">
      <div>
        {/* Sticky Header Navbar */}
        <Navbar
          user={user}
          cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)}
          onOpenAuth={() => setShowAuthModal(true)}
          onLogout={handleLogout}
          lang={lang}
          setLang={setLang}
          currency={currency}
          setCurrency={setCurrency}
          onOpenDashboard={handleOpenDashboard}
          onOpenChat={() => {
            // Triggers floating chat visibility in children automatically
          }}
          notifications={notifications}
          onClearNotifications={handleClearNotifications}
        />

        {/* Global Modal Windows */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleAuthSuccess}
          lang={lang}
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
            currency={currency}
            lang={lang}
            user={user}
          />
        )}

        {/* Main Routes */}
        <main className="pb-16">
          <Routes>
            <Route
              path="/"
              element={
                <Marketplace
                  user={user}
                  businesses={businesses}
                  products={products}
                  currency={currency}
                  lang={lang}
                  onOpenProduct={(id) => setSelectedProductId(id)}
                  onOpenBusiness={(id) => setSelectedBusinessId(id)}
                  onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                  onOpenDashboard={handleOpenDashboard}
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
                    currency={currency}
                    lang={lang}
                    onOpenProduct={(id) => setSelectedProductId(id)}
                    onOpenBusiness={(id) => setSelectedBusinessId(id)}
                    onAddToCart={(item) => dispatch({ type: 'ADD_TO_CART', payload: item })}
                    onOpenDashboard={handleOpenDashboard}
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
                  currency={currency}
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
                  currency={currency}
                  onOpenProduct={(id) => setSelectedProductId(id)}
                />
              }
            />

            <Route
              path="/business"
              element={<SellerDashboard user={user} lang={lang} currency={currency} onLogout={handleLogout} liveOrderTick={liveOrderTick} />}
            />

            <Route path="/admin" element={<AdminDashboard user={user} lang={lang} liveOrderTick={liveOrderTick} />} />

            {/* Rider role temporarily removed */}
            <Route path="/payment-success" element={<PaymentSuccess />} />
          </Routes>
        </main>
      </div>

      {/* Floating Chat & AI system */}
      <ChatAndAI user={user} lang={lang} />

      {/* Footer copyright section */}
      <footer className="border-t border-slate-900 bg-slate-950/40 py-6 text-center text-xs text-slate-500">
        UdyogConnect © 2026 · For local small businesses and customers in Nepal.
      </footer>
    </div>
  );
}

export default App;
