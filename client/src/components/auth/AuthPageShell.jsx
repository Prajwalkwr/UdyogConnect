import React from 'react';
import { FiArrowLeft } from 'react-icons/fi';

export const authInputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-white py-3 pl-10 pr-4 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] outline-none transition focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/15';
export const authButtonClass = 'w-full rounded-xl bg-gradient-to-br from-[#F2B71D] to-[#D4A017] py-3 text-sm font-extrabold text-[#1A1A2E] shadow-[0_8px_18px_rgba(242,183,29,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60';

const SAFETY_POINTS = ['Reset links expire in 30 minutes', 'Each link can be used only once', 'We never email your password'];

export function BackToLogin({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-5 flex items-center gap-2 text-[13px] font-semibold text-[#6B7280] transition hover:text-[#1A1A2E]"
    >
      <FiArrowLeft />
      Back to Login
    </button>
  );
}

export default function AuthPageShell({ children }) {
  return (
    <section className="flex min-h-[calc(100vh-150px)] items-center justify-center bg-[#f8f2ea] px-4 py-10">
      <div className="grid w-full max-w-[860px] overflow-hidden rounded-3xl border border-[#E7E0D6] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] md:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden flex-col justify-center bg-gradient-to-b from-[#091c2e] to-[#0d2943] p-8 text-white md:flex">
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#F2B71D] to-[#D4A017] text-base text-[#1A1A2E]">🛒</div>
            <span className="text-lg font-extrabold">UdyogConnect</span>
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-[18px]">
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#F2B71D]">Account recovery</div>
            <h3 className="mb-2.5 mt-3 text-[26px] font-extrabold leading-tight text-white">Get back into your account safely.</h3>
            <p className="m-0 text-sm leading-relaxed text-[#dbeaf8]">We'll help you set a new password so you can keep shopping and selling locally.</p>
          </div>
          <div className="mt-5 grid gap-2.5">
            {SAFETY_POINTS.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-[13px] text-[#e6edf7]">
                <span className="inline-block h-2 w-2 rounded-full bg-[#F2B71D]" />
                {item}
              </div>
            ))}
          </div>
        </aside>
        <div className="px-6 py-8 sm:px-9">{children}</div>
      </div>
    </section>
  );
}
