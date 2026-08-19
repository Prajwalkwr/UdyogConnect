import React, { useState } from 'react';
import { FiX, FiMail, FiLock, FiUser, FiPhone, FiAlertCircle } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { createSubmissionGuard, createIdempotencyHeader } from '../utils/submitProtection';
import { isValidNepalPhone } from '../utils/authFlow';

const getAuthErrorMessage = (err, fallback = 'Authentication operation failed.') => {
  return err?.response?.data?.message || err?.response?.statusText || err?.message || fallback;
};

export default function AuthModal({ isOpen, onClose, onAuthSuccess, lang }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
  const [role, setRole] = useState('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  if (!isOpen) return null;

  const translate = (enText, neText) => {
    return lang === 'en' ? enText : neText;
  };

  const handleGoogleLogin = async () => {
    if (!submitGuard.begin()) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/api/auth/google', {
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
      setError(getAuthErrorMessage(err, 'Google login failed.'));
    } finally {
      setLoading(false);
      submitGuard.finish();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const response = await api.post('/api/auth/login', { email, password }, { headers: createIdempotencyHeader('auth-login') });
        Swal.fire({
          icon: 'success',
          title: translate('Welcome Back!', 'स्वागत छ!'),
          text: translate('Login Successful.', 'लगइन सफल भयो।'),
          timer: 1500,
          showConfirmButton: false,
        });
        onAuthSuccess(response.data);
        onClose();
      } else if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError(translate('Passwords do not match.', 'पासवर्डहरू मिल्दैनन्।'));
          setLoading(false);
          submitGuard.finish();
          return;
        }

        if (phone && !isValidNepalPhone(phone)) {
          setError(translate('Phone number must start with 9 and contain only digits.', 'फोन नम्बर 9 बाट सुरु हुनुपर्छ र अंक मात्र हुनुपर्छ।'));
          setLoading(false);
          submitGuard.finish();
          return;
        }

        await api.post('/api/auth/register', { name, email, password, confirmPassword, phone, role }, { headers: createIdempotencyHeader('auth-register') });
        Swal.fire({
          icon: 'success',
          title: translate('Success!', 'सफल भयो!'),
          text: translate('Registration completed.', 'दर्ता पूरा भयो।'),
        });
        // Auto-login after successful registration
        const loginResponse = await api.post('/api/auth/login', { email, password }, { headers: createIdempotencyHeader('auth-auto-login') });
        onAuthSuccess(loginResponse.data);
        onClose();
      } else if (mode === 'forgot') {
        Swal.fire({
          icon: 'info',
          title: translate('Reset Link Sent', 'लिङ्क पठाइयो'),
          text: translate('An OTP reset link has been dispatched to your email inbox.', 'तपाईंको इमेलमा पुनःसेट लिङ्क पठाइएको छ।'),
        });
        setMode('login');
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
      submitGuard.finish();
    }
  };

  /* ── Shared input style ─────────────────────────── */
  const inputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-white py-3 pl-10 pr-4 text-sm text-[#1A1A2E] placeholder:text-[#9CA3AF] outline-none focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/15 transition';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7, 20, 35, 0.48)', padding: 16, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: 860,
        display: 'grid', gridTemplateColumns: '0.9fr 1.1fr',
        borderRadius: 24, background: '#FFFFFF',
        border: '1px solid #E7E0D6',
        boxShadow: '0 24px 80px rgba(15, 23, 42, 0.18)',
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'linear-gradient(180deg, #091c2e 0%, #0d2943 100%)',
          padding: '32px 28px', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, #F2B71D, #D4A017)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1A1A2E', fontSize: 16,
            }}>🛒</div>
            <span style={{ fontSize: 18, fontWeight: 800 }}>UdyogConnect</span>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18, padding: 18,
          }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#F2B71D', fontWeight: 700 }}>
              {mode === 'login' ? 'Welcome back' : 'Join our network'}
            </div>
            <h3 style={{ margin: '12px 0 10px', fontSize: 28, lineHeight: 1.2, fontWeight: 800, color: '#fff' }}>
              {mode === 'login' ? 'Access local businesses near you.' : 'Grow your business locally.'}
            </h3>
            <p style={{ margin: 0, color: '#dbeaf8', fontSize: 14, lineHeight: 1.6 }}>
              {mode === 'login'
                ? 'Find trusted products, services, and sellers in your community.'
                : 'Reach customers in your area and manage your business with ease.'}
            </p>
          </div>

          <div style={{ marginTop: 22, display: 'grid', gap: 10 }}>
            {['Trusted local sellers', 'Secure checkout flow', 'Quick business growth tools'].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#e6edf7', fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F2B71D', display: 'inline-block' }} />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', background: '#fff', padding: '30px 28px 24px' }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', padding: 4,
            }}
          >
            <FiX style={{ width: 20, height: 20 }} />
          </button>

          {mode === 'signup' && (
            <div style={{ position: 'absolute', top: 16, right: 48, fontSize: 12, color: '#9CA3AF' }}>
              Already have an account?{' '}
              <button onClick={() => setMode('login')} style={{ color: '#F2B71D', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                Login
              </button>
            </div>
          )}

          <div style={{ marginTop: 12, marginBottom: 20 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, color: '#1A1A2E', margin: 0 }}>
              {mode === 'login' && translate('Welcome Back', 'स्वागत छ')}
              {mode === 'signup' && translate('Create Your Account', 'खाता सिर्जना गर्नुहोस्')}
              {mode === 'forgot' && translate('Forgot Password', 'पासवर्ड बिर्सनुभयो')}
            </h2>
            <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 6, marginBottom: 0 }}>
              {mode === 'login' && translate('Access Nepal\'s local marketplace', 'नेपालको स्थानीय बजारमा पहुँच पाउनुहोस्')}
              {mode === 'signup' && translate('Grow Your Business Locally', 'आफ्नो व्यवसाय स्थानीय रूपमा बढाउनुहोस्')}
              {mode === 'forgot' && translate('Recover access to your account', 'आफ्नो खाता पुनः प्राप्त गर्नुहोस्')}
            </p>
          </div>

          {mode === 'signup' && (
            <div style={{
              display: 'flex', gap: 0, marginBottom: 18,
              background: '#F3F4F6', borderRadius: 10, padding: 3,
            }}>
              {[
                { value: 'customer', label: translate('Customer', 'ग्राहक') },
                { value: 'seller', label: translate('Business', 'व्यवसाय') },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setRole(item.value)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8,
                    fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: role === item.value ? '#FFFFFF' : 'transparent',
                    color: role === item.value ? '#1A1A2E' : '#9CA3AF',
                    boxShadow: role === item.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
              borderRadius: 10, border: '1px solid #FEE2E2', background: '#FEF2F2',
              padding: '10px 14px', fontSize: 12, color: '#DC2626',
            }}>
              <FiAlertCircle />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  {role === 'seller' ? translate('Business Name', 'व्यवसायको नाम') : translate('Full Name', 'पूरा नाम')}
                </label>
                <FiUser style={{ position: 'absolute', top: 36, left: 12, color: '#9CA3AF' }} />
                <input
                  type="text"
                  placeholder={role === 'seller' ? 'Enter your business name' : translate('Full Name', 'पूरा नाम')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            )}

            {mode !== 'forgot' && (
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  {translate('Email Address', 'इमेल ठेगाना')}
                </label>
                <FiMail style={{ position: 'absolute', top: 36, left: 12, color: '#9CA3AF' }} />
                <input
                  type="email"
                  placeholder={translate('Email address', 'इमेल ठेगाना')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  {translate('Phone Number', 'फोन नम्बर')}
                </label>
                <FiPhone style={{ position: 'absolute', top: 36, left: 12, color: '#9CA3AF' }} />
                <input
                  type="tel"
                  placeholder={translate('Phone Number (Optional)', 'फोन नम्बर (ऐच्छिक)')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            {mode !== 'forgot' && (
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  {translate('Password', 'पासवर्ड')}
                </label>
                <FiLock style={{ position: 'absolute', top: 36, left: 12, color: '#9CA3AF' }} />
                <input
                  type="password"
                  placeholder={translate('Enter your password', 'पासवर्ड राख्नुहोस्')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            )}

            {mode === 'signup' && (
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 6 }}>
                  {translate('Confirm Password', 'पासवर्ड पुष्टि')}
                </label>
                <FiLock style={{ position: 'absolute', top: 36, left: 12, color: '#9CA3AF' }} />
                <input
                  type="password"
                  placeholder={translate('Confirm Password', 'पासवर्ड पुष्टि गर्नुहोस्')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            )}

            {mode === 'signup' && role === 'seller' && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#6B7280', marginBottom: 8 }}>
                  {translate('What do you offer?', 'तपाईं के प्रस्ताव गर्नुहुन्छ?')}
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {['Products', 'Services'].map((item) => (
                    <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#1A1A2E', cursor: 'pointer' }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: '#F2B71D', width: 16, height: 16 }} />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12 }}>
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  style={{ color: '#F2B71D', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {translate('Forgot Password?', 'पासवर्ड बिर्सनुभयो?')}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #F2B71D, #D4A017)', color: '#1A1A2E',
                padding: '12px 0', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', boxShadow: '0 8px 18px rgba(242,183,29,0.25)',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.2s',
              }}
            >
              {loading ? translate('Processing...', 'प्रक्रियामा...') : (
                mode === 'login' ? translate('Login', 'लगइन') :
                mode === 'signup' ? (role === 'seller' ? translate('Register Business', 'व्यवसाय दर्ता गर्नुहोस्') : translate('Create Account', 'दर्ता गर्नुहोस्')) :
                mode === 'forgot' ? translate('Send Reset Code', 'रिसेट कोड पठाउनुहोस्') :
                translate('Continue', 'जारी राख्नुहोस्')
              )}
            </button>
          </form>

          {mode === 'login' && (
            <div style={{ marginTop: 20 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                  <div style={{ width: '100%', borderTop: '1px solid #E5E7EB' }}></div>
                </div>
                <span style={{ position: 'relative', background: '#FFFFFF', padding: '0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9CA3AF' }}>
                  {translate('Or continue with', 'वा यस मार्फत अगाडि बढ्नुहोस्')}
                </span>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderRadius: 12, border: '1px solid #E5E7EB', background: '#FFFFFF',
                  padding: '10px 0', fontSize: 13, fontWeight: 600, color: '#1A1A2E',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <svg style={{ width: 18, height: 18 }} viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                </svg>
                <span>Google Sign-In</span>
              </button>
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13 }}>
            {mode === 'login' ? (
              <p style={{ color: '#9CA3AF', margin: 0 }}>
                {translate('Don\'t have an account?', 'नयाँ हुनुहुन्छ?')}{' '}
                <button onClick={() => setMode('signup')} style={{ fontWeight: 700, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {translate('Sign Up', 'दर्ता गर्नुहोस्')}
                </button>
              </p>
            ) : (
              <p style={{ color: '#9CA3AF', margin: 0 }}>
                {translate('Already have an account?', 'पहिल्यै खाता छ?')}{' '}
                <button onClick={() => setMode('login')} style={{ fontWeight: 700, color: '#F2B71D', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {translate('Sign In', 'लगइन')}
                </button>
              </p>
            )}
          </div>

          {mode === 'signup' && (
            <p style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#9CA3AF' }}>
              By registering, you agree to our{' '}
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Terms & Conditions</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

