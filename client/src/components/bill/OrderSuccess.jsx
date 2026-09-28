import React, { useEffect, useRef, useState } from 'react';
import { FiCheckCircle, FiFileText, FiMail, FiShoppingBag } from 'react-icons/fi';
import BillViewer from './BillViewer';
import BillDownloadButton from './BillDownloadButton';
import {
  fetchBill, formatRs, paymentStatusMeta, PAYMENT_METHOD_LABELS, sendBillEmail, notifyOrdersUpdated,
} from '../../utils/bill';

const STATUS_POLL_MS = 2500;
const MAX_STATUS_POLLS = 6;

/**
 * Order confirmation built from the checkout / payment-verification response.
 * Only reads bill status while the email is still being sent; it never triggers billing itself.
 */
export default function OrderSuccess({ order, bill, user, onContinue }) {
  const [email, setEmail] = useState({
    status: bill?.emailStatus || 'not_sent',
    to: bill?.emailTo || order?.deliveryAddress?.email || user?.email || '',
  });
  const [showBill, setShowBill] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState('');
  const retryInFlight = useRef(false);
  const orderId = order?._id;
  const billNumber = bill?.billNumber || order?.billNumber;
  const payment = paymentStatusMeta(order?.paymentStatus);

  useEffect(() => {
    if (email.status !== 'sending' || !orderId) return undefined;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      try {
        const latest = await fetchBill(orderId);
        if (cancelled) return;
        if (latest.email.status !== 'sending' || polls >= MAX_STATUS_POLLS) {
          setEmail({ status: latest.email.status, to: latest.email.to || email.to });
          clearInterval(timer);
        }
      } catch (_) {
        if (polls >= MAX_STATUS_POLLS) clearInterval(timer);
      }
    }, STATUS_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [email.status, orderId]);

  const retryEmail = async () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    setRetryMessage('');
    try {
      const result = await sendBillEmail(orderId);
      setEmail({ status: result.bill?.emailStatus || 'sent', to: result.bill?.emailTo || email.to });
      notifyOrdersUpdated();
    } catch (err) {
      setRetryMessage(err.message || 'Could not email the bill. Please try again later.');
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  };

  if (!order) return null;

  return (
    <div className="mx-auto max-w-xl rounded-[28px] border border-[#e8dfd0] bg-white p-6 text-center shadow-sm sm:p-8">
      <FiCheckCircle className="mx-auto h-14 w-14 text-emerald-500" />
      <h2 className="mt-3 text-2xl font-black text-[#1a1a2e]">✓ Order Confirmed</h2>
      <p className="mt-1 text-sm text-slate-500">Thank you for shopping with UdyogConnect.</p>

      <div className="mt-6 space-y-2.5 rounded-2xl border border-[#e8dfd0] bg-[#fffaf0] p-4 text-left text-xs">
        <div className="flex justify-between gap-3"><span className="text-slate-500">Order ID</span><span className="font-mono font-bold text-[#1a1a2e]">{orderId}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">Bill Number</span><span className="font-mono font-bold text-[#1a1a2e]">{billNumber || 'Generating…'}</span></div>
        <div className="flex justify-between gap-3"><span className="text-slate-500">Payment</span>
          <span className="font-bold">
            <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: payment.bg, color: payment.color }}>{payment.label}</span>
            <span className="ml-2 font-semibold text-slate-500">{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</span>
          </span>
        </div>
        <div className="flex justify-between gap-3 border-t border-[#e8dfd0] pt-2.5 text-sm"><span className="font-bold text-[#1a1a2e]">Total</span><span className="font-black text-[#d49a00]">{formatRs(order.total)}</span></div>
      </div>

      {billNumber && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[#e8dfd0] px-4 py-3 text-left text-xs text-slate-600">
          <FiMail className="mt-0.5 h-4 w-4 shrink-0 text-[#d49a00]" />
          <div className="flex-1">
            {email.status === 'sent' && <>Your bill has been sent to: <strong className="text-[#1a1a2e]">{email.to}</strong></>}
            {email.status === 'sending' && <>Your bill is being emailed to: <strong className="text-[#1a1a2e]">{email.to}</strong></>}
            {(email.status === 'failed' || email.status === 'not_sent') && (
              <>
                We couldn&apos;t email your bill to <strong className="text-[#1a1a2e]">{email.to || 'your email'}</strong> yet. Your order is confirmed and the bill is available below.
                <button type="button" onClick={retryEmail} disabled={retrying} className="ml-1 font-bold text-[#d49a00] underline disabled:opacity-60">
                  {retrying ? 'Sending…' : 'Retry email'}
                </button>
                {retryMessage && <span className="mt-1 block text-rose-600">{retryMessage}</span>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setShowBill(true)}
          disabled={!billNumber}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[#e8dfd0] bg-[#fffaf0] py-2.5 text-xs font-bold text-[#1a1a2e] hover:bg-[#fef1c7] disabled:opacity-50"
        >
          <FiFileText className="h-3.5 w-3.5" /> View Bill
        </button>
        {billNumber ? (
          <BillDownloadButton orderId={orderId} className="rounded-full border border-[#e8dfd0] bg-[#fffaf0] py-2.5 text-xs font-bold text-[#1a1a2e] hover:bg-[#fef1c7]" />
        ) : (
          <button type="button" disabled className="rounded-full border border-[#e8dfd0] py-2.5 text-xs font-bold text-slate-400">Download Bill</button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#f2b71d] to-[#d4a017] py-2.5 text-xs font-bold text-[#1a1a2e] shadow-lg shadow-[#f2b71d]/20"
        >
          <FiShoppingBag className="h-3.5 w-3.5" /> Continue Shopping
        </button>
      </div>

      {showBill && <BillViewer orderId={orderId} onClose={() => setShowBill(false)} allowEmailActions />}
    </div>
  );
}
