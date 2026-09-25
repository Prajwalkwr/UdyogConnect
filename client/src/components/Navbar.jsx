import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FiShoppingCart, FiBell, FiMessageSquare, FiUser, FiLogOut,
  FiSettings, FiGlobe, FiSearch, FiGrid, FiShoppingBag,
  FiHeart, FiStar, FiMapPin, FiCreditCard, FiUsers,
  FiPackage, FiTrendingUp, FiFileText, FiBriefcase,
  FiHome, FiMenu, FiX, FiChevronDown, FiZap, FiAward,
  FiTag, FiTruck, FiMic
} from 'react-icons/fi';
import { getDashboardLabel } from '../utils/authFlow';

function UserAvatar({ user, name, size = 34, className = '' }) {
  const photo = user?.profilePicture;
  const initial = String(name || 'U').charAt(0).toUpperCase();
  if (photo) {
    return (
      <img
        src={photo}
        alt={name || 'Profile'}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #F2B71D, #D4A017)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: '#1A1A2E',
        fontSize: Math.max(11, Math.round(size * 0.38)),
      }}
    >
      {initial}
    </div>
  );
}

/* ─── Role-based sidebar nav configs ──────────────── */
const sellerNav = [
  { key: 'overview', label: 'Business Dashboard', icon: FiGrid },
  { key: 'catalog', label: 'Products & Services', icon: FiPackage, countKey: 'catalogCount' },
  { key: 'orders', label: 'Orders', icon: FiShoppingBag, countKey: 'orderCount' },
  { key: 'ratings', label: 'Reviews & Ratings', icon: FiStar },
  { key: 'promos', label: 'Marketing', icon: FiTag },
  { key: 'settings', label: 'Business Settings', icon: FiSettings },
];

