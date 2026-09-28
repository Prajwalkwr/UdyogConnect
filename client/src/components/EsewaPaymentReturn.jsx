import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../utils/api';
import { notifyOrdersUpdated } from '../utils/bill';
import OrderSuccess from './bill/OrderSuccess';

const PENDING_RETRY_MS = 4000;
const MAX_PENDING_RETRIES = 3;

/**
 * eSewa redirects back here. The payment only counts once the backend has verified the
 * signature, merchant, amount and transaction status with eSewa; the query string is never trusted.
 */
export default function EsewaPaymentReturn({ outcome = 'success' }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const [state, setState] = useState({ status: outcome === 'success' ? 'verifying' : 'failed', order: null, bill: null, message: '', retryable: false });
  const started = useRef(false);
  const pendingRetries = useRef(0);

  const data = searchParams.get('data');
  const transactionUuid = searchParams.get('tx') || '';

  const verify = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'verifying', message: '' }));
    try {
      const resp = await api.post('/api/payment/esewa/verify', { data });
      if (resp.status === 202 || resp.data?.pending) {
        if (pendingRetries.current < MAX_PENDING_RETRIES) {
          pendingRetries.current += 1;
          setTimeout(verify, PENDING_RETRY_MS);
          return;
        }
        setState({ status: 'error', message: resp.data?.message || 'eSewa is still processing this payment.', retryable: true });
        return;
      }
      if (resp.data?.paid) {
        dispatch({ type: 'CLEAR_CART' });
        notifyOrdersUpdated();
        setState({ status: 'paid', order: resp.data.order, bill: resp.data.bill, message: '', retryable: false });
        return;
      }
      setState({ status: 'error', message: 'Your eSewa payment could not be confirmed.', retryable: true });
    } catch (e) {
      setState({
        status: 'error',
        message: e.response?.data?.message || e.message || 'Payment verification error.',
        retryable: Boolean(e.response?.data?.retryable),
      });
    }
  }, [data, dispatch]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (outcome !== 'success') {
      if (transactionUuid) api.post('/api/payment/esewa/failure', { transactionUuid }).catch(() => {});
      return;
    }
    if (!data) {
      setState({ status: 'error', message: 'Missing eSewa payment information.', retryable: false });
      return;
    }
    verify();
  }, [outcome, data, transactionUuid, verify]);

  if (state.status === 'paid') {
    return (
      <div className="px-4 py-10">
        <OrderSuccess order={state.order} bill={state.bill} user={user} onContinue={() => navigate('/')} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md rounded-[28px] border border-[#e8dfd0] bg-white p-8 text-center shadow-sm">
        {state.status === 'verifying' ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#60bb46] border-t-transparent" />
            <h3 className="mt-4 text-lg font-bold text-[#1a1a2e]">Verifying your eSewa payment...</h3>
            <p className="mt-2 text-sm text-slate-500">Please don't close this page.</p>
          </>
        ) : state.status === 'failed' ? (
          <>
            <h3 className="text-lg font-bold text-[#1a1a2e]">eSewa payment cancelled</h3>
            <p className="mt-2 text-sm text-slate-500">No money was taken and no order was placed. Your cart is still saved.</p>
            <button type="button" onClick={() => navigate('/checkout')} className="mt-5 rounded-full bg-[#f2b71d] px-5 py-2.5 text-xs font-bold text-[#1a1a2e]">
              Back to checkout
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-[#1a1a2e]">Payment not confirmed</h3>
            <p className="mt-2 text-sm text-slate-500">{state.message}</p>
            <div className="mt-5 flex justify-center gap-2">
              {state.retryable && (
                <button type="button" onClick={verify} className="rounded-full bg-[#60bb46] px-5 py-2.5 text-xs font-bold text-white">
                  Retry verification
                </button>
              )}
              <button type="button" onClick={() => navigate('/checkout')} className="rounded-full bg-[#f2b71d] px-5 py-2.5 text-xs font-bold text-[#1a1a2e]">
                Back to checkout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
