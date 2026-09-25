import React from 'react';

export default function RoleRoute({ user, allow, authReady = true, children }) {
  if (!authReady) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center" role="status" aria-live="polite">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#F2B71D] border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl font-black text-slate-900">Sign in required</h1>
        <p className="mt-3 text-sm text-slate-500">Log in with an account that can open this dashboard.</p>
      </div>
    );
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center" role="alert">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-500">403</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">403 Forbidden</h1>
        <p className="mt-3 text-sm text-slate-500">You do not have permission to open this page.</p>
      </div>
    );
  }

  return children;
}
