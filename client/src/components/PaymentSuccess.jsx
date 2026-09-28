import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import api from '../utils/api';
import { notifyOrdersUpdated } from '../utils/bill';
import OrderSuccess from './bill/OrderSuccess';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const [state, setState] = useState({ status: 'verifying', order: null, bill: null, message: '' });
  const verifyStarted = useRef(false);

  const sessionId = searchParams.get('session_id');
  const orderId = searchParams.get('orderId');

  useEffect(() => {
    // Verification is idempotent on the server, but avoid a second request from StrictMode re-mounts.
    if (verifyStarted.current) return;
    verifyStarted.current = true;

    if (!sessionId || !orderId) {
      setState({ status: 'error', message: 'Missing payment information.' });
      return;
    }

    (async () => {
      try {
        const resp = await api.post('/api/payment/verify-session', { sessionId, orderId });
        if (resp.data?.paid) {
          dispatch({ type: 'CLEAR_CART' });
          notifyOrdersUpdated();
          setState({ status: 'paid', order: resp.data.order, bill: resp.data.bill, message: '' });
          return;
        }
        setState({ status: 'error', message: 'Your payment has not been completed yet. No bill was issued.' });
      } catch (e) {
        setState({ status: 'error', message: e.response?.data?.message || e.message || 'Payment verification error.' });
      }
    })();
  }, [sessionId, orderId, dispatch]);

  if (state.status === 'paid') {
    return (
      <div className="px-4 py-10">
        <OrderSuccess order={state.order} bill={state.bill} user={user} onContinue={() => navigate('/')} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        {state.status === 'verifying' ? (
          <h3 className="text-lg font-bold">Verifying payment...</h3>
        ) : (
          <>
            <h3 className="text-lg font-bold text-[#1a1a2e]">Payment not confirmed</h3>
            <p className="mt-2 text-sm text-slate-500">{state.message}</p>
            <button type="button" onClick={() => navigate('/checkout')} className="mt-5 rounded-full bg-[#f2b71d] px-5 py-2.5 text-xs font-bold text-[#1a1a2e]">
              Back to checkout
            </button>
          </>
        )}
      </div>
    </div>
  );
}
