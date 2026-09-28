import React, { useState } from 'react';
import Swal from 'sweetalert2';
import api, { getApiErrorMessage } from '../../utils/api';
import { orderFlowProgress } from '../../utils/esewa';

/** Customer-side progress checklist, delivery OTP and delivery confirmation for one order. */
export default function OrderTracking({ order, onUpdated }) {
  const [busy, setBusy] = useState(false);
  if (!order) return null;

  if (['cancelled', 'rejected'].includes(order.status)) {
    return (
      <div className="mt-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[11px] text-[#B91C1C]">
        {order.status === 'rejected' ? 'The business rejected this order.' : 'This order was cancelled.'}
        {order.rejectionReason ? ` Reason: ${order.rejectionReason}` : ''}
        {order.paymentStatus === 'paid' && order.paymentMethod === 'eSewa' ? ' Contact the business for your eSewa refund.' : ''}
      </div>
    );
  }

  const steps = orderFlowProgress(order);

  const finish = (updated, title) => {
    if (updated) onUpdated?.(updated);
    Swal.fire({ icon: 'success', title, timer: 1500, showConfirmButton: false });
  };

  const confirmReceived = async () => {
    const res = await Swal.fire({
      icon: 'question',
      title: 'Have you received your order?',
      showCancelButton: true,
      confirmButtonText: 'Yes, I received it',
      cancelButtonText: 'Not yet',
      confirmButtonColor: '#059669',
    });
    if (!res.isConfirmed) return;
    setBusy(true);
    try {
      const response = await api.patch(`/api/orders/${order._id}/order-received`);
      finish(response.data.order, 'Order completed. Thank you!');
    } catch (err) {
      Swal.fire({ icon: 'error', text: getApiErrorMessage(err, 'Could not confirm the order.') });
    } finally {
      setBusy(false);
    }
  };

  const enterOtp = async () => {
    const res = await Swal.fire({
      title: 'Enter delivery OTP',
      input: 'text',
      inputAttributes: { maxlength: 6, inputmode: 'numeric', autocomplete: 'one-time-code' },
      inputValidator: (value) => (/^\d{6}$/.test(String(value || '').trim()) ? undefined : 'Enter the 6-digit code.'),
      showCancelButton: true,
      confirmButtonText: 'Confirm delivery',
    });
    if (!res.isConfirmed) return;
    setBusy(true);
    try {
      const response = await api.post(`/api/orders/${order._id}/verify-otp`, { otp: String(res.value).trim() });
      finish(response.data.order, 'Delivery confirmed');
    } catch (err) {
      Swal.fire({ icon: 'error', text: getApiErrorMessage(err, 'OTP verification failed.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {steps.map((step) => (
          <li key={step.key} className={`flex items-center gap-1 text-[10px] font-semibold ${step.done ? 'text-[#059669]' : 'text-[#94A3B8]'}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${step.done ? 'bg-[#059669] text-white' : 'border border-[#CBD5E1]'}`}>
              {step.done ? '✓' : ''}
            </span>
            {step.label}
          </li>
        ))}
      </ol>

      {order.status === 'dispatched' && (
        <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-3">
          {order.deliveryOtp && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">Delivery OTP</p>
              <p className="mt-0.5 font-mono text-xl font-black tracking-[0.3em] text-[#4C1D95]">{order.deliveryOtp}</p>
              <p className="text-[10px] text-[#6B7280]">Share this code only when you receive your order.</p>
            </>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={confirmReceived} className="rounded-lg bg-[#059669] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#047857] disabled:opacity-60">
              Order Received
            </button>
            <button type="button" disabled={busy} onClick={enterOtp} className="rounded-lg border border-[#C4B5FD] px-3 py-1.5 text-[10px] font-bold text-[#6D28D9] hover:bg-white disabled:opacity-60">
              Enter OTP
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
