import React, { useEffect, useRef, useState } from 'react';
import api from '../utils/api';
import { createIdempotencyHeader, createSubmissionGuard } from '../utils/submitProtection';

const nepalTodayKey = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

/**
 * Dynamic service booking: Date → Time → optional staff/home → Confirm.
 * Slots come from GET /api/bookings/availability (Nepal time, server authority).
 */
export default function ServiceBookingForm({
  businessId,
  service,
  user,
  lang = 'en',
  onCancel,
  onSuccess,
  variant = 'dark',
}) {
  const t = (en, ne) => (lang === 'ne' ? ne : en);
  const isDark = variant === 'dark';
  const submitGuard = React.useMemo(() => createSubmissionGuard(), []);

  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [staff, setStaff] = useState('');
  const [homeService, setHomeService] = useState(false);
  const [slots, setSlots] = useState([]);
  const [minDate, setMinDate] = useState(nepalTodayKey());
  const [maxDate, setMaxDate] = useState('');
  const [availabilityMsg, setAvailabilityMsg] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [minNotice, setMinNotice] = useState(30);
  const fetchSeq = useRef(0);

  const inputClass = isDark
    ? 'w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white'
    : 'w-full rounded-xl border border-[#E5EBF2] bg-white px-3 py-2 text-sm text-[#102341]';
  const labelClass = isDark
    ? 'block text-[10px] font-bold text-slate-450 uppercase mb-1'
    : 'block text-[11px] font-bold text-[#68778c] uppercase mb-1';
  const msgClass = isDark ? 'text-xs text-amber-300' : 'text-xs text-amber-700';

  useEffect(() => {
    setDate('');
    setSlot('');
    setStaff('');
    setHomeService(false);
    setSlots([]);
    setAvailabilityMsg('');
    setMinDate(nepalTodayKey());
  }, [service?._id, businessId]);

  useEffect(() => {
    if (!businessId || !service?._id || !date) {
      setSlots([]);
      setSlot('');
      return undefined;
    }

    const seq = ++fetchSeq.current;
    let cancelled = false;
    setLoadingSlots(true);
    setAvailabilityMsg('');
    setSlot('');

    const params = { businessId, serviceId: service._id, date };
    if (staff) params.staffMember = staff;

    api.get('/api/bookings/availability', { params })
      .then((res) => {
        if (cancelled || seq !== fetchSeq.current) return;
        const data = res.data || {};
        setSlots(Array.isArray(data.slots) ? data.slots : []);
        if (data.minDate) setMinDate(data.minDate);
        if (data.maxDate) setMaxDate(data.maxDate);
        if (data.settings?.minBookingNoticeMinutes != null) {
          setMinNotice(Number(data.settings.minBookingNoticeMinutes) || 30);
        }
        if (!data.success && data.message) {
          setAvailabilityMsg(data.message);
        } else if (!(data.slots || []).length) {
          setAvailabilityMsg(data.message || t('No available time slots for this date.', 'यो मितिमा उपलब्ध समय छैन।'));
        } else {
          setAvailabilityMsg('');
        }
      })
      .catch((err) => {
        if (cancelled || seq !== fetchSeq.current) return;
        const data = err.response?.data || {};
        setSlots([]);
        setAvailabilityMsg(data.message || t('Could not load available times.', 'उपलब्ध समय लोड गर्न सकिएन।'));
        if (data.minDate) setMinDate(data.minDate);
        if (data.maxDate) setMaxDate(data.maxDate);
      })
      .finally(() => {
        if (!cancelled && seq === fetchSeq.current) setLoadingSlots(false);
      });

    return () => { cancelled = true; };
  }, [businessId, service?._id, date, staff]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    if (!user) {
      setAvailabilityMsg(t('Please sign in to book an appointment.', 'कृपया अपोइन्टमेन्ट बुक गर्न लगइन गर्नुहोस्।'));
      submitGuard.finish();
      return;
    }
    if (!date) {
      setAvailabilityMsg(t('Please select a future date.', 'कृपया भविष्यको मिति चयन गर्नुहोस्।'));
      submitGuard.finish();
      return;
    }
    if (!slot) {
      setAvailabilityMsg(t('Please select an available time.', 'कृपया उपलब्ध समय चयन गर्नुहोस्।'));
      submitGuard.finish();
      return;
    }

    setSubmitting(true);
    try {
      await api.post(
        '/api/bookings',
        {
          businessId,
          serviceId: service._id,
          date,
          timeSlot: slot,
          staffMember: staff || undefined,
          homeService,
        },
        { headers: { ...createIdempotencyHeader('booking-create') } }
      );
      onSuccess?.({ date, slot, service });
      setDate('');
      setSlot('');
      setStaff('');
      setHomeService(false);
      setSlots([]);
      setAvailabilityMsg('');
    } catch (err) {
      const data = err.response?.data || {};
      setAvailabilityMsg(data.message || t('Booking request failed.', 'बुकिङ असफल भयो।'));
      if (Array.isArray(data.slots)) setSlots(data.slots);
      if (date && service?._id) {
        api.get('/api/bookings/availability', {
          params: { businessId, serviceId: service._id, date, staffMember: staff || undefined },
        }).then((res) => {
          setSlots(Array.isArray(res.data?.slots) ? res.data.slots : []);
        }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
      submitGuard.finish();
    }
  };

  const staffList = Array.isArray(service?.staff) ? service.staff : [];
  const durationLabel = Number(service?.duration) || 60;
  const servicePhoto = service?.imageUrl || service?.image || service?.images?.[0] || '';

  return (
    <form onSubmit={handleSubmit} className={isDark ? 'space-y-3' : 'space-y-4'}>
      <div className="flex gap-3 items-start">
        {servicePhoto ? (
          <img
            src={servicePhoto}
            alt={service?.name || 'Service'}
            className={isDark
              ? 'h-14 w-14 rounded-xl object-cover border border-slate-700 shrink-0'
              : 'h-14 w-14 rounded-xl object-cover border border-[#E5EBF2] shrink-0'}
          />
        ) : null}
        <div>
          <p className={isDark ? 'text-sm font-bold text-slate-200' : 'text-sm font-bold text-[#102341]'}>
            {service?.name}
          </p>
          <p className={isDark ? 'text-xs text-amber-400 font-bold mt-1' : 'text-xs text-[#0B5FFF] mt-1'}>
            Rs. {service?.price} · {durationLabel} mins
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t('Choose Date', 'मिति चयन')}</label>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate || undefined}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>{t('Available Time', 'उपलब्ध समय')}</label>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className={inputClass}
            required
            disabled={!date || loadingSlots || !slots.length}
          >
            <option value="">
              {loadingSlots
                ? t('Loading…', 'लोड हुँदै…')
                : t('-- select time --', '-- समय चयन --')}
            </option>
            {slots.map((s) => (
              <option key={s.value || s.label} value={s.label || s.value}>
                {s.label || s.value}
                {s.endLabel ? ` – ${s.endLabel}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(staffList.length > 0 || service?.homeService) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {staffList.length > 0 && (
            <div>
              <label className={labelClass}>{t('Staff Member', 'कर्मचारी')}</label>
              <select
                value={staff}
                onChange={(e) => setStaff(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('Any available staff', 'कुनै पनि उपलब्ध कर्मचारी')}</option>
                {staffList.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          )}
          {service?.homeService && (
            <label className={`flex items-center gap-2 ${staffList.length ? 'mt-6' : ''}`}>
              <input
                type="checkbox"
                checked={homeService}
                onChange={(e) => setHomeService(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-400"
              />
              <span className={isDark ? 'text-xs text-slate-300' : 'text-xs text-[#52627a]'}>
                {t('Provide Home Service', 'घरमै सेवा उपलब्ध')}
              </span>
            </label>
          )}
        </div>
      )}

      {availabilityMsg && (
        <p className={msgClass} role="status">{availabilityMsg}</p>
      )}
      {date && !loadingSlots && !availabilityMsg && slots.length > 0 && (
        <p className={isDark ? 'text-[11px] text-slate-500' : 'text-[11px] text-[#68778c]'}>
          {t(
            `Times use Nepal time. Minimum notice: ${minNotice} minutes.`,
            `समय नेपाल समयमा छ। न्यूनतम सूचना: ${minNotice} मिनेट।`
          )}
        </p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={isDark
              ? 'flex-1 rounded-xl border border-slate-700 py-2.5 text-xs font-bold text-slate-300'
              : 'flex-1 rounded-xl border border-[#E5EBF2] py-2.5 text-xs font-bold text-[#52627a]'}
          >
            {t('Cancel', 'रद्द गर्नुहोस्')}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !date || !slot || loadingSlots}
          className={isDark
            ? 'flex-1 rounded-xl bg-amber-400 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60'
            : 'flex-1 rounded-xl bg-[#0B5FFF] py-2.5 text-xs font-bold text-white disabled:opacity-60'}
        >
          {submitting
            ? t('Processing...', 'प्रोसेस हुँदै...')
            : t('Confirm Appointment', 'अपोइन्टमेन्ट पक्का गर्नुहोस्')}
        </button>
      </div>
    </form>
  );
}
