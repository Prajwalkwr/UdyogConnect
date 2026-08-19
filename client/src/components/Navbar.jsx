import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  FiShoppingCart, FiBell, FiMessageSquare, FiUser, FiLogOut,
  FiSettings, FiGlobe, FiSearch, FiGrid, FiShoppingBag,
  FiHeart, FiStar, FiMapPin, FiCreditCard, FiUsers,
  FiPackage, FiTrendingUp, FiFileText, FiBriefcase,
  FiHome, FiMenu, FiX, FiChevronDown, FiZap, FiAward,
  FiBarChart2, FiTag, FiTruck
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
  { key: 'profile', label: 'My Profile', icon: FiUser },
  { key: 'products', label: 'Products', icon: FiPackage, countKey: 'productCount' },
  { key: 'services', label: 'Services', icon: FiSettings, countKey: 'serviceCount' },
  { key: 'orders', label: 'Orders', icon: FiShoppingBag, countKey: 'orderCount' },
  { key: 'reviews', label: 'Customers', icon: FiUsers },
  { key: 'ratings', label: 'Reviews & Ratings', icon: FiStar },
  { key: 'analytics', label: 'Analytics', icon: FiBarChart2 },
  { key: 'promos', label: 'Marketing', icon: FiTag },
  { key: 'settings', label: 'Business Settings', icon: FiSettings },
];

