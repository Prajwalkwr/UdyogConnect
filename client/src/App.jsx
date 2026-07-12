import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import Swal from 'sweetalert2';

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
import RiderDashboard from './components/RiderDashboard';

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
  const [currency, setCurrency] = useState('NPR'); // 'NPR' | 'USD'
  const [notifications, setNotifications] = useState([]);

  // Data lists
  const [businesses, setBusinesses] = useState([]);
  const [products, setProducts] = useState([]);

  // Modal open states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

  // Sync token and notifications
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      const parsed = JSON.parse(savedUser);
      dispatch({ type: 'SET_USER', payload: parsed });
      fetchNotifications(token);

      // Poll notifications every 8 seconds
      const interval = setInterval(() => {
        fetchNotifications(token);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [dispatch]);

  // Load Marketplace Catalogs
  const fetchMarketplaceData = () => {
    axios.get('/api/businesses').then((res) => {
      setBusinesses(res.data);
      dispatch({ type: 'SET_BUSINESSES', payload: res.data });
    });
    axios.get('/api/products').then((res) => {
      setProducts(res.data);
    });
  };

  useEffect(() => {
    fetchMarketplaceData();
  }, [dispatch]);

  const fetchNotifications = (token) => {
    axios
      .get('/api/notifications', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setNotifications(res.data))
      .catch(() => {});
  };

  const handleClearNotifications = () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.put('/api/notifications/read', {}, { headers: { Authorization: `Bearer ${token}` } }).then(() => {
      fetchNotifications(token);
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch({ type: 'SET_USER', payload: null });
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
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    dispatch({ type: 'SET_USER', payload: data.user });
    fetchNotifications(data.token);

    // Redirect to dashboards based on role
    if (data.user.role === 'admin') navigate('/admin');
    else if (data.user.role === 'seller') navigate('/business');
    else if (data.user.role === 'rider') navigate('/rider');
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
      else if (user.role === 'rider') navigate('/rider');
      else navigate('/customer');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.1),_transparent_40%),linear-gradient(135deg,_#07111c_0%,_#0f1f2d_100%)] text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950 flex flex-col justify-between">
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
              element={<SellerDashboard user={user} lang={lang} currency={currency} />}
            />

            <Route path="/admin" element={<AdminDashboard user={user} lang={lang} />} />

            <Route path="/rider" element={<RiderDashboard user={user} lang={lang} />} />
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
