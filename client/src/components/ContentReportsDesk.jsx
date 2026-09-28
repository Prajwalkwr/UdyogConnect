import React, { useCallback, useEffect, useState } from 'react';
import { FiAlertTriangle, FiBriefcase, FiCheckCircle, FiExternalLink, FiFlag, FiMessageSquare, FiRefreshCw, FiStar, FiTrash2, FiXCircle } from 'react-icons/fi';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { CONTENT_REPORTS_EVENT, REPORT_REASON_LABELS } from '../utils/reports';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLES = {
  open: 'bg-rose-50 text-rose-700 border-rose-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  dismissed: 'bg-slate-100 text-slate-600 border-slate-200',
};

// The global unlayered `button { font: inherit }` rule outranks Tailwind text-size utilities on buttons.
const SMALL_TEXT = { fontSize: 12 };
const ACTION_TEXT = { fontSize: 11 };

const formatWhen = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ContentReportsDesk({ lang, refreshTick = 0, onChanged }) {
  const translate = (enText, neText) => (lang === 'en' ? enText : neText);
  const [filter, setFilter] = useState('open');
  const [data, setData] = useState({ counts: { open: 0, resolved: 0, dismissed: 0 }, items: [] });
  const [status, setStatus] = useState('loading');
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/api/admin/content-reports?status=${filter}`);
      setData({
        counts: response.data?.counts || { open: 0, resolved: 0, dismissed: 0 },
        items: Array.isArray(response.data?.items) ? response.data.items : [],
      });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [filter]);

  useEffect(() => {
    setStatus('loading');
    load();
  }, [load, refreshTick]);

  useEffect(() => {
    window.addEventListener(CONTENT_REPORTS_EVENT, load);
    return () => window.removeEventListener(CONTENT_REPORTS_EVENT, load);
  }, [load]);

  const runAction = async (item, action) => {
    if (busyKey) return;
    if (action === 'remove_review') {
      const confirm = await Swal.fire({
        title: translate('Remove this review?', 'यो समीक्षा हटाउने?'),
        text: translate('The review is deleted for everyone and the business rating is recalculated.', 'समीक्षा सबैका लागि हटाइनेछ र व्यवसायको रेटिङ पुनः गणना हुनेछ।'),
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: translate('Remove Review', 'समीक्षा हटाउनुहोस्'),
        confirmButtonColor: '#dc2626',
      });
      if (!confirm.isConfirmed) return;
    }
    setBusyKey(item.key);
    try {
      await api.post('/api/admin/content-reports/action', {
        targetType: item.targetType,
        targetId: item.targetId,
        action,
      });
      const messages = {
        remove_review: translate('Review removed.', 'समीक्षा हटाइयो।'),
        resolve: translate('Reports marked as resolved.', 'रिपोर्टहरू समाधान भयो।'),
        dismiss: translate('Reports dismissed.', 'रिपोर्टहरू खारेज गरियो।'),
      };
      Swal.fire({ icon: 'success', text: messages[action] });
      await load();
      window.dispatchEvent(new CustomEvent(CONTENT_REPORTS_EVENT));
      onChanged?.();
    } catch (error) {
      Swal.fire({ icon: 'error', text: error.response?.data?.message || translate('Could not update the reports.', 'रिपोर्ट अद्यावधिक गर्न सकिएन।') });
    } finally {
      setBusyKey('');
    }
  };

  const { counts, items } = data;
  const allCount = counts.open + counts.resolved + counts.dismissed;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-extrabold text-[#0B1A30]">
            <FiFlag className="text-rose-600" /> {translate('Reports & Moderation', 'रिपोर्ट र मध्यस्थता')}
          </h3>
          <p className="text-xs text-[#57657A]">
            {translate('Businesses and reviews reported by users. Reporter identities are only visible to admins.', 'प्रयोगकर्ताले रिपोर्ट गरेका व्यवसाय र समीक्षाहरू। रिपोर्ट गर्नेको पहिचान प्रशासकलाई मात्र देखिन्छ।')}
          </p>
        </div>
        <button type="button" onClick={load} style={SMALL_TEXT} className="inline-flex items-center gap-2 rounded-full border border-[#DDE5ED] bg-white px-4 py-2 text-xs font-bold text-[#0B1A30] hover:border-amber-400">
          <FiRefreshCw /> {translate('Refresh', 'ताजा गर्नुहोस्')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = option.id === 'all' ? allCount : counts[option.id] || 0;
          const active = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              style={SMALL_TEXT}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${active ? 'border-[#0B1A30] bg-[#0B1A30] text-[#fff]' : 'border-[#DDE5ED] bg-white text-[#334B68] hover:border-amber-400'}`}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {status === 'loading' && items.length === 0 ? (
        <div className="rounded-3xl border border-[#DDE5ED] bg-white py-10 text-center text-xs text-[#68778C]">{translate('Loading reports…', 'रिपोर्ट लोड हुँदैछ…')}</div>
      ) : status === 'error' ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 py-10 text-center text-xs text-rose-700">
          {translate('Could not load reports.', 'रिपोर्ट लोड गर्न सकिएन।')}{' '}
          <button type="button" onClick={load} className="font-bold underline">{translate('Try again', 'फेरि प्रयास गर्नुहोस्')}</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border border-[#DDE5ED] bg-white py-12 text-center">
          <FiCheckCircle className="mx-auto mb-2 h-7 w-7 text-emerald-500" />
          <p className="text-sm font-bold text-[#0B1A30]">
            {filter === 'open' ? translate('No open reports', 'कुनै खुला रिपोर्ट छैन') : translate('Nothing here yet', 'यहाँ केही छैन')}
          </p>
          <p className="mt-1 text-xs text-[#68778C]">{translate('New reports from customers will show up here.', 'ग्राहकका नयाँ रिपोर्टहरू यहाँ देखिनेछन्।')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isReview = item.targetType === 'review';
            const open = item.openCount > 0;
            const itemStatus = open ? 'open' : item.reports[0]?.status || 'resolved';
            const busy = busyKey === item.key;
            return (
              <article key={item.key} className={`rounded-3xl border bg-white p-4 shadow-sm ${open ? 'border-rose-200' : 'border-[#DDE5ED]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${isReview ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      {isReview ? <FiMessageSquare /> : <FiBriefcase />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#68778C]">{isReview ? translate('Review', 'समीक्षा') : translate('Business', 'व्यवसाय')}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${STATUS_STYLES[itemStatus]}`}>{itemStatus}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          <FiAlertTriangle /> {item.reports.length} {item.reports.length === 1 ? translate('report', 'रिपोर्ट') : translate('reports', 'रिपोर्टहरू')}
                        </span>
                        {!item.target?.exists ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{translate('Deleted', 'हटाइएको')}</span>
                        ) : null}
                      </div>
                      {isReview ? (
                        <>
                          <p className="mt-1 text-sm font-bold text-[#0B1A30]">
                            {item.target?.customerName || translate('Customer', 'ग्राहक')}
                            <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-amber-500">
                              {Array.from({ length: Math.max(0, Math.min(5, Math.round(item.target?.rating || 0))) }).map((_, i) => <FiStar key={i} className="h-3 w-3 fill-current" />)}
                            </span>
                          </p>
                          <p className="mt-1 text-xs italic text-[#334B68]">"{item.target?.comment || ''}"</p>
                          {item.businessName ? <p className="mt-1 text-[11px] text-[#68778C]">{translate('On', 'मा')} {item.businessName}</p> : null}
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-sm font-bold text-[#0B1A30]">{item.target?.name || item.businessName || translate('Business', 'व्यवसाय')}</p>
                          <p className="text-[11px] text-[#68778C]">{[item.target?.category, item.target?.location].filter(Boolean).join(' · ')}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {item.businessId && item.target?.exists !== false ? (
                      <a
                        href={`/business-profile/${item.businessId}${isReview ? '?tab=reviews' : ''}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#DDE5ED] bg-white px-3 py-1.5 text-[11px] font-bold text-[#334B68] hover:border-amber-400"
                      >
                        <FiExternalLink /> {translate('View', 'हेर्नुहोस्')}
                      </a>
                    ) : null}
                    {open && isReview && item.target?.exists ? (
                      <button type="button" disabled={busy} onClick={() => runAction(item, 'remove_review')} style={ACTION_TEXT} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-[#fff] hover:bg-rose-700 disabled:opacity-60">
                        <FiTrash2 /> {translate('Remove Review', 'समीक्षा हटाउनुहोस्')}
                      </button>
                    ) : null}
                    {open ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => runAction(item, 'resolve')} style={ACTION_TEXT} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
                          <FiCheckCircle /> {translate('Mark Resolved', 'समाधान भयो')}
                        </button>
                        <button type="button" disabled={busy} onClick={() => runAction(item, 'dismiss')} style={ACTION_TEXT} className="inline-flex items-center gap-1.5 rounded-full border border-[#DDE5ED] bg-white px-3 py-1.5 text-[11px] font-bold text-[#57657A] hover:border-slate-400 disabled:opacity-60">
                          <FiXCircle /> {translate('Dismiss', 'खारेज')}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <ul className="mt-3 space-y-2 border-t border-[#EEF2F6] pt-3">
                  {item.reports.map((report) => (
                    <li key={report._id} className="rounded-2xl bg-[#F8FAFC] px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#0B1A30]">
                          {report.reasonLabel || REPORT_REASON_LABELS[report.reason] || report.reason}
                        </span>
                        <span className="text-[10px] text-[#68778C]">
                          {translate('by', 'द्वारा')} <b className="text-[#334B68]">{report.reporterName || translate('User', 'प्रयोगकर्ता')}</b>
                          {report.reporterRole ? ` (${report.reporterRole})` : ''} · {formatWhen(report.createdAt)}
                        </span>
                      </div>
                      {report.details ? <p className="mt-1 text-xs text-[#334B68]">{report.details}</p> : null}
                      {report.status !== 'open' && report.resolution ? (
                        <p className="mt-1 text-[10px] font-semibold text-[#68778C]">
                          {report.status === 'dismissed' ? translate('Dismissed', 'खारेज') : translate('Resolved', 'समाधान')}: {report.resolution}
                          {report.resolvedAt ? ` · ${formatWhen(report.resolvedAt)}` : ''}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
