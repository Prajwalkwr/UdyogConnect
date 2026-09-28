import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../utils/api';

const money = (value) => `NPR ${Number(value || 0).toFixed(2)}`;

/**
 * Development-only replacement for eSewa's sandbox login page. The backend signs the same callback
 * eSewa would send, and the normal verification page still checks it before any order is created.
 */
export default function EsewaSimulator() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const transactionUuid = searchParams.get('tx') || '';
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!transactionUuid) {
      setError('Missing test payment.');
      return;
    }
    api.get(`/api/payment/esewa/simulate/${encodeURIComponent(transactionUuid)}`)
      .then((res) => setPayment(res.data))
      .catch((err) => setError(getApiErrorMessage(err, 'Test payment not available.')));
  }, [transactionUuid]);

  const pay = async () => {
    setPaying(true);
    try {
      const res = await api.post('/api/payment/esewa/simulate', { transactionUuid });
      navigate(`/payment/esewa/success?data=${encodeURIComponent(res.data.data)}`, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not complete the test payment.'));
      setPaying(false);
    }
  };

  const cancel = () => navigate(`/payment/esewa/failure?tx=${encodeURIComponent(transactionUuid)}`, { replace: true });

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-[#e8dfd0] bg-white shadow-sm">
        <div className="bg-[#60bb46] px-6 py-4 text-white">
          <p className="text-lg font-black">eSewa</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-90">Sandbox test payment — no real money</p>
        </div>

        <div className="space-y-4 p-6">
          {error ? (
            <>
              <p className="text-sm text-rose-600">{error}</p>
              <button type="button" onClick={() => navigate('/checkout')} className="rounded-full bg-[#f2b71d] px-5 py-2.5 text-xs font-bold text-[#1a1a2e]">
                Back to checkout
              </button>
            </>
          ) : !payment ? (
            <p className="text-sm text-slate-500">Loading test payment...</p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Paying</p>
                <p className="text-base font-bold text-[#1a1a2e]">{payment.businessName || payment.merchantCode}</p>
                <p className="text-[11px] text-slate-400">Merchant {payment.merchantCode}</p>
              </div>
              <div className="space-y-1.5 rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] p-4 text-xs text-slate-600">
                <div className="flex justify-between"><span>Product Amount</span><span>{money(payment.amount)}</span></div>
                <div className="flex justify-between"><span>Tax Amount</span><span>{money(payment.tax)}</span></div>
                <div className="flex justify-between"><span>Delivery Charge</span><span>{money(payment.deliveryFee)}</span></div>
                <div className="flex justify-between border-t border-[#e8dfd0] pt-2 text-sm font-black text-[#1a1a2e]"><span>Total Amount</span><span>{money(payment.total)}</span></div>
              </div>
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                eSewa's sandbox login is unavailable, so this local test page stands in for it. It only works in development sandbox mode.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={paying} onClick={pay} className="flex-1 rounded-full bg-[#60bb46] py-3 text-xs font-bold text-white hover:bg-[#4fa637] disabled:opacity-60">
                  {paying ? 'Processing...' : `Pay ${money(payment.total)} (test)`}
                </button>
                <button type="button" disabled={paying} onClick={cancel} className="rounded-full border border-slate-300 px-5 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