const customerNav = [
  { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { key: 'orders', label: 'My Orders', icon: FiShoppingBag },
  { key: 'wishlist', label: 'My Wishlist', icon: FiHeart },
  { key: 'cart', label: 'My Cart', icon: FiShoppingCart, countKey: 'cartCount' },
  { key: 'saved', label: 'Saved Businesses', icon: FiStar },
  { key: 'reviews', label: 'Reviews', icon: FiStar },
  { key: 'wallet', label: 'Wallet', icon: FiCreditCard },
  { key: 'profile', label: 'Settings', icon: FiSettings },
];

const adminNav = [
  { key: 'dashboard', label: 'Dashboard', icon: FiGrid },
  { key: 'users', label: 'Users', icon: FiUsers },
  { key: 'businesses', label: 'Businesses', icon: FiBriefcase },
  { key: 'products', label: 'Products', icon: FiPackage },
  { key: 'services', label: 'Services', icon: FiTruck },
  { key: 'orders', label: 'Orders', icon: FiShoppingBag },
  { key: 'payments', label: 'Payments', icon: FiCreditCard },
  { key: 'reports', label: 'Reports', icon: FiFileText },
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
  onOpenChat,
  notifications,
  onClearNotifications,
  activeTab,
  onTabChange,
  sidebarCounts,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    if (user?.role === 'seller') return sellerNav;
    return customerNav;
  };

  const navItems = getNavItems();

  // ── If NOT on a dashboard route, render a light top navbar ──
  if (!isDashboardRoute || !user) {
    return (
      <header className="sticky top-0 z-40 bg-[#0B1A30] text-white shadow-md border-b border-[#0B1A30]">
        <div className="public-nav-row mx-auto flex h-[76px] max-w-[1480px] items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
          <button
            onClick={() => onOpenDashboard('home')}
            className="flex items-center gap-3 rounded-full bg-transparent p-0 text-left cursor-pointer"
            aria-label="UdyogConnect home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F2B71D] to-[#E0A615] text-[#0B1A30] shadow-md shadow-[#F2B71D]/10">
              <FiHome className="h-5 w-5" />
            </div>
            <div className="public-nav-brand leading-none">
              <div className="text-[1.15rem] font-black tracking-[-0.02em] text-[#F2B71D]">UdyogConnect</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#A0A3BD]">Shop Local • Support Local</div>
            </div>
          </button>

          <div className="hidden flex-1 justify-center md:flex px-6">
            <div className="relative w-full max-w-[550px]">
              <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] h-4 w-4" />
              <input
                type="text"
                placeholder={translate('Search products, services or businesses...', 'उत्पादन, सेवा वा पसल खोज्नुहोस्...')}
                className="w-full rounded-lg border border-[#1E293B] bg-[#101E35] py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-[#94A3B8] outline-none transition focus:border-[#F2B71D] focus:ring-1 focus:ring-[#F2B71D]"
              />
            </div>
          </div>

          <div className="public-nav-actions flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
              className="flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#101E35] px-3 py-2 text-xs font-semibold text-[#F2B71D] transition hover:bg-[#1E293B] cursor-pointer"
            >
              <FiGlobe className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'EN' : 'ने'}</span>
              <FiChevronDown className="h-3 w-3 text-white/50" />
            </button>

            <button
              onClick={() => onOpenDashboard('wishlist')}
              className="relative rounded-lg border border-[#1E293B] bg-[#101E35] p-2 text-white transition hover:bg-[#1E293B] cursor-pointer"
              aria-label="Wishlist"
            >
              <FiHeart className="h-4.5 w-4.5 text-[#F2B71D]" />
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">
                2
              </span>
            </button>

            <div className="relative">
              <button
                onClick={() => { setShowNotifMenu(!showNotifMenu); setShowProfileMenu(false); }}
                className="relative rounded-lg border border-[#1E293B] bg-[#101E35] p-2 text-white transition hover:bg-[#1E293B] cursor-pointer"
                aria-label="Notifications"
              >
                <FiBell className="h-4.5 w-4.5 text-white" />
                {unreadNotifs.length > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0A615] px-1 text-[8px] font-bold text-[#0B1A30]">
                    {unreadNotifs.length}
                  </span>
                ) : (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0A615] px-1 text-[8px] font-bold text-[#0B1A30]">
                    4
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="absolute right-0 top-full mt-3 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#F0EAD6] bg-white text-[#0B1A30] shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-[#FFFBF0]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {translate('Notifications', 'सूचनाहरू')}
                    </span>
                    {unreadNotifs.length > 0 && (
                      <button
                        onClick={onClearNotifications}
                        className="text-[10px] font-bold text-[#E0A615] hover:text-[#0B1A30] bg-transparent border-none cursor-pointer"
                      >
                        {translate('Mark read', 'पढिएको')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {safeNotifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-gray-400">
                        {translate('No new notifications', 'कुनै नयाँ सूचना छैन')}
                      </div>
                    ) : (
                      safeNotifications.map((notif) => (
                        <div
                          key={notif._id}
                          className={`px-4 py-2.5 border-b border-gray-50 last:border-none transition hover:bg-gray-50 ${
                            !notif.read ? 'bg-[#FFFBF0]' : ''
                          }`}
                        >
                          <p className="text-xs font-bold text-[#0B1A30]">{notif.title}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => onOpenDashboard('checkout')}
              className="relative rounded-lg border border-[#1E293B] bg-[#101E35] p-2 text-white transition hover:bg-[#1E293B] cursor-pointer"
              aria-label="Cart"
            >
              <FiShoppingCart className="h-4.5 w-4.5 text-white" />
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F2B71D] px-1 text-[8px] font-bold text-[#0B1A30]">
                  {cartCount}
                </span>
              )}
            </button>

            {user ? (
              <button
                onClick={() => onOpenDashboard('dashboard')}
                className="flex items-center gap-2 rounded-lg border border-[#1E293B] bg-[#101E35] px-2.5 py-1.5 text-left transition hover:bg-[#1E293B] cursor-pointer"
              >
                <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#F2B71D] to-[#E0A615] text-xs font-bold text-[#0B1A30]">
                  {user?.profilePicture ? (
                    <img src={user.profilePicture} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="hidden sm:block">
                  <div className="text-[10px] font-bold text-white">{displayFirstName}</div>
                  <div className="text-[8px] text-[#A0A3BD]">{roleLabel}</div>
                </div>
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#F2B71D] hover:bg-[#E0A615] px-4 py-2 text-xs font-bold text-[#0B1A30] shadow-sm transition cursor-pointer"
              >
                <FiUser className="h-3.5 w-3.5" />
                {translate('Sign In', 'लगइन')}
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-[#1E293B] bg-[#0B1A30] md:hidden">
          <div className="mx-auto max-w-[1480px] px-3 py-2.5">
            <div className="relative">
              <FiSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] h-4 w-4" />
              <input
                type="text"
                placeholder={translate('Search products, services...', 'उत्पादन, सेवा खोज्नुहोस्...')}
                className="w-full rounded-lg border border-[#1E293B] bg-[#101E35] py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-[#94A3B8] outline-none"
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
      <div
        className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`app-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 8px' }}>
          <button
            onClick={() => onOpenDashboard('home')}
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
                    background: isActive ? 'rgba(26,26,46,0.15)' : 'rgba(242,183,29,0.15)',
                    color: isActive ? '#1A1A2E' : '#F2B71D',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 6px',
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Go Premium Card */}
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

      {/* Content-area Top Header */}
      <div className="content-header" style={{ marginLeft: 'var(--sidebar-width)' }}>
        {/* Mobile hamburger */}
        <button
          className="lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6B7280' }}
        >
          {mobileMenuOpen ? <FiX size={22} /> : <FiMenu size={22} />}
        </button>

        {/* Search */}
        <div style={{ flex: 1, maxWidth: 480 }} className="hidden lg:block">
          <div style={{ position: 'relative' }}>
            <FiSearch style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder={translate('Search users, businesses...', 'प्रयोगकर्ता, व्यवसाय खोज्नुहोस्...')}
              style={{
                width: '100%', borderRadius: 9999, border: '1px solid #E5E7EB',
                background: '#F9FAFB', padding: '10px 16px 10px 40px',
                fontSize: 13, color: '#1A1A2E', outline: 'none',
              }}
            />
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
                    onClick={() => { setShowProfileMenu(false); onOpenDashboard('dashboard'); }}
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
