import React, { useState, useEffect, useRef } from 'react';
import {
  FiX, FiMail, FiLock, FiUser, FiPhone, FiAlertCircle,
  FiEye, FiEyeOff, FiCheck, FiArrowLeft, FiShield,
  FiRefreshCw
} from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';

const getAuthErrorMessage = (err, fallback = 'Login failed. Check your credentials.') => {
  return err?.response?.data?.message || err?.response?.statusText || err?.message || fallback;
};

/* ─── Password Strength Helpers ─────────────────────────────────── */
function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: 'Weak',      color: '#ef4444' };
  if (score === 2) return { score, label: 'Fair',      color: '#f59e0b' };
  if (score === 3) return { score, label: 'Good',      color: '#3b82f6' };
  if (score === 4) return { score, label: 'Strong',    color: '#10b981' };
  return            { score, label: 'Very Strong', color: '#8b5cf6' };
}

const REQ = [
  { re: /.{8,}/,          label: 'At least 8 characters' },
  { re: /[A-Za-z]/,       label: 'Contains a letter'     },
  { re: /[0-9]/,          label: 'Contains a number'     },
  { re: /[^A-Za-z0-9]/,  label: 'Special character (recommended)' },
];

/* ─── Small sub-components ──────────────────────────────────────── */
function PasswordInput({ id, placeholder, value, onChange, showPw, onToggle, error }) {
  return (
    <div className="relative">
      <FiLock className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
      <input
        id={id}
        type={showPw ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={id === 'signup-password' ? 'new-password' : 'current-password'}
        className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
          error
            ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30'
            : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
        }`}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-200 transition"
        tabIndex={-1}
        aria-label={showPw ? 'Hide password' : 'Show password'}
      >
        {showPw ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
      </button>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
          <FiAlertCircle className="shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-400">
      <FiAlertCircle className="shrink-0" /> {msg}
    </p>
  );
}

function StrengthBar({ password }) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  const pct = Math.round((score / 5) * 100);
  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[11px]" style={{ color }}>{label}</p>
    </div>
  );
}

function PasswordRequirements({ password }) {
  return (
    <ul className="mt-2 space-y-1">
      {REQ.map((r) => {
        const ok = r.re.test(password);
        return (
          <li key={r.label} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-emerald-400' : 'text-slate-500'}`}>
            <FiCheck className={`shrink-0 transition ${ok ? 'opacity-100' : 'opacity-30'}`} />
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

/* ─── OTP Input (6 boxes) ───────────────────────────────────────── */
function OtpBoxes({ value, onChange }) {
  const inputs = useRef([]);
  const digits = (value + '      ').slice(0, 6).split('');

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      const next = [...digits];
      if (next[i] && next[i].trim()) {
        next[i] = '';
        onChange(next.join('').trim());
      } else if (i > 0) {
        inputs.current[i - 1]?.focus();
      }
      return;
    }
    if (/^\d$/.test(e.key)) {
      const next = [...digits];
      next[i] = e.key;
      const joined = next.join('').trim();
      onChange(joined);
      if (i < 5) inputs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(paste);
    inputs.current[Math.min(paste.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d.trim()}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onChange={() => {}} // controlled via onKeyDown
          className="h-12 w-10 rounded-xl border border-slate-700 bg-slate-950/60 text-center text-lg font-bold text-white outline-none transition focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 caret-amber-400"
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                                    */
/* ══════════════════════════════════════════════════════════════════ */
export default function AuthModal({ isOpen, onClose, onAuthSuccess, lang }) {
  // mode: 'login' | 'signup' | 'verify' | 'forgot' | 'forgot-otp' | 'reset' | '2fa'
  const [mode, setMode] = useState('login');

  // Shared fields
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Signup-specific
  const [name, setName]             = useState('');
  const [phone, setPhone]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [role, setRole]             = useState('customer');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // OTP / verification
  const [otp, setOtp]         = useState('');
  const [otpTimer, setOtpTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Show/hide passwords
  const [showPw, setShowPw]         = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [showNewPw, setShowNewPw]   = useState(false);

  // Reset password
  const [newPassword, setNewPassword]     = useState('');
  const [confirmNewPw, setConfirmNewPw]   = useState('');

  // UI state
  const [loading, setLoading]   = useState(false);
  const [globalErr, setGlobalErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const t = (en, ne) => (lang === 'en' ? en : ne);

  // Reset form when modal closes/opens or mode changes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setMode('login');
        resetAll();
      }, 300);
    }
  }, [isOpen]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (mode !== 'verify' && mode !== 'forgot-otp' && mode !== '2fa') return;
    setOtpTimer(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setOtpTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [mode]);

  const resetAll = () => {
    setEmail(''); setPassword(''); setName(''); setPhone('');
    setConfirmPw(''); setRole('customer'); setAgreeTerms(false);
    setOtp(''); setNewPassword(''); setConfirmNewPw('');
    setShowPw(false); setShowConfirmPw(false); setShowNewPw(false);
    setGlobalErr(''); setFieldErrors({}); setLoading(false);
  };

  const switchMode = (m) => { setGlobalErr(''); setFieldErrors({}); setOtp(''); setMode(m); };

  /* ── Validation Helpers ── */
  const validate = {
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.',
    password: (v) => {
      if (!v) return 'Password is required.';
      if (v.length < 8) return 'Minimum 8 characters required.';
      if (!/[A-Za-z]/.test(v)) return 'Must contain at least one letter.';
      if (!/[0-9]/.test(v)) return 'Must contain at least one number.';
      return '';
    },
    name: (v) => v.trim().length < 2 ? 'Full name must be at least 2 characters.' : '',
    phone: (v) => v && !/^[+\d\s\-()]{7,15}$/.test(v) ? 'Enter a valid phone number (digits only).' : '',
    confirmPw: (pw, cpw) => pw !== cpw ? 'Passwords do not match.' : '',
    otp: (v) => v.length !== 6 ? 'Enter the 6-digit code.' : '',
  };

  /* Phone key filter — only allow digits, +, -, space, (, ) */
  const handlePhoneKeyDown = (e) => {
    const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
    if (allowed.includes(e.key)) return;
    if (/^[\d+\-() ]$/.test(e.key)) return;
    e.preventDefault();
  };

  const handlePhonePaste = (e) => {
    const pasted = e.clipboardData.getData('text');
    if (!/^[+\d\s\-()]+$/.test(pasted)) {
      e.preventDefault();
    }
  };

  /* ── Quick Demo Login ── */
  const handleQuickLogin = async (qEmail, qPw, label) => {
    setGlobalErr(''); setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { email: qEmail, password: qPw });
      Swal.fire({ icon: 'success', title: t('Welcome!', 'स्वागत छ!'), text: `${label} login successful.`, timer: 1500, showConfirmButton: false });
      onAuthSuccess(res.data);
      onClose();
    } catch (err) {
      setGlobalErr(getAuthErrorMessage(err, 'Login failed.'));
    } finally { setLoading(false); }
  };

  /* ── Main Submit Handler ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalErr(''); setFieldErrors({});

    // ── LOGIN ────────────────────────────────────────────────────
    if (mode === 'login') {
      const errs = {};
      errs.email    = validate.email(email);
      errs.password = !password ? 'Password is required.' : '';
      if (Object.values(errs).some(Boolean)) { setFieldErrors(errs); return; }

      setLoading(true);
      try {
        const res = await axios.post('/api/auth/login', { email, password });
        if (res.data.require2FA) { switchMode('2fa'); setLoading(false); return; }
        Swal.fire({ icon: 'success', title: t('Welcome Back!', 'स्वागत छ!'), text: t('Login successful.', 'लगइन सफल भयो।'), timer: 1500, showConfirmButton: false });
        onAuthSuccess(res.data);
        onClose();
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err));
      } finally { setLoading(false); }
    }

    // ── 2FA ──────────────────────────────────────────────────────
    else if (mode === '2fa') {
      if (otp.length !== 6) { setFieldErrors({ otp: 'Enter the 6-digit code.' }); return; }
      setLoading(true);
      try {
        const res = await axios.post('/api/auth/login', { email, password, otp });
        Swal.fire({ icon: 'success', title: t('2FA Confirmed', '२FA स्वीकृत भयो'), text: t('Logged in successfully.', 'लगइन सफल भयो।'), timer: 1500, showConfirmButton: false });
        onAuthSuccess(res.data);
        onClose();
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err, 'Invalid verification code.'));
      } finally { setLoading(false); }
    }

    // ── SIGN UP ──────────────────────────────────────────────────
    else if (mode === 'signup') {
      const errs = {};
      errs.name      = validate.name(name);
      errs.email     = validate.email(email);
      errs.password  = validate.password(password);
      errs.confirmPw = validate.confirmPw(password, confirmPw);
      errs.phone     = validate.phone(phone);
      if (!agreeTerms) errs.terms = 'You must agree to the Terms of Service.';
      if (Object.values(errs).some(Boolean)) { setFieldErrors(errs); return; }

      setLoading(true);
      try {
        const res = await axios.post('/api/auth/register', { name, email, password, confirmPassword: confirmPw, phone, role });
        // If server indicates account is already verified (e.g., DISABLE_REGISTRATION_OTP), auto-login
        if (res.data && res.data.isVerified) {
          const loginRes = await axios.post('/api/auth/login', { email, password });
          Swal.fire({ icon: 'success', title: t('Welcome!', 'स्वागत छ!'), text: t('Account created and signed in.', 'खाता सिर्जना गरियो र लगइन गरियो।'), timer: 1500, showConfirmButton: false });
          onAuthSuccess(loginRes.data);
          onClose();
        } else {
          // Move to email verification step
          switchMode('verify');
          Swal.fire({
            icon: 'info',
            title: t('Check your inbox', 'इमेल जाँच गर्नुहोस्'),
            text: t(`A verification code has been sent to ${email}. (Demo OTP: ${res.data.otp || '123456'})`,
                    `${email} मा प्रमाणीकरण कोड पठाइएको छ। (डेमो OTP: ${res.data.otp || '123456'})`),
            confirmButtonColor: '#f59e0b',
          });
        }
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err, 'Registration failed. Try again.'));
      } finally { setLoading(false); }
    }

    // ── VERIFY EMAIL ─────────────────────────────────────────────
    else if (mode === 'verify') {
      if (otp.length !== 6) { setFieldErrors({ otp: 'Enter the 6-digit code.' }); return; }
      setLoading(true);
      try {
        await axios.post('/api/auth/verify', { email, otp });
        Swal.fire({ icon: 'success', title: t('Account Activated!', 'खाता सक्रिय भयो!'), text: t('Your account is ready. Please sign in.', 'तपाईंको खाता तयार छ। लगइन गर्नुहोस्।'), confirmButtonColor: '#f59e0b' });
        switchMode('login');
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err, 'Invalid or expired OTP.'));
      } finally { setLoading(false); }
    }

    // ── FORGOT PASSWORD ──────────────────────────────────────────
    else if (mode === 'forgot') {
      const emailErr = validate.email(email);
      if (emailErr) { setFieldErrors({ email: emailErr }); return; }

      setLoading(true);
      try {
        const res = await axios.post('/api/auth/forgot-password', { emailOrPhone: email });
        switchMode('forgot-otp');
        Swal.fire({
          icon: 'info',
          title: t('OTP Sent!', 'OTP पठाइयो!'),
          text: t(`Reset code sent to ${email}. (Demo OTP: ${res.data.otp || '------'})`,
                  `${email} मा रिसेट कोड पठाइएको छ। (डेमो OTP: ${res.data.otp || '------'})`),
          confirmButtonColor: '#f59e0b',
        });
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err, 'Could not send reset code. Check your email.'));
      } finally { setLoading(false); }
    }

    // ── FORGOT OTP VERIFY ────────────────────────────────────────
    else if (mode === 'forgot-otp') {
      if (otp.length !== 6) { setFieldErrors({ otp: 'Enter the 6-digit code.' }); return; }
      // Just proceed to reset step; OTP will be verified server-side with new password
      switchMode('reset');
    }

    // ── RESET PASSWORD ───────────────────────────────────────────
    else if (mode === 'reset') {
      const errs = {};
      errs.newPassword  = validate.password(newPassword);
      errs.confirmNewPw = validate.confirmPw(newPassword, confirmNewPw);
      if (Object.values(errs).some(Boolean)) { setFieldErrors(errs); return; }

      setLoading(true);
      try {
        await axios.post('/api/auth/reset-password', { emailOrPhone: email, otp, password: newPassword, confirmPassword: confirmNewPw });
        Swal.fire({ icon: 'success', title: t('Password Reset!', 'पासवर्ड रिसेट भयो!'), text: t('Your password has been updated. Please sign in.', 'तपाईंको पासवर्ड अपडेट भयो। लगइन गर्नुहोस्।'), confirmButtonColor: '#f59e0b' });
        switchMode('login');
      } catch (err) {
        setGlobalErr(getAuthErrorMessage(err, 'Password reset failed. Try again.'));
      } finally { setLoading(false); }
    }
  };

  /* ── Resend OTP ── */
  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false); setOtp(''); setGlobalErr('');
    try {
      if (mode === 'verify') {
        const res = await axios.post('/api/auth/register', { name, email, password, confirmPassword: confirmPw, phone, role });
        Swal.fire({ icon: 'info', title: t('Code resent!', 'कोड पुनः पठाइयो!'), text: `(Demo OTP: ${res.data.otp || '123456'})`, confirmButtonColor: '#f59e0b' });
      } else if (mode === 'forgot-otp') {
        const res = await axios.post('/api/auth/forgot-password', { emailOrPhone: email });
        Swal.fire({ icon: 'info', title: t('Code resent!', 'कोड पुनः पठाइयो!'), text: `(Demo OTP: ${res.data.otp || '------'})`, confirmButtonColor: '#f59e0b' });
      }
    } catch { /* silently ignore */ }
    setOtpTimer(60);
    const interval = setInterval(() => {
      setOtpTimer((prev) => { if (prev <= 1) { clearInterval(interval); setCanResend(true); return 0; } return prev - 1; });
    }, 1000);
  };

  /* ── Google Mock ── */
  const handleGoogleLogin = async () => {
    setLoading(true); setGlobalErr('');
    try {
      const res = await axios.post('/api/auth/google', { email: 'prajwal.google@udyog.np', name: 'Prajwal Google', googleId: 'g_' + Math.random().toString(36).substr(2, 9) });
      Swal.fire({ icon: 'success', title: t('Google Sign-In!', 'गुगल साइन-इन!'), text: t('Welcome!', 'स्वागत छ!'), timer: 1500, showConfirmButton: false });
      onAuthSuccess(res.data);
      onClose();
    } catch (err) { setGlobalErr(getAuthErrorMessage(err, 'Google sign-in failed.')); }
    finally { setLoading(false); }
  };

  if (!isOpen) return null;

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  const pwStrength = getPasswordStrength(password);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      style={{ background: 'rgba(2,8,20,0.82)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-3xl border border-slate-800/80 shadow-2xl overflow-hidden"
        style={{ background: 'linear-gradient(145deg,#0d1b2a 0%,#0a1520 100%)' }}
      >
        {/* Decorative top glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 h-32 w-64 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />

        {/* Scrollable content */}
        <div className="relative max-h-[90vh] overflow-y-auto p-6 sm:p-8">

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-800/60 hover:text-white transition"
            aria-label="Close"
          >
            <FiX className="h-5 w-5" />
          </button>

          {/* ── Back button (non-login/signup) ── */}
          {!['login', 'signup'].includes(mode) && (
            <button
              type="button"
              onClick={() => switchMode(mode === 'verify' ? 'signup' : mode === '2fa' ? 'login' : mode === 'forgot-otp' ? 'forgot' : mode === 'reset' ? 'forgot-otp' : 'login')}
              className="mb-4 flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-400 transition"
            >
              <FiArrowLeft /> {t('Back', 'फिर्ता')}
            </button>
          )}

          {/* ── Header ── */}
          <div className="text-center mb-6">
            {/* Icon badge */}
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20">
              {mode === 'login'      && <FiLock className="h-5 w-5 text-amber-400" />}
              {mode === 'signup'     && <FiUser className="h-5 w-5 text-amber-400" />}
              {mode === 'verify'     && <FiShield className="h-5 w-5 text-amber-400" />}
              {mode === 'forgot'     && <FiMail className="h-5 w-5 text-amber-400" />}
              {mode === 'forgot-otp' && <FiShield className="h-5 w-5 text-amber-400" />}
              {mode === 'reset'      && <FiLock className="h-5 w-5 text-amber-400" />}
              {mode === '2fa'        && <FiShield className="h-5 w-5 text-amber-400" />}
            </div>

            <h2 className="text-xl font-bold text-white">
              {mode === 'login'      && t('Welcome Back', 'स्वागत छ')}
              {mode === 'signup'     && t('Create Account', 'दर्ता गर्नुहोस्')}
              {/* verify heading removed per user request */}
              {mode === 'forgot'     && t('Forgot Password?', 'पासवर्ड बिर्सनुभयो?')}
              {mode === 'forgot-otp' && t('Enter Reset Code', 'रिसेट कोड हाल्नुहोस्')}
              {mode === 'reset'      && t('Set New Password', 'नयाँ पासवर्ड राख्नुहोस्')}
              {mode === '2fa'        && t('Two-Step Verification', '२-चरण प्रमाणीकरण')}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {mode === 'login'      && t("Access Nepal's local marketplace", 'नेपालको स्थानीय बजारमा पहुँच पाउनुहोस्')}
              {mode === 'signup'     && t('Join thousands of buyers and sellers', 'हजारौं ग्राहक र व्यापारीसँग जोडिनुहोस्')}
              {/* verify subtitle removed per user request */}
              {mode === 'forgot'     && t('Enter your email to receive a reset code', 'रिसेट कोड पाउन इमेल हाल्नुहोस्')}
              {mode === 'forgot-otp' && t('Enter the 6-digit code.', '६-अङ्कको कोड हाल्नुहोस्।')}
              {mode === 'reset'      && t('Choose a strong new password', 'बलियो नयाँ पासवर्ड छान्नुहोस्')}
              {mode === '2fa'        && t('Enter the code from your authenticator app', 'तपाईंको एपको कोड हाल्नुहोस्')}
            </p>
          </div>

          {/* ── Global Error Banner ── */}
          {globalErr && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              <FiAlertCircle className="mt-0.5 shrink-0" />
              <span>{globalErr}</span>
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              FORMS
          ════════════════════════════════════════════════════ */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* ── LOGIN ── */}
            {mode === 'login' && (
              <>
                {/* Email */}
                <div>
                  <div className="relative">
                    <FiMail className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      placeholder={t('Email address', 'इमेल ठेगाना')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
                        fieldErrors.email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30' : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                      }`}
                    />
                  </div>
                  <FieldError msg={fieldErrors.email} />
                </div>

                {/* Password */}
                <div>
                  <PasswordInput
                    id="login-password"
                    placeholder={t('Password', 'पासवर्ड')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    showPw={showPw}
                    onToggle={() => setShowPw(!showPw)}
                    error={fieldErrors.password}
                  />
                  <div className="mt-1.5 flex justify-end">
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] text-amber-400 hover:underline">
                      {t('Forgot Password?', 'पासवर्ड बिर्सनुभयो?')}
                    </button>
                  </div>
                </div>

                {/* Quick Demo Logins */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {t('Quick demo logins', 'द्रुत डेमो लगइन')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { email: 'admin@udyog.np',  pw: 'password', label: 'Admin',    cls: 'border-amber-500/30  bg-amber-500/10  text-amber-300  hover:bg-amber-500/20'  },
                      { email: 'seller@udyog.np', pw: 'password', label: 'Seller',   cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20' },
                    ].map((d) => (
                      <button
                        key={d.label}
                        type="button"
                        disabled={loading}
                        onClick={() => handleQuickLogin(d.email, d.pw, d.label)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${d.cls}`}
                      >
                        {d.label} Demo
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600">{t('Password for all demos: password', 'सबै डेमोको पासवर्ड: password')}</p>
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading} className="auth-cta-btn">
                  {loading ? <Spinner /> : t('Sign In', 'लगइन गर्नुहोस्')}
                </button>

                {/* Divider */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800" /></div>
                  <span className="relative bg-[#0a1520] px-3 text-[10px] uppercase tracking-wider text-slate-500">{t('or continue with', 'वा यस मार्फत')}</span>
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-950/40 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800/40 disabled:opacity-50"
                >
                  <GoogleIcon />
                  {t('Continue with Google', 'गुगल मार्फत जारी राख्नुहोस्')}
                </button>
              </>
            )}

            {/* ── SIGN UP ── */}
            {mode === 'signup' && (
              <>
                {/* Full Name */}
                <div>
                  <div className="relative">
                    <FiUser className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      id="signup-name"
                      type="text"
                      placeholder={t('Full Name', 'पूरा नाम')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
                        fieldErrors.name ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30' : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                      }`}
                    />
                  </div>
                  <FieldError msg={fieldErrors.name} />
                </div>

                {/* Email */}
                <div>
                  <div className="relative">
                    <FiMail className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      id="signup-email"
                      type="email"
                      placeholder={t('Email address', 'इमेल ठेगाना')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
                        fieldErrors.email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30' : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                      }`}
                    />
                  </div>
                  <FieldError msg={fieldErrors.email} />
                </div>

                {/* Phone */}
                <div>
                  <div className="relative">
                    <FiPhone className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      id="signup-phone"
                      type="tel"
                      inputMode="numeric"
                      placeholder={t('Phone Number (optional)', 'फोन नम्बर (ऐच्छिक)')}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onKeyDown={handlePhoneKeyDown}
                      onPaste={handlePhonePaste}
                      autoComplete="tel"
                      className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
                        fieldErrors.phone ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30' : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                      }`}
                    />
                  </div>
                  <FieldError msg={fieldErrors.phone} />
                </div>

                {/* Password */}
                <div>
                  <PasswordInput
                    id="signup-password"
                    placeholder={t('Password', 'पासवर्ड')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    showPw={showPw}
                    onToggle={() => setShowPw(!showPw)}
                    error={fieldErrors.password}
                  />
                  {/* Strength bar */}
                  {password && <StrengthBar password={password} />}
                  {/* Requirements checklist */}
                  {password && <PasswordRequirements password={password} />}
                </div>

                {/* Confirm Password */}
                <div>
                  <PasswordInput
                    id="signup-confirm-password"
                    placeholder={t('Confirm Password', 'पासवर्ड पुनः हाल्नुहोस्')}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    showPw={showConfirmPw}
                    onToggle={() => setShowConfirmPw(!showConfirmPw)}
                    error={fieldErrors.confirmPw}
                  />
                  {/* Match indicator */}
                  {confirmPw && !fieldErrors.confirmPw && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
                      <FiCheck /> {t('Passwords match', 'पासवर्ड मेल खान्छ')}
                    </p>
                  )}
                </div>

                {/* Role */}
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/30 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t('I want to join as:', 'म यस रूपमा जोडिन चाहन्छु:')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'customer', label: t('Buyer', 'ग्राहक'),       icon: '🛍️' },
                      { value: 'seller',   label: t('Seller', 'विक्रेता'),     icon: '🏪' },
                      { value: 'rider',    label: t('Rider', 'डेलिभरी'),      icon: '🛵' },
                    ].map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition ${
                          role === r.value
                            ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                            : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                        }`}
                      >
                        <span className="text-base">{r.icon}</span>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Terms */}
                <div>
                  <label className="flex items-start gap-2.5 cursor-pointer group">
                    <div className="relative mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={agreeTerms}
                        onChange={(e) => setAgreeTerms(e.target.checked)}
                        className="sr-only"
                      />
                      <div className={`h-4 w-4 rounded border transition ${agreeTerms ? 'border-amber-400 bg-amber-400' : 'border-slate-600 bg-slate-900 group-hover:border-slate-500'}`}>
                        {agreeTerms && <FiCheck className="h-3 w-3 text-slate-950 absolute inset-0.5" />}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 leading-relaxed">
                      {t('I agree to the', 'मैले')} {' '}
                      <span className="text-amber-400 hover:underline cursor-pointer">{t('Terms of Service', 'सेवा शर्तहरू')}</span>{' '}
                      {t('and', 'र')}{' '}
                      <span className="text-amber-400 hover:underline cursor-pointer">{t('Privacy Policy', 'गोपनीयता नीति')}</span>
                      {t('.', 'सँग सहमत छु।')}
                    </span>
                  </label>
                  <FieldError msg={fieldErrors.terms} />
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading} className="auth-cta-btn">
                  {loading ? <Spinner /> : t('Create Account', 'खाता बनाउनुहोस्')}
                </button>
              </>
            )}

            {/* ── EMAIL VERIFY ── */}
            {mode === 'verify' && (
              <>
                <div className="rounded-2xl bg-amber-400/5 border border-amber-400/20 p-4 text-center space-y-1">
                  <p className="text-xs text-slate-300">{t('We sent a 6-digit code to', 'हामीले ६-अङ्कको कोड पठायौं')}</p>
                  <p className="text-sm font-semibold text-amber-400">{email}</p>
                </div>
                <OtpBoxes value={otp} onChange={setOtp} />
                <FieldError msg={fieldErrors.otp} />
                <p className="text-center text-[11px] text-slate-500">
                  {canResend ? (
                    <button type="button" onClick={handleResend} className="text-amber-400 font-semibold hover:underline flex items-center gap-1 mx-auto">
                      <FiRefreshCw className="h-3 w-3" /> {t('Resend code', 'कोड पुनः पठाउनुहोस्')}
                    </button>
                  ) : (
                    <>{t('Resend in', 'पुनः पठाउन')} <span className="text-amber-400 font-mono">{otpTimer}s</span></>
                  )}
                </p>
                <button type="submit" disabled={loading || otp.length !== 6} className="auth-cta-btn disabled:opacity-40">
                  {loading ? <Spinner /> : t('Verify & Activate', 'प्रमाणित गर्नुहोस्')}
                </button>
              </>
            )}

            {/* ── 2FA ── */}
            {mode === '2fa' && (
              <>
                <div className="rounded-2xl bg-slate-800/40 p-4 text-center space-y-1">
                  <p className="text-xs text-slate-400">{t('Enter the 6-digit code from your authenticator app.', 'तपाईंको एपबाट ६-अङ्कको कोड हाल्नुहोस्।')}</p>
                  <p className="text-[11px] text-slate-500">{t('(Demo code: 123456)', '(डेमो कोड: 123456)')}</p>
                </div>
                <OtpBoxes value={otp} onChange={setOtp} />
                <FieldError msg={fieldErrors.otp} />
                <p className="text-center text-[11px] text-slate-500">
                  {canResend ? (
                    <button type="button" onClick={handleResend} className="text-amber-400 font-semibold hover:underline flex items-center gap-1 mx-auto">
                      <FiRefreshCw className="h-3 w-3" /> {t('Resend code', 'कोड पुनः पठाउनुहोस्')}
                    </button>
                  ) : (
                    <>{t('Resend in', 'पुनः पठाउन')} <span className="text-amber-400 font-mono">{otpTimer}s</span></>
                  )}
                </p>
                <button type="submit" disabled={loading || otp.length !== 6} className="auth-cta-btn disabled:opacity-40">
                  {loading ? <Spinner /> : t('Verify', 'प्रमाणित गर्नुहोस्')}
                </button>
              </>
            )}

            {/* ── FORGOT PASSWORD (enter email) ── */}
            {mode === 'forgot' && (
              <>
                <div>
                  <div className="relative">
                    <FiMail className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      id="forgot-email"
                      type="email"
                      placeholder={t('Your registered email', 'दर्ता इमेल ठेगाना')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className={`w-full rounded-2xl border bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:ring-1 ${
                        fieldErrors.email ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/30' : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                      }`}
                    />
                  </div>
                  <FieldError msg={fieldErrors.email} />
                </div>
                <button type="submit" disabled={loading} className="auth-cta-btn">
                  {loading ? <Spinner /> : t('Send Reset Code', 'रिसेट कोड पठाउनुहोस्')}
                </button>
              </>
            )}

            {/* ── FORGOT OTP ── */}
            {mode === 'forgot-otp' && (
              <>
                <div className="rounded-2xl bg-amber-400/5 border border-amber-400/20 p-4 text-center space-y-1">
                  <p className="text-xs text-slate-300">{t('Reset code sent to', 'रिसेट कोड पठाइयो')}</p>
                  <p className="text-sm font-semibold text-amber-400">{email}</p>
                </div>
                <OtpBoxes value={otp} onChange={setOtp} />
                <FieldError msg={fieldErrors.otp} />
                <p className="text-center text-[11px] text-slate-500">
                  {canResend ? (
                    <button type="button" onClick={handleResend} className="text-amber-400 font-semibold hover:underline flex items-center gap-1 mx-auto">
                      <FiRefreshCw className="h-3 w-3" /> {t('Resend code', 'कोड पुनः पठाउनुहोस्')}
                    </button>
                  ) : (
                    <>{t('Resend in', 'पुनः पठाउन')} <span className="text-amber-400 font-mono">{otpTimer}s</span></>
                  )}
                </p>
                <button type="submit" disabled={loading || otp.length !== 6} className="auth-cta-btn disabled:opacity-40">
                  {loading ? <Spinner /> : t('Continue', 'जारी राख्नुहोस्')}
                </button>
              </>
            )}

            {/* ── RESET PASSWORD ── */}
            {mode === 'reset' && (
              <>
                <div>
                  <PasswordInput
                    id="new-password"
                    placeholder={t('New Password', 'नयाँ पासवर्ड')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    showPw={showNewPw}
                    onToggle={() => setShowNewPw(!showNewPw)}
                    error={fieldErrors.newPassword}
                  />
                  {newPassword && <StrengthBar password={newPassword} />}
                  {newPassword && <PasswordRequirements password={newPassword} />}
                </div>
                <div>
                  <PasswordInput
                    id="confirm-new-password"
                    placeholder={t('Confirm New Password', 'नयाँ पासवर्ड पुनः हाल्नुहोस्')}
                    value={confirmNewPw}
                    onChange={(e) => setConfirmNewPw(e.target.value)}
                    showPw={showConfirmPw}
                    onToggle={() => setShowConfirmPw(!showConfirmPw)}
                    error={fieldErrors.confirmNewPw}
                  />
                  {confirmNewPw && newPassword === confirmNewPw && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
                      <FiCheck /> {t('Passwords match', 'पासवर्ड मेल खान्छ')}
                    </p>
                  )}
                </div>
                <button type="submit" disabled={loading} className="auth-cta-btn">
                  {loading ? <Spinner /> : t('Reset Password', 'पासवर्ड रिसेट गर्नुहोस्')}
                </button>
              </>
            )}

          </form>

          {/* ── Bottom toggle ── */}
          {(mode === 'login' || mode === 'signup') && (
            <p className="mt-5 text-center text-xs text-slate-400">
              {mode === 'login'
                ? <>{t("Don't have an account?", 'नयाँ हुनुहुन्छ?')} <button onClick={() => switchMode('signup')} className="text-amber-400 font-semibold hover:underline ml-1">{t('Sign up free', 'निःशुल्क दर्ता')}</button></>
                : <>{t('Already have an account?', 'पहिल्यै खाता छ?')} <button onClick={() => switchMode('login')} className="text-amber-400 font-semibold hover:underline ml-1">{t('Sign in', 'लगइन')}</button></>
              }
            </p>
          )}

        </div>{/* end scrollable */}
      </div>

      {/* ── Global CSS injected once ── */}
      <style>{`
        .auth-cta-btn {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 9999px;
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          color: #0a0f1a;
          font-size: 0.875rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          box-shadow: 0 4px 20px rgba(245,158,11,0.25);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .auth-cta-btn:hover:not(:disabled) {
          box-shadow: 0 6px 28px rgba(245,158,11,0.4);
          transform: translateY(-1px);
        }
        .auth-cta-btn:active:not(:disabled) {
          transform: scale(0.98);
        }
        .auth-cta-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

/* ── Spinner ── */
function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" strokeLinecap="round" />
    </svg>
  );
}

/* ── Google Icon ── */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
    </svg>
  );
}
