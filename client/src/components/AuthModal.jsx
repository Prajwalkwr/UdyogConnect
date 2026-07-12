import React, { useState } from 'react';
import { FiX, FiMail, FiLock, FiUser, FiPhone, FiAlertCircle } from 'react-icons/fi';
import Swal from 'sweetalert2';
import axios from 'axios';
import { DEMO_ACCOUNTS } from '../utils/demoAccounts';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, lang }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot' | 'otp'
  const [role, setRole] = useState('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post('/api/auth/google', {
        email: 'prajwal.google@udyog.np',
        name: 'Prajwal Google',
        googleId: 'g_' + Math.random().toString(36).substr(2, 9),
      });
      Swal.fire({
        icon: 'success',
        title: translate('Success', 'सफल भयो'),
        text: translate('Welcome back via Google!', 'गुगल मार्फत स्वागत छ!'),
        timer: 1500,
        showConfirmButton: false,
      });
      onAuthSuccess(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Google login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (quickEmail, quickPassword, label) => {
    setError('');
    setLoading(true);
    try {
      const response = await axios.post('/api/auth/login', { email: quickEmail, password: quickPassword, otp: undefined });
      Swal.fire({
        icon: 'success',
        title: translate('Welcome Back!', 'स्वागत छ!'),
        text: translate(`${label} login successful.`, `${label} लगइन सफल भयो।`),
        timer: 1500,
        showConfirmButton: false,
      });
      onAuthSuccess(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication operation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const response = await axios.post('/api/auth/login', { email, password, otp: otp || undefined });
        if (response.data.require2FA) {
          setMode('otp');
          setLoading(false);
          return;
        }
        Swal.fire({
          icon: 'success',
          title: translate('Welcome Back!', 'स्वागत छ!'),
          text: translate('Login Successful.', 'लगइन सफल भयो।'),
          timer: 1500,
          showConfirmButton: false,
        });
        onAuthSuccess(response.data);
        onClose();
      } else if (mode === 'otp') {
        const response = await axios.post('/api/auth/login', { email, password, otp });
        Swal.fire({
          icon: 'success',
          title: translate('2FA Confirmed', '२FA स्वीकृत भयो'),
          text: translate('Logged in successfully.', 'लगइन सफल भयो।'),
          timer: 1500,
          showConfirmButton: false,
        });
        onAuthSuccess(response.data);
        onClose();
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError(translate('Passwords do not match.', 'पासवर्डहरू मिल्दैनन्।'));
          setLoading(false);
          return;
        }
        const response = await axios.post('/api/auth/register', { name, email, password, confirmPassword, phone, role });
        Swal.fire({
          icon: 'success',
          title: translate('Success!', 'सफल भयो!'),
          text: translate('Registration completed. You can now sign in immediately.', 'दर्ता पूरा भयो। तपाईंले तुरुन्त लगइन गर्न सक्नुहुन्छ।'),
        });
        setEmail(email);
        setPassword(password);
        setMode('login');
        setOtp('');
        const loginResponse = await axios.post('/api/auth/login', { email, password, otp: undefined });
        onAuthSuccess(loginResponse.data);
        onClose();
      } else if (mode === 'verify') {
        const response = await axios.post('/api/auth/verify', { email, otp });
        Swal.fire({
          icon: 'success',
          title: translate('Account Verified', 'खाता प्रमाणित भयो'),
          text: translate('Your account is active. You can now login.', 'तपाईंको खाता सक्रिय भयो। अब लगइन गर्नुहोस्।'),
        });
        setMode('login');
        setOtp('');
      } else if (mode === 'forgot') {
        Swal.fire({
          icon: 'info',
          title: translate('Reset Link Sent', 'लिङ्क पठाइयो'),
          text: translate('An OTP reset link has been dispatched to your email inbox.', 'तपाईंको इमेलमा पुनःसेट लिङ्क पठाइएको छ।'),
        });
        setMode('login');
      }
    } catch (err) {
      if (err.response?.data?.requireVerification) {
        setError('');
        setMode('verify');
        setOtp('');
        Swal.fire({
          icon: 'info',
          title: translate('Account Verification Needed', 'खाता प्रमाणीकरण आवश्यक'),
          text: translate('Please enter the verification OTP sent to your email. OTP: ' + err.response.data.otp, 'कृपया तपाईंको इमेलमा पठाइएको OTP हाल्नुहोस्। OTP: ' + err.response.data.otp),
        });
        setLoading(false);
        return;
      }
      setError(err.response?.data?.message || 'Authentication operation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <FiX className="h-6 w-6" />
        </button>

        {/* Modal Heading */}
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {mode === 'login' && translate('Welcome Back', 'स्वागत छ')}
            {mode === 'signup' && translate('Join UdyogConnect', 'दर्ता गर्नुहोस्')}
            {mode === 'forgot' && translate('Forgot Password', 'पासवर्ड बिर्सनुभयो')}
            {mode === 'otp' && translate('Two-Factor Verification', '२-चरण प्रमाणीकरण')}
            {mode === 'verify' && translate('Verify Your Account', 'खाता प्रमाणित गर्नुहोस्')}
          </h2>
          <p className="mt-1.5 text-xs text-slate-400">
            {mode === 'login' && translate('Access Nepal\'s local marketplace', 'नेपालको स्थानीय बजारमा पहुँच पाउनुहोस्')}
            {mode === 'signup' && translate('Create an account to start buying or selling', 'सामान किन्न वा बेच्न खाता सिर्जना गर्नुहोस्')}
            {mode === 'forgot' && translate('Recover access to your seller or buyer account', 'आफ्नो खाता पुनः प्राप्त गर्नुहोस्')}
            {mode === 'otp' && translate('Provide the 2FA code sent to your registered app', 'तपाईंको एपमा पठाइएको कोड हाल्नुहोस्')}
            {mode === 'verify' && translate('Enter the 6-digit OTP code to activate your account', 'तपाईंको खाता सक्रिय गर्न ६-अङ्कको OTP कोड हाल्नुहोस्')}
          </p>
        </div>

        {/* Form Error */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-500/10 p-3 text-xs text-rose-400 border border-rose-550/20">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Sign Up: Name */}
          {mode === 'signup' && (
            <div className="relative">
              <FiUser className="absolute top-3.5 left-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={translate('Full Name', 'पूरा नाम')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none ring-offset-0 focus:border-amber-400"
                required
              />
            </div>
          )}

          {/* Email */}
          {mode !== 'otp' && (
            <div className="relative">
              <FiMail className="absolute top-3.5 left-3.5 text-slate-400" />
              <input
                type="email"
                placeholder={translate('Email address', 'इमेल ठेगाना')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
                required
              />
            </div>
          )}

          {/* Sign Up: Phone */}
          {mode === 'signup' && (
            <div className="relative">
              <FiPhone className="absolute top-3.5 left-3.5 text-slate-400" />
              <input
                type="tel"
                placeholder={translate('Phone Number (Optional)', 'फोन नम्बर (ऐच्छिक)')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
              />
            </div>
          )}

          {/* Password */}
          {mode !== 'forgot' && mode !== 'otp' && mode !== 'verify' && (
            <div className="relative">
              <FiLock className="absolute top-3.5 left-3.5 text-slate-400" />
              <input
                type="password"
                placeholder={translate('Password', 'पासवर्ड')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-850 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
                required
              />
            </div>
          )}

          {/* Confirm Password */}
          {mode === 'signup' && (
            <div className="relative">
              <FiLock className="absolute top-3.5 left-3.5 text-slate-400" />
              <input
                type="password"
                placeholder={translate('Confirm Password', 'पासवर्ड पुष्टि गर्नुहोस्')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-2xl border border-slate-850 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
                required
              />
            </div>
          )}

          {/* Sign Up: Role Switcher */}
          {mode === 'signup' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-450">
                {translate('I want to register as:', 'म यस रूपमा दर्ता हुन चाहन्छु:')}
              </span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { value: 'customer', label: translate('Buyer', 'ग्राहक') },
                  { value: 'seller', label: translate('Seller', 'विक्रेता') },
                  { value: 'rider', label: translate('Rider', 'डेलिभरी') },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setRole(item.value)}
                    className={`rounded-xl border py-2 text-xs font-semibold transition ${
                      role === item.value
                        ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* OTP Screen Input */}
          {(mode === 'otp' || mode === 'verify') && (
            <div className="space-y-2">
              <label className="text-xs text-slate-400">
                {mode === 'verify'
                  ? translate('Enter the 6-digit verification code sent to your account:', 'तपाईंको खातामा पठाइएको ६-अङ्कको प्रमाणीकरण कोड हाल्नुहोस्:')
                  : translate('Enter the 6-digit OTP code (mock validation uses "123456"):', '६-अङ्कको OTP कोड हाल्नुहोस् (परीक्षण कोड: "123456"):')}
              </label>
              <input
                type="text"
                maxLength="6"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 py-3 text-center text-lg font-mono tracking-widest text-white outline-none focus:border-amber-400"
                required
              />
            </div>
          )}

          {/* Forgot Link */}
          {mode === 'login' && (
            <div className="flex justify-end text-xs">
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-amber-400 hover:underline"
              >
                {translate('Forgot Password?', 'पासवर्ड बिर्सनुभयो?')}
              </button>
            </div>
          )}

          {mode === 'login' && (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {translate('Quick demo logins', 'द्रुत डेमो लगइन')}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin(DEMO_ACCOUNTS.admin.email, DEMO_ACCOUNTS.admin.password, DEMO_ACCOUNTS.admin.label)}
                  disabled={loading}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {translate('Admin Demo', 'एडमिन डेमो')}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin(DEMO_ACCOUNTS.seller.email, DEMO_ACCOUNTS.seller.password, DEMO_ACCOUNTS.seller.label)}
                  disabled={loading}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {translate('Business Demo', 'व्यवसाय डेमो')}
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                {translate('Use password: password', 'पासवर्ड: password')}
              </p>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? translate('Processing...', 'प्रक्रियामा...') : (
              mode === 'login' ? translate('Login', 'लगइन') :
              mode === 'signup' ? translate('Create Account', 'दर्ता गर्नुहोस्') :
              mode === 'forgot' ? translate('Send Reset Code', 'रिसेट कोड पठाउनुहोस्') :
              translate('Verify OTP', 'प्रमाणित गर्नुहोस्')
            )}
          </button>
        </form>

        {/* Separator / Google Login */}
        {mode === 'login' && (
          <div className="mt-5 space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <span className="relative bg-slate-900 px-3 text-[10px] uppercase tracking-wider text-slate-450">
                {translate('Or continue with', 'वा यस मार्फत अगाडि बढ्नुहोस्')}
              </span>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-800 bg-slate-950/40 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-850"
            >
              <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              <span>Google Sign-In</span>
            </button>
          </div>
        )}

        {/* Auth Toggle */}
        <div className="mt-5 text-center text-xs">
          {mode === 'login' ? (
            <p className="text-slate-400">
              {translate('Don\'t have an account?', 'नयाँ हुनुहुन्छ?')} &nbsp;
              <button onClick={() => setMode('signup')} className="text-amber-400 font-semibold hover:underline">
                {translate('Sign Up', 'दर्ता गर्नुहोस्')}
              </button>
            </p>
          ) : (
            <p className="text-slate-400">
              {translate('Already have an account?', 'पहिल्यै खाता छ?')} &nbsp;
              <button onClick={() => setMode('login')} className="text-amber-400 font-semibold hover:underline">
                {translate('Sign In', 'लगइन')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
