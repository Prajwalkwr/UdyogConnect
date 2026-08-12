import React, { useState } from 'react';
import { FiShoppingCart, FiBell, FiMessageSquare, FiUser, FiLogOut, FiSettings, FiGlobe, FiDollarSign } from 'react-icons/fi';

export default function Navbar({
  user,
  cartCount,
  onOpenAuth,
  onLogout,
  lang,
  setLang,
  currency,
  setCurrency,
  onOpenDashboard,
  onOpenChat,
  notifications,
  onClearNotifications,
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadNotifs = safeNotifications.filter((n) => !n.read);

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <button
          onClick={() => onOpenDashboard('home')}
          className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-xl font-black tracking-wider text-transparent transition hover:opacity-90 sm:text-2xl"
        >
          UdyogConnect
        </button>

        {/* Action controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'en' ? 'ne' : 'en')}
            className="flex items-center gap-1 rounded-lg border border-slate-850 bg-slate-900/60 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title="Switch Language"
          >
            <FiGlobe className="text-emerald-400" />
            <span>{lang === 'en' ? 'EN' : 'नेपाली'}</span>
          </button>

          {/* Currency Switcher */}
          <button
            onClick={() => setCurrency(currency === 'NPR' ? 'USD' : 'NPR')}
            className="flex items-center gap-1 rounded-lg border border-slate-850 bg-slate-900/60 px-2 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title="Switch Currency"
          >
            <FiDollarSign className="text-amber-400" />
            <span>{currency}</span>
          </button>

          {/* Chat Launcher */}
          {user && (
            <button
              onClick={onOpenChat}
              className="relative rounded-full border border-slate-800 bg-slate-900/40 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
              title="Chat Messages"
            >
              <FiMessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifMenu(!showNotifMenu);
                setShowProfileMenu(false);
              }}
              className="relative rounded-full border border-slate-800 bg-slate-900/40 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <FiBell className="h-4 w-4 sm:h-5 sm:w-5" />
              {unreadNotifs.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {unreadNotifs.length}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-3 w-72 origin-top-right rounded-2xl border border-slate-800 bg-slate-900 p-2 shadow-2xl ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {translate('Notifications', 'सूचनाहरू')}
                  </span>
                  {unreadNotifs.length > 0 && (
                    <button
                      onClick={onClearNotifications}
                      className="text-[11px] font-medium text-emerald-400 hover:underline"
                    >
                      {translate('Mark read', 'पढिएको चिन्ह लगाउनुहोस्')}
                    </button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {safeNotifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500">
                      {translate('No new notifications', 'कुनै नयाँ सूचना छैन')}
                    </div>
                  ) : (
                    safeNotifications.map((notif) => (
                      <div
                        key={notif._id}
                        className={`rounded-lg px-3 py-2 text-xs transition hover:bg-slate-800/50 ${
                          !notif.read ? 'bg-slate-850/40 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        <p className="text-slate-200">{notif.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-450 leading-relaxed">{notif.message}</p>
                        <span className="mt-1 block text-[9px] text-slate-500">
                          {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Cart Icon */}
          <button
            onClick={() => onOpenDashboard('checkout')}
            className="relative rounded-full border border-slate-800 bg-slate-900/40 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
            title="Shopping Cart"
          >
            <FiShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">
                {cartCount}
              </span>
            )}
          </button>

          {/* User Section */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => {
                  setShowProfileMenu(!showProfileMenu);
                  setShowNotifMenu(false);
                }}
                className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 p-1 pr-3 hover:bg-slate-800"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 font-bold text-slate-950">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="hidden text-xs font-semibold text-slate-350 sm:inline">
                  {user.name.split(' ')[0]}
                </span>
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-3 w-56 origin-top-right rounded-2xl border border-slate-800 bg-slate-900 p-1.5 shadow-2xl ring-1 ring-black/5 z-55">
                  <div className="border-b border-slate-850 px-3 py-2 text-left">
                    <p className="text-xs text-slate-400 font-medium">{translate('Signed in as', 'लगइन गरिएको')}</p>
                    <p className="truncate text-sm font-bold text-slate-200">{user.email}</p>
                    <span className="mt-1 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 border border-amber-550/20">
                      {user.role}
                    </span>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenDashboard('dashboard');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                      <FiSettings className="text-slate-400" />
                      <span>{translate('User Dashboard', 'प्रयोगकर्ता ड्यासबोर्ड')}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onLogout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-400 hover:bg-rose-950/20"
                    >
                      <FiLogOut />
                      <span>{translate('Sign Out', 'साइन आउट')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/10 transition duration-200 hover:scale-105 hover:shadow-amber-500/20"
            >
              <FiUser />
              <span>{translate('Sign In', 'लगइन')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
