import React, { useRef, useState } from 'react';
import { FiDownload, FiExternalLink } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { downloadBillPdf, openBillPdf } from '../../utils/bill';

/** Downloads (or opens) the official bill PDF; ignores repeat clicks while a request is running. */
export default function BillDownloadButton({
  orderId,
  mode = 'download',
  label,
  className = '',
  style,
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const handleClick = async (event) => {
    event.stopPropagation();
    if (inFlight.current || !orderId) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (mode === 'open') await openBillPdf(orderId);
      else await downloadBillPdf(orderId);
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.message || 'Could not load the bill.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const Icon = mode === 'open' ? FiExternalLink : FiDownload;
  const idleLabel = label || (mode === 'open' ? 'Open PDF' : 'Download Bill');

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy}
      className={`inline-flex items-center justify-center gap-1.5 disabled:cursor-wait disabled:opacity-70 ${className}`}
      style={style}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{busy ? (mode === 'open' ? 'Opening…' : 'Preparing PDF…') : idleLabel}</span>
    </button>
  );
}