const customerNav = [
  { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { key: 'orders', label: 'My Orders', icon: FiShoppingBag },
  { key: 'cart', label: 'My Cart', icon: FiShoppingCart, countKey: 'cartCount', badgeTone: 'danger' },
  { key: 'wishlist', label: 'Wishlist', icon: FiHeart, countKey: 'wishlistCount', badgeTone: 'danger' },
  { key: 'saved', label: 'Saved Businesses', icon: FiStar },
  { key: 'reviews', label: 'Reviews & Ratings', icon: FiAward },
  { key: 'wallet', label: 'My Wallet', icon: FiCreditCard },
  { key: 'addresses', label: 'Addresses', icon: FiMapPin },
  { key: 'settings', label: 'Settings', icon: FiSettings },
];

const adminNav = [
  { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { key: 'users', label: 'Users', icon: FiUsers },
  { key: 'businesses', label: 'Businesses', icon: FiBriefcase },
  { key: 'products', label: 'Products', icon: FiPackage },
  { key: 'services', label: 'Services', icon: FiTruck },
  { key: 'orders', label: 'Orders', icon: FiShoppingBag },
  { key: 'settings', label: 'Settings', icon: FiSettings },
];

export default function Navbar({
  user,
  cartCount,
  onOpenAuth,
  onLogout,
  lang,
  setLang,
  onOpenDashboard,
  onSearch,
  onOpenChat,
  notifications,
  onClearNotifications,
  activeTab,
  onTabChange,
  sidebarCounts,
  businessOfferingType = 'both',
  hideSidebar = false,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [publicMenuOpen, setPublicMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const location = useLocation();

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadNotifs = safeNotifications.filter((n) => !n.read);
  const displayName = user?.name || user?.fullName || user?.email || 'User';
  const displayFirstName = String(displayName).split(' ')[0] || 'User';
  const roleLabel = getDashboardLabel(user?.role, lang);
  const counts = sidebarCounts || {};

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  const isDashboardRoute = ['/business', '/customer', '/admin'].some((p) =>
    location.pathname.startsWith(p)
  );

  // Get nav items for current role
  const getNavItems = () => {
    if (user?.role === 'admin') return adminNav;
    if (user?.role === 'seller') return sellerNav.filter((item) => (
      (item.key !== 'products' || businessOfferingType !== 'services')
      && (item.key !== 'services' || businessOfferingType !== 'products')
    ));
    return customerNav;
  };

  const navItems = getNavItems();

  const openHomeOrDashboard = () => {
    if (!user || user.role === 'customer') onOpenDashboard('home');
    else onOpenDashboard('dashboard');
  };

  const openAccountArea = () => {
    if (!user) {
      onOpenAuth?.('login');
      return;
    }
    if (user.role === 'customer') onOpenDashboard('account');
    else onOpenDashboard('dashboard');
  };

  // ── If NOT on a dashboard route, render marketplace-style top navbar ──
  if (!isDashboardRoute || !user) {
    return (
      <header className="sticky top-0 z-40 border-b border-[#D9CFC0] bg-[#F7F1E8]/95 text-[#2C2118] shadow-[0_4px_24px_rgba(44,33,24,0.06)] backdrop-blur-md">
        <div className="public-nav-row mx-auto flex h-[76px] w-full items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
          <button
            onClick={openHomeOrDashboard}
            className="flex items-center gap-3 rounded-full bg-transparent p-0 text-left cursor-pointer"
            aria-label="UdyogConnect home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5C3D2E] text-[#F7F1E8] shadow-sm">
              <FiShoppingBag className="h-5 w-5" />
            </div>
            <div className="public-nav-brand leading-none">
              <div className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#5C3D2E]" style={{ fontFamily: 'var(--font-display)' }}>UdyogConnect</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#7A6A5C]">Shop Local • Support Local</div>
            </div>
          </button>

          <nav className="public-nav-links hidden items-center gap-6 xl:flex" aria-label="Primary navigation">
            {['Home', 'Businesses', 'Products', 'Community', 'Contact'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (item === 'Home') openHomeOrDashboard();
                  else document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="border-0 bg-transparent text-[13px] font-medium text-[#3F2A1F] transition hover:text-[#C9A227] cursor-pointer"
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="hidden flex-1 justify-center md:flex px-3 xl:px-5 max-w-md lg:max-w-lg">
            <div className="relative w-full">
              <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7A6A5C] h-4 w-4" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onSearch) {
                    onSearch(globalSearch);
                    openHomeOrDashboard();
                  }
                }}
                placeholder={translate('Search...', 'खोज्नुहोस्...')}
                className="w-full rounded-full border border-[#D9CFC0] bg-white py-2.5 pl-11 pr-11 text-sm text-[#2C2118] placeholder:text-[#9A8B7C] outline-none transition focus:border-[#C9A227] focus:ring-1 focus:ring-[#C9A227]/40"
              />
              <FiMic className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#7A6A5C] h-4 w-4" />
            </div>
          </div>

          <div className="public-nav-actions flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
              className="hidden sm:flex items-center gap-1 rounded-full border border-[#D9CFC0] bg-white px-3 py-2 text-xs font-semibold text-[#5C3D2E] transition hover:border-[#C9A227] cursor-pointer"
            >
              <FiGlobe className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'EN' : 'ने'}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); }}
                className="relative rounded-full border border-[#D9CFC0] bg-white p-2.5 text-[#5C3D2E] transition hover:border-[#C9A227] cursor-pointer"
                aria-label="Notifications"
              >
                <FiBell className="h-4 w-4" />
                {unreadNotifs.length > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C9A227] px-1 text-[8px] font-bold text-white">
                    {unreadNotifs.length}
                  </span>
                ) : null}
              </button>

              {showNotifMenu && (
                <div className="absolute right-0 top-full mt-3 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#D9CFC0] bg-white text-[#2C2118] shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#EFE8DE] bg-[#F7F1E8]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A6A5C]">
                      {translate('Notifications', 'सूचनाहरू')}
                    </span>
                    {unreadNotifs.length > 0 && (
                      <button
                        onClick={onClearNotifications}
                        className="text-[10px] font-bold text-[#C9A227] hover:text-[#5C3D2E] bg-transparent border-none cursor-pointer"
                      >
                        {translate('Mark read', 'पढिएको')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {safeNotifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-[#9A8B7C]">
                        {translate('No new notifications', 'कुनै नयाँ सूचना छैन')}
                      </div>
                    ) : (
                      safeNotifications.map((notif) => (
                        <div
                          key={notif._id}
                          className={`px-4 py-2.5 border-b border-[#F3EDE3] last:border-none transition hover:bg-[#F7F1E8] ${
                            !notif.read ? 'bg-[#FFF8E8]' : ''
                          }`}
                        >
                          <p className="text-xs font-bold text-[#2C2118]">{notif.title}</p>
                          <p className="text-[10px] text-[#7A6A5C] mt-0.5">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => onOpenDashboard('checkout')}
              className="relative rounded-full border border-[#D9CFC0] bg-white p-2.5 text-[#5C3D2E] transition hover:border-[#C9A227] cursor-pointer"
              aria-label="Cart"
            >
              <FiShoppingCart className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#C9A227] px-1 text-[8px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>

            {user ? (
              <button
                onClick={openAccountArea}
                className="flex items-center gap-2 rounded-full border border-[#D9CFC0] bg-white px-2.5 py-1.5 text-left transition hover:border-[#C9A227] cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#5C3D2E] text-xs font-bold text-white">
                  {user?.profilePicture ? (
                    <img src={user.profilePicture} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="hidden sm:block">
                  <div className="text-[10px] font-bold text-[#2C2118]">{displayFirstName}</div>
                  <div className="text-[8px] text-[#7A6A5C]">{roleLabel}</div>
                </div>
              </button>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  onClick={() => onOpenAuth('signup')}
                  className="rounded-full bg-[#C9A227] px-5 py-2.5 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#B8921F] cursor-pointer"
                >
                  Register
                </button>
                <button
                  onClick={() => onOpenAuth('login')}
                  className="rounded-full bg-[#5C3D2E] px-5 py-2.5 text-[12px] font-bold text-white transition hover:bg-[#3F2A1F] cursor-pointer"
                >
                  Login
                </button>
              </div>
            )}
            <button type="button" onClick={() => setPublicMenuOpen(!publicMenuOpen)} className="flex rounded-full border border-[#D9CFC0] bg-white p-2.5 text-[#5C3D2E] xl:hidden" aria-label="Open navigation"><FiMenu /></button>
          </div>
        </div>

        {publicMenuOpen && (
          <nav className="border-t border-[#D9CFC0] bg-[#F7F1E8] px-4 py-3 xl:hidden" aria-label="Mobile navigation">
            <div className="grid grid-cols-2 gap-2">
              {['Home', 'Businesses', 'Products', 'Community', 'Contact'].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setPublicMenuOpen(false);
                    if (item === 'Home') openHomeOrDashboard();
                    else document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#3F2A1F] hover:bg-white hover:text-[#C9A227]"
                >
                  {item}
                </button>
              ))}
            </div>
            {!user && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => onOpenAuth('signup')} className="flex-1 rounded-full bg-[#C9A227] py-2 text-xs font-bold text-white">Register</button>
                <button onClick={() => onOpenAuth('login')} className="flex-1 rounded-full bg-[#5C3D2E] py-2 text-xs font-bold text-white">Login</button>
              </div>
            )}
          </nav>
        )}

        <div className="border-t border-[#D9CFC0] bg-[#F7F1E8] md:hidden">
          <div className="px-3 py-2.5">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7A6A5C] h-4 w-4" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && onSearch) onSearch(globalSearch);
                }}
                placeholder={translate('Search...', 'खोज्नुहोस्...')}
                className="w-full rounded-full border border-[#D9CFC0] bg-white py-2.5 pl-11 pr-4 text-sm text-[#2C2118] placeholder:text-[#9A8B7C] outline-none"
              />
            </div>
          </div>
        </div>
      </header>
    );
  }

  // ── Dashboard route: Sidebar + Top Header ──
  return (
    <>
      {/* Mobile overlay */}
      {!hideSidebar && (
        <div
          className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      {!hideSidebar && (
        <aside className={`app-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 8px' }}>
          <button
            onClick={openHomeOrDashboard}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #F2B71D, #D4A017)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1A2E',
            }}>
              <FiShoppingCart style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>UdyogConnect</div>
              <div style={{ fontSize: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#A0A3BD' }}>Shop Local • Support Local</div>
            </div>
          </button>
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            const count = item.countKey ? counts[item.countKey] : null;

            return (
              <button
                key={item.key + item.label}
                onClick={() => {
                  if (item.key === 'cart') {
                    onOpenDashboard('checkout');
                    setMobileMenuOpen(false);
                    return;
                  }
                  if (onTabChange) onTabChange(item.key);
                  setMobileMenuOpen(false);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  background: isActive ? '#F2B71D' : 'transparent',
                  color: isActive ? '#1A1A2E' : '#A0A3BD',
                  border: 'none', cursor: 'pointer', width: '100%',
                  textAlign: 'left', fontSize: 14, fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#252542';
                    e.currentTarget.style.color = '#FFFFFF';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#A0A3BD';
                  }
                }}
              >
                <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {count != null && count > 0 && (
                  <span style={{
                    minWidth: 22, height: 20, borderRadius: 10,
                    background: item.badgeTone === 'danger'
                      ? (isActive ? 'rgba(220,38,38,0.9)' : '#EF4444')
                      : (isActive ? 'rgba(26,26,46,0.15)' : 'rgba(242,183,29,0.15)'),
                    color: item.badgeTone === 'danger' ? '#FFFFFF' : (isActive ? '#1A1A2E' : '#F2B71D'),
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 6px',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Customer promo / Seller premium */}
        {user?.role === 'customer' && (
          <div style={{
            margin: '0 12px 12px', padding: '14px',
            borderRadius: 16, background: 'linear-gradient(160deg, #152946, #0B1A30)',
            border: '1px solid rgba(242,183,29,0.22)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginBottom: 4, lineHeight: 1.3 }}>
              Support Local<br />Grow Together
            </div>
            <div style={{ fontSize: 11, color: '#A0A3BD', lineHeight: 1.45, marginBottom: 12 }}>
              Discover nearby shops and help your community thrive.
            </div>
            <button
              type="button"
              onClick={() => onOpenDashboard('home')}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 10,
                background: '#F2B71D', color: '#1A1A2E', border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Explore Businesses →
            </button>
          </div>
        )}
        {user?.role === 'seller' && (
          <div style={{
            margin: '0 12px 12px', padding: '16px',
            borderRadius: 16, background: 'linear-gradient(135deg, #252542, #1A1A3E)',
            border: '1px solid rgba(242,183,29,0.2)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>👑</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>Go Premium</div>
            <div style={{ fontSize: 11, color: '#A0A3BD', lineHeight: 1.5, marginBottom: 12 }}>
              Unlock more features for your business
            </div>
            <button style={{
              width: '100%', padding: '8px 0', borderRadius: 10,
              background: '#F2B71D', color: '#1A1A2E', border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              Upgrade Now
            </button>
          </div>
        )}

        {/* Help & Support + Logout */}
        <div style={{ padding: '8px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => {}}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 12,
              background: 'transparent', color: '#A0A3BD',
              border: 'none', cursor: 'pointer', width: '100%',
              textAlign: 'left', fontSize: 14, fontWeight: 500,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#252542'; e.currentTarget.style.color = '#FFFFFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A0A3BD'; }}
          >
            <FiMessageSquare style={{ width: 18, height: 18 }} />
            <span>{translate('Help & Support', 'सहायता')}</span>
          </button>
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 12,
              background: 'transparent', color: '#EF4444',
              border: 'none', cursor: 'pointer', width: '100%',
              textAlign: 'left', fontSize: 14, fontWeight: 500,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <FiLogOut style={{ width: 18, height: 18 }} />
            <span>{translate('Logout', 'लगआउट')}</span>
          </button>
        </div>
        </aside>
      )}

      {/* Content-area Top Header */}
      <div className="content-header" style={{ marginLeft: hideSidebar ? '0' : 'var(--sidebar-width)' }}>
        {/* Mobile hamburger */}
        <button
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6B7280' }}
        >
          {mobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: user?.role === 'customer' ? 720 : 520 }} className="hidden lg:block">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <FiSearch style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                type="text"
                placeholder={user?.role === 'customer'
                  ? translate('Search for products, services or businesses...', 'उत्पादन, सेवा वा व्यवसाय खोज्नुहोस्...')
                  : translate('Search users, businesses...', 'प्रयोगकर्ता, व्यवसाय खोज्नुहोस्...')}
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch?.(globalSearch);
                }}
                className="dashboard-global-search"
                style={{
                  width: '100%', borderRadius: 12, border: '1px solid #E5E7EB',
                  background: '#FFFFFF', padding: '11px 16px 11px 40px',
                  fontSize: 13, color: '#102341', outline: 'none',
                }}
              />
            </div>
            {user?.role === 'customer' && (
              <>
                <select
                  defaultValue="all"
                  aria-label="Categories"
                  style={{
                    borderRadius: 12, border: '1px solid #E5E7EB', background: '#FFFFFF',
                    padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#334155', outline: 'none',
                  }}
                >
                  <option value="all">All Categories</option>
                  <option value="grocery">Grocery</option>
                  <option value="food">Food & Beverages</option>
                  <option value="fashion">Fashion</option>
                  <option value="electronics">Electronics</option>
                </select>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12,
                  border: '1px solid #E5E7EB', background: '#FFFFFF', padding: '10px 12px',
                  fontSize: 12, fontWeight: 600, color: '#334155', whiteSpace: 'nowrap',
                }}>
                  <FiMapPin style={{ color: '#F2B71D', width: 14, height: 14 }} />
                  Kathmandu, Nepal
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              borderRadius: 9999, border: '1px solid #E5E7EB',
              background: '#F9FAFB', padding: '8px 10px',
              fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer',
            }}
          >
            <FiGlobe style={{ color: '#F2B71D', width: 14, height: 14 }} />
          </button>

          {user && (
            <button
              onClick={onOpenChat}
              style={{
                position: 'relative', borderRadius: 9999,
                border: '1px solid #E5E7EB', background: '#F9FAFB',
                padding: 8, cursor: 'pointer', color: '#6B7280',
              }}
            >
              <FiMessageSquare style={{ width: 16, height: 16 }} />
            </button>
          )}

          {/* Notifications */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); }}
              style={{
                position: 'relative', borderRadius: 9999,
                border: '1px solid #E5E7EB', background: '#F9FAFB',
                padding: 8, cursor: 'pointer', color: '#6B7280',
              }}
            >
              <FiBell style={{ width: 16, height: 16 }} />
              {unreadNotifs.length > 0 && (
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#F2B71D', color: '#1A1A2E',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{unreadNotifs.length}</span>
              )}
            </button>

            {showNotifMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                width: 300, background: '#FFFFFF', borderRadius: 16,
                border: '1px solid #E5E7EB', boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                zIndex: 60, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid #F3F4F6',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280' }}>
                    {translate('Notifications', 'सूचनाहरू')}
                  </span>
                  {unreadNotifs.length > 0 && (
                    <button onClick={onClearNotifications} style={{ fontSize: 12, fontWeight: 500, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {translate('Mark read', 'पढिएको')}
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {safeNotifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                      {translate('No new notifications', 'कुनै नयाँ सूचना छैन')}
                    </div>
                  ) : (
                    safeNotifications.map((notif) => (
                      <div key={notif._id} style={{
                        padding: '10px 16px',
                        background: !notif.read ? '#FFFBEB' : 'transparent',
                      }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>{notif.title}</p>
                        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>{notif.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cart */}
          <button
            onClick={() => onOpenDashboard('checkout')}
            style={{
              position: 'relative', borderRadius: 9999,
              border: '1px solid #E5E7EB', background: '#F9FAFB',
              padding: 8, cursor: 'pointer', color: '#6B7280',
            }}
          >
            <FiShoppingCart style={{ width: 16, height: 16 }} />
            {cartCount > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: -2,
                width: 16, height: 16, borderRadius: '50%',
                background: '#F2B71D', color: '#1A1A2E',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{cartCount}</span>
            )}
          </button>

          {/* User Profile */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowProfileMenu(!showProfileMenu); setShowNotifMenu(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                borderRadius: 9999, border: '1px solid #E5E7EB',
                background: '#F9FAFB', padding: '4px 14px 4px 4px',
                cursor: 'pointer',
              }}
            >
              <UserAvatar user={user} name={displayName} size={34} />
              <div className="hidden sm:block" style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{displayFirstName}</div>
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{roleLabel}</div>
              </div>
              <FiChevronDown style={{ width: 14, height: 14, color: '#9CA3AF' }} className="hidden sm:block" />
            </button>

            {showProfileMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                width: 220, background: '#FFFFFF', borderRadius: 16,
                border: '1px solid #E5E7EB', boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
                zIndex: 60, overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF', margin: 0 }}>
                    {translate('Signed in as', 'लगइन गरिएको')}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</p>
                  <span style={{
                    display: 'inline-block', marginTop: 8,
                    padding: '2px 10px', borderRadius: 9999,
                    background: '#FEF9E7', color: '#D4A017',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{roleLabel}</span>
                </div>
                <div style={{ padding: 4 }}>
                  <button
                    onClick={() => { setShowProfileMenu(false); openAccountArea(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 13, color: '#1A1A2E', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <FiSettings style={{ color: '#9CA3AF', width: 16, height: 16 }} />
                    {getDashboardLabel(user?.role, lang)}
                  </button>
                  <button
                    onClick={() => { setShowProfileMenu(false); onLogout(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 12px', borderRadius: 10,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: 13, color: '#EF4444', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF2F2'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <FiLogOut style={{ width: 16, height: 16 }} />
                    {translate('Sign Out', 'साइन आउट')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
