import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiX, FiMail, FiRefreshCw } from 'react-icons/fi';
import Swal from 'sweetalert2';
import BillDownloadButton from './BillDownloadButton';
import {
  fetchBill, formatRs, formatBillDate, paymentStatusMeta, billEmailMeta, sendBillEmail, resendBillEmail, notifyOrdersUpdated,
} from '../../utils/bill';

function InfoRow({ label, value, valueStyle }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-[#68778c]">{label}</span>
      <span className="text-right font-semibold text-[#102341]" style={valueStyle}>{value || '—'}</span>
    </div>
  );
}

/** Modal showing the official bill for an order, with PDF actions and email status. */
export default function BillViewer({ orderId, onClose, allowEmailActions = false }) {
  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const emailInFlight = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setBill(await fetchBill(orderId));
    } catch (err) {
      setError(err.message || 'Could not load the bill.');
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleEmail = async () => {
    if (emailInFlight.current || !bill) return;
    emailInFlight.current = true;
    setEmailBusy(true);
    try {
      const result = bill.email.sent ? await resendBillEmail(orderId) : await sendBillEmail(orderId);
      Swal.fire({ icon: 'success', text: result.message || 'Bill emailed.', timer: 2200, showConfirmButton: false });
      notifyOrdersUpdated();
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.message || 'Could not email the bill.' });
    } finally {
      emailInFlight.current = false;
      setEmailBusy(false);
      load();
    }
  };

  const payment = bill ? paymentStatusMeta(bill.paymentStatus) : null;
  const emailMeta = bill ? billEmailMeta(bill.email.status) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="UdyogConnect bill"
        className="relative w-full max-w-3xl overflow-hidden rounded-[24px] bg-white text-[#1f2a3d] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b-4 border-[#F2B71D] bg-[#102341] px-6 py-5">
          <div>
            <div className="text-2xl font-black text-white">UdyogConnect</div>
            <div className="text-xs font-semibold text-[#F2B71D]">Local Business Marketplace</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-black tracking-wide text-white">BILL / INVOICE</div>
            <div className="mt-1 font-mono text-xs font-bold text-[#F2B71D]">{bill?.billNumber || '…'}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close bill" className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-rose-600">{error}</p>
            <button type="button" onClick={load} className="mt-4 rounded-xl border border-[#E5EBF2] px-4 py-2 text-xs font-bold text-[#102341] hover:bg-slate-50">Try again</button>
          </div>
        ) : !bill ? (
          <div className="p-10 text-center text-sm text-[#68778c]">Loading bill…</div>
        ) : (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#E5EBF2] p-4">
                <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#102341]">Bill Information</h4>
                <InfoRow label="Bill Number" value={bill.billNumber} />
                <InfoRow label="Order ID" value={bill.orderId} />
                <InfoRow label="Order Date" value={formatBillDate(bill.orderDate)} />
                <InfoRow label="Payment Method" value={bill.paymentMethodLabel} />
                <InfoRow label="Payment Status" value={payment.label} valueStyle={{ color: payment.color }} />
              </div>
              <div className="rounded-2xl border border-[#E5EBF2] p-4">
                <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#102341]">Billed To</h4>
                <InfoRow label="Name" value={bill.customer.name} />
                {bill.customer.email && <InfoRow label="Email" value={bill.customer.email} />}
                <InfoRow label="Phone" value={bill.customer.phone} />
                <InfoRow label="Delivery" value={bill.customer.address} />
              </div>
            </div>

            <div className="rounded-2xl border border-[#E5EBF2] p-4">
              <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#102341]">Sold By</h4>
              <InfoRow label="Business" value={bill.business.name} />
              {bill.business.address && <InfoRow label="Address" value={bill.business.address} />}
              {(bill.business.phone || bill.business.email) && (
                <InfoRow label="Contact" value={[bill.business.phone, bill.business.email].filter(Boolean).join(' · ')} />
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#E5EBF2]">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-[#102341] text-white">
                  <tr>
                    <th className="px-3 py-2.5 font-bold">Product / Service</th>
                    <th className="px-3 py-2.5 text-center font-bold">Qty</th>
                    <th className="px-3 py-2.5 text-right font-bold">Unit Price</th>
                    <th className="px-3 py-2.5 text-right font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.items.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className={index % 2 ? 'bg-[#F8FAFC]' : ''}>
                      <td className="px-3 py-2.5">{item.name}{item.type === 'service' ? <span className="ml-1 text-[10px] text-[#68778c]">(Service)</span> : null}</td>
                      <td className="px-3 py-2.5 text-center">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right">{formatRs(item.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#102341]">{formatRs(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
              <div className="rounded-2xl border border-[#E5EBF2] p-4">
                <h4 className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#102341]">Payment</h4>
                <InfoRow label="Status" value={payment.label} valueStyle={{ color: payment.color }} />
                {bill.transactionId && <InfoRow label="Transaction ID" value={bill.transactionId} />}
                {bill.paidAt && <InfoRow label="Paid On" value={formatBillDate(bill.paidAt)} />}
                {bill.paymentNote && <p className="mt-2 text-[11px] text-[#68778c]">{bill.paymentNote}</p>}
              </div>
              <div className="space-y-1.5 rounded-2xl bg-[#F8FAFC] p-4 text-xs">
                <div className="flex justify-between"><span className="text-[#68778c]">Subtotal</span><span>{formatRs(bill.totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-[#68778c]">Delivery Fee</span><span>{formatRs(bill.totals.deliveryFee)}</span></div>
                <div className="flex justify-between"><span className="text-[#68778c]">Discount</span><span>{bill.totals.discount > 0 ? `- ${formatRs(bill.totals.discount)}` : formatRs(0)}</span></div>
                {bill.totals.tax > 0 && (
                  <div className="flex justify-between"><span className="text-[#68778c]">VAT ({Math.round(bill.totals.taxRate * 100)}%)</span><span>{formatRs(bill.totals.tax)}</span></div>
                )}
                <div className="mt-2 flex justify-between rounded-xl border-l-4 border-[#F2B71D] bg-[#FFF6DB] px-3 py-2 text-sm font-black text-[#102341]">
                  <span>Final Total</span><span>{formatRs(bill.totals.total)}</span>
                </div>
              </div>
            </div>

            {bill.email.to !== undefined && (bill.email.to || bill.email.status !== 'not_sent') && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5EBF2] px-4 py-3 text-xs">
                <div>
                  <span className="font-bold" style={{ color: emailMeta.color }}>{emailMeta.label}</span>
                  {bill.email.to && (
                    <span className="ml-2 text-[#52627a]">
                      {bill.email.sent ? `Bill sent to ${bill.email.to}` : `Customer email: ${bill.email.to}`}
                      {bill.email.sentAt ? ` · ${formatBillDate(bill.email.sentAt)}` : ''}
                    </span>
                  )}
                  {bill.email.error && <div className="mt-1 text-[11px] text-rose-600">Last error: {bill.email.error}</div>}
                </div>
                {allowEmailActions && bill.email.status !== 'sending' && (
                  <button
                    type="button"
                    onClick={handleEmail}
                    disabled={emailBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5EBF2] px-3 py-2 font-bold text-[#102341] hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                  >
                    {bill.email.sent ? <FiRefreshCw className="h-3.5 w-3.5" /> : <FiMail className="h-3.5 w-3.5" />}
                    {emailBusy ? 'Sending…' : bill.email.sent ? 'Resend Bill' : 'Email Bill'}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E5EBF2] pt-4">
              <BillDownloadButton orderId={orderId} mode="open" className="rounded-xl border border-[#E5EBF2] px-4 py-2.5 text-xs font-bold text-[#102341] hover:bg-slate-50" />
              <BillDownloadButton orderId={orderId} className="rounded-xl bg-[#F2B71D] px-4 py-2.5 text-xs font-bold text-[#102341] hover:bg-[#e5a915]" />
            </div>
            <p className="text-center text-[10px] text-[#68778c]">
              Thank you for shopping with UdyogConnect. This is a computer-generated bill and does not require a signature.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
