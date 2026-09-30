import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiAlertCircle, FiCheckCircle, FiClock, FiEye, FiEyeOff, FiLink, FiLock } from 'react-icons/fi';
import api from '../../utils/api';
import { validatePassword } from '../../utils/validation';
import { getPasswordStrength } from '../../utils/passwordStrength';
import AuthPageShell, { BackToLogin, authButtonClass, authInputClass } from './AuthPageShell';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STRENGTH_STYLES = {
  1: { bar: 'bg-red-500', text: 'text-red-600', width: 'w-1/3' },
  2: { bar: 'bg-amber-500', text: 'text-amber-600', width: 'w-2/3' },
  3: { bar: 'bg-emerald-500', text: 'text-emerald-600', width: 'w-full' },
};
const LINK_PROBLEMS = {
  invalid: { icon: FiLink, title: 'Link not valid', text: 'This password reset link is invalid or has expired.' },
  expired: { icon: FiClock, title: 'Link expired', text: 'Your password reset link has expired.' },
  missing: { icon: FiLink, title: 'Link incomplete', text: 'This reset link is missing its security code. Please open the link from your email again.' },
};

function PasswordField({ id, label, value, onChange, visible, onToggle, autoFocus, error }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-[#6B7280]">{label}</label>
      <div className="relative">
        <FiLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={onChange}
          className={`${authInputClass} pr-12 ${error ? 'border-red-300' : ''}`}
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 text-[#6B7280]"
        >
          {visible ? <FiEyeOff /> : <FiEye />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function ResetPasswordPage({ onBackToLogin, onPasswordReset }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(token ? 'checking' : 'missing'); // checking | ready | invalid | expired | missing | unreachable | success
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('missing');
      return undefined;
    }
    let cancelled = false;
    setStatus('checking');
    api.get(`/api/auth/reset-password/verify/${encodeURIComponent(token)}`)
      .then(() => { if (!cancelled) setStatus('ready'); })
      .catch((err) => {
        if (cancelled) return;
        const reason = err?.response?.data?.reason;
        if (reason === 'expired' || reason === 'invalid') {
          setStatus(reason);
          return;
        }
        setLoadError(err?.response?.status === 429 ? 'Too many requests. Please try again later.' : GENERIC_ERROR);
        setStatus('unreachable');
      });
    return () => { cancelled = true; };
  }, [token, checkAttempt]);

  const strength = getPasswordStrength(password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (inFlightRef.current) return;
    setFormError('');

    const errors = {};
    if (!password.trim()) errors.password = 'Please enter a new password.';
    else if (validatePassword(password)) errors.password = validatePassword(password);
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your new password.';
    else if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      await api.post('/api/auth/reset-password', { token, password, confirmPassword }, { noRetry: true });
      setPassword('');
      setConfirmPassword('');
      setStatus('success');
      onPasswordReset?.();
    } catch (err) {
      const data = err?.response?.data;
      if (data?.reason === 'expired' || data?.reason === 'invalid') {
        setStatus(data.reason);
      } else if (err?.response?.status === 400 && data?.message) {
        setFieldErrors({ password: data.message });
      } else if (err?.response?.status === 429) {
        setFormError('Too many requests. Please try again later.');
      } else {
        setFormError(GENERIC_ERROR);
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const problem = LINK_PROBLEMS[status];

  return (
    <AuthPageShell>
      {status === 'checking' && (
        <div className="flex flex-col items-center py-10 text-center text-sm text-[#6B7280]" role="status">
          <span className="mb-4 h-9 w-9 animate-spin rounded-full border-4 border-[#F2B71D]/30 border-t-[#F2B71D]" />
          Checking your reset link...
        </div>
      )}

      {status === 'unreachable' && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
            <FiAlertCircle className="h-7 w-7" />
          </div>
          <h2 className="m-0 text-[24px] font-extrabold text-[#1A1A2E]">We couldn't check your link</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#6B7280]">{loadError}</p>
          <button type="button" onClick={() => setCheckAttempt((n) => n + 1)} className={`${authButtonClass} mt-6`}>
            Try Again
          </button>
          <BackToLogin onClick={onBackToLogin} />
        </div>
      )}

      {problem && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <problem.icon className="h-7 w-7" />
          </div>
          <h2 className="m-0 text-[24px] font-extrabold text-[#1A1A2E]">{problem.title}</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#6B7280]">{problem.text}</p>
          <button type="button" onClick={() => navigate('/forgot-password')} className={`${authButtonClass} mt-6`}>
            Request New Reset Link
          </button>
          <BackToLogin onClick={onBackToLogin} />
        </div>
      )}

      {status === 'success' && (
        <div className="py-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <FiCheckCircle className="h-7 w-7" />
          </div>
          <h2 className="m-0 text-[26px] font-extrabold text-[#1A1A2E]">Password Reset Successful!</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-[#6B7280]">Your password has been successfully changed.</p>
          <button type="button" onClick={onBackToLogin} className={`${authButtonClass} mt-6`}>
            Go to Login
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <h2 className="m-0 text-[28px] font-extrabold text-[#1A1A2E]">Reset Your Password</h2>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-[#6B7280]">Choose a new password for your UdyogConnect account.</p>

          {formError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-600" role="alert">
              <FiAlertCircle /> <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div>
              <PasswordField
                id="reset-password"
                label="New Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: '' })); }}
                visible={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoFocus
                error={fieldErrors.password}
              />
              {password && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div className={`h-full rounded-full transition-all ${STRENGTH_STYLES[strength.level].bar} ${STRENGTH_STYLES[strength.level].width}`} />
                  </div>
                  <span className={`text-xs font-semibold ${STRENGTH_STYLES[strength.level].text}`}>{strength.label}</span>
                </div>
              )}
              {!fieldErrors.password && (
                <p className="mt-1.5 text-xs text-[#9CA3AF]">At least 8 characters, with a letter and a number.</p>
              )}
            </div>
            <PasswordField
              id="reset-confirm-password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmPassword: '' })); }}
              visible={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
              error={fieldErrors.confirmPassword}
            />
            <button type="submit" disabled={submitting} className={authButtonClass}>
              {submitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
          <BackToLogin onClick={onBackToLogin} />
        </>
      )}
    </AuthPageShell>
  );
}
