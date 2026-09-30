import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiAlertCircle, FiCheckCircle, FiMail } from 'react-icons/fi';
import api from '../../utils/api';
import { EMAIL_REGEX } from '../../utils/validation';
import AuthPageShell, { BackToLogin, authButtonClass, authInputClass } from './AuthPageShell';

const RESEND_WAIT_SECONDS = 60;
const SENT_MESSAGE = 'If an account with this email exists, a password reset link has been sent.';

function forgotErrorMessage(err) {
  const status = err?.response?.status;
  if (status === 400) return 'Please enter a valid email address.';
  if (status === 429) return 'Too many requests. Please try again later.';
  if (status === 503) return err.response.data?.message || "We couldn't process the request right now. Please try again later.";
  return 'Something went wrong. Please try again.';
}

export default function ForgotPasswordPage({ onBackToLogin }) {
  const location = useLocation();
  const [email, setEmail] = useState(() => String(location.state?.email || '').trim());
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (waitSeconds <= 0) return undefined;
    const timer = setTimeout(() => setWaitSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  const sendLink = async () => {
    if (inFlightRef.current) return;
    const normalized = email.trim().toLowerCase();
    setEmail(normalized);
    if (!normalized) {
      setError('Please enter your email address.');
      return;
    }
    if (!EMAIL_REGEX.test(normalized)) {
      setError('Please enter a valid email address.');
      return;
    }

    inFlightRef.current = true;
    setError('');
    setStatus('sending');
    try {
      const response = await api.post('/api/auth/forgot-password', { email: normalized }, { noRetry: true });
      setSentMessage(response.data?.message || SENT_MESSAGE);
      setStatus('sent');
      setWaitSeconds(RESEND_WAIT_SECONDS);
    } catch (err) {
      setError(forgotErrorMessage(err));
      setStatus(sentMessage ? 'sent' : 'idle');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendLink();
  };

  const sending = status === 'sending';

  return (
    <AuthPageShell>
      {status === 'sent' || (sending && sentMessage) ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <FiCheckCircle className="h-7 w-7" />
          </div>
          <h2 className="m-0 text-[26px] font-extrabold text-[#1A1A2E]">Check your email</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#4B5563]">{sentMessage}</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#9CA3AF]">
            The link expires in 30 minutes. If you don't see it, check your spam folder.
          </p>
          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-600" role="alert">
              <FiAlertCircle /> <span>{error}</span>
            </div>
          )}
          <button
            type="button"
            onClick={sendLink}
            disabled={sending || waitSeconds > 0}
            className={`${authButtonClass} mt-6`}
          >
            {sending ? 'Sending...' : (waitSeconds > 0 ? `Send another link in ${waitSeconds}s` : 'Send another link')}
          </button>
          <button
            type="button"
            onClick={() => { setStatus('idle'); setSentMessage(''); setError(''); }}
            disabled={sending}
            className="mt-3 text-[13px] font-semibold text-[#D4A017] hover:underline disabled:opacity-60"
          >
            Use a different email
          </button>
          <BackToLogin onClick={onBackToLogin} />
        </div>
      ) : (
        <>
          <h2 className="m-0 text-[28px] font-extrabold text-[#1A1A2E]">Forgot Password?</h2>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-[#6B7280]">
            Enter the email address associated with your account and we will send you a password reset link.
          </p>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-xs text-red-600" role="alert">
              <FiAlertCircle /> <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-[13px] font-medium text-[#6B7280]">Email Address</label>
              <div className="relative">
                <FiMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value.replace(/\s+/g, '')); setError(''); }}
                  className={authInputClass}
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>
            <button type="submit" disabled={sending} className={authButtonClass}>
              {sending ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
          <BackToLogin onClick={onBackToLogin} />
        </>
      )}
    </AuthPageShell>
  );
}
