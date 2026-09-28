import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import api, { getApiErrorMessage } from '../utils/api';

/**
 * Each business connects its own eSewa merchant account so customers pay the business directly.
 * The secret key is write-only: it is sent once to the backend, encrypted there, and never shown again.
 */
export default function EsewaPaymentSettings({ businessId, lang = 'en' }) {
  const t = (en, ne) => (lang === 'en' ? en : ne);
  const [settings, setSettings] = useState(null);
  const [merchantCode, setMerchantCode] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await api.get(`/api/business/payment/settings?businessId=${encodeURIComponent(businessId)}`);
      setSettings(res.data);
      setMerchantCode(res.data.merchantCode || '');
    } catch (err) {
      setSettings({ error: getApiErrorMessage(err, 'Could not load payment settings.') });
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    setSaving(true);
    setErrors({});
    try {
      const res = await api.post('/api/business/payment/connect', { businessId, ...body });
      setSettings(res.data.settings);
      setMerchantCode(res.data.settings.merchantCode || '');
      setSecretKey('');
      Swal.fire({ icon: 'success', title: t('eSewa connected', 'eSewa जोडियो'), text: t('Customers can now pay you directly with eSewa.', 'ग्राहकले अब eSewa बाट सिधै भुक्तानी गर्न सक्छन्।'), timer: 1800, showConfirmButton: false });
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      Swal.fire({ icon: 'error', text: getApiErrorMessage(err, 'Could not save payment settings.') });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    save({ merchantCode: merchantCode.trim(), secretKey: secretKey.trim() });
  };

  const handleDisconnect = async () => {
    const res = await Swal.fire({
      icon: 'warning',
      title: t('Disconnect eSewa?', 'eSewa हटाउने?'),
      text: t('Customers will no longer see eSewa at checkout. Your saved secret key will be deleted.', 'ग्राहकले चेकआउटमा eSewa देख्ने छैनन्।'),
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: t('Disconnect', 'हटाउनुहोस्'),
    });
    if (!res.isConfirmed) return;
    try {
      const response = await api.post('/api/business/payment/disconnect', { businessId });
      setSettings(response.data.settings);
    } catch (err) {
      Swal.fire({ icon: 'error', text: getApiErrorMessage(err, 'Could not disconnect eSewa.') });
    }
  };

  if (!settings) {
    return <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 text-xs text-slate-400">{t('Loading payment settings...', 'लोड हुँदैछ...')}</div>;
  }
  if (settings.error) {
    return <div className="rounded-2xl border border-rose-500/40 bg-slate-900/50 p-5 text-xs text-rose-400">{settings.error}</div>;
  }

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none';

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">eSewa Merchant Account</p>
          <p className="text-xs text-slate-400">{t('Payments go straight to your own eSewa account. The platform never holds your money.', 'भुक्तानी सिधै तपाईंको eSewa खातामा जान्छ।')}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${settings.isConnected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-slate-600 text-slate-400'}`}>
          {settings.isConnected ? t('Connected', 'जोडिएको') : t('Not connected', 'जोडिएको छैन')}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">{t('Business Name', 'व्यवसायको नाम')}</span>
          <input className={`${inputClass} opacity-70`} value={settings.businessName} readOnly />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">{t('eSewa Merchant Code', 'eSewa मर्चेन्ट कोड')} *</span>
          <input
            className={inputClass}
            value={merchantCode}
            onChange={(e) => setMerchantCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40))}
            placeholder="e.g. EPAYTEST"
            autoComplete="off"
            required
          />
          {errors.merchantCode && <span className="text-[11px] text-rose-400">{errors.merchantCode}</span>}
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[11px] font-semibold text-slate-400">{t('Secret Key', 'सिक्रेट की')} {settings.hasSecretKey ? '' : '*'}</span>
          <input
            type="password"
            className={inputClass}
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value.slice(0, 200))}
            placeholder={settings.hasSecretKey ? t('Saved securely — leave blank to keep it', 'सुरक्षित छ — परिवर्तन नगर्न खाली छोड्नुहोस्') : t('Paste the secret key from your eSewa merchant portal', 'eSewa मर्चेन्ट पोर्टलबाट सिक्रेट की राख्नुहोस्')}
            autoComplete="new-password"
            required={!settings.hasSecretKey}
          />
          {errors.secretKey && <span className="text-[11px] text-rose-400">{errors.secretKey}</span>}
          <span className="block text-[10px] text-slate-500">{t('Encrypted on our server and never shown again.', 'सर्भरमा इन्क्रिप्ट गरिन्छ र फेरि देखाइँदैन।')}</span>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">Success URL</span>
          <input className={`${inputClass} opacity-70 text-xs`} value={settings.successUrl} readOnly />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-slate-400">Failure URL</span>
          <input className={`${inputClass} opacity-70 text-xs`} value={settings.failureUrl} readOnly />
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-400 transition disabled:opacity-60">
            {saving ? t('Saving...', 'सेभ हुँदैछ...') : settings.isConnected ? t('Update eSewa', 'eSewa अपडेट') : t('Connect eSewa', 'eSewa जोड्नुहोस्')}
          </button>
          {settings.sandboxAvailable && (
            <button type="button" disabled={saving} onClick={() => save({ useSandboxCredentials: true })} className="rounded-xl border border-emerald-500/40 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition disabled:opacity-60">
              {t('Use eSewa sandbox test account', 'eSewa परीक्षण खाता प्रयोग')}
            </button>
          )}
          {settings.isConnected && (
            <button type="button" onClick={handleDisconnect} className="rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition">
              {t('Disconnect', 'हटाउनुहोस्')}
            </button>
          )}
        </div>
      </form>

      {settings.platformEnvironment === 'sandbox' && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-300">
          {t(
            'Test mode: payments use the eSewa sandbox. Test wallet: eSewa ID 9806800001 (to 9806800005), password Nepal@123, MPIN 1122, OTP 123456.',
            'परीक्षण मोड: eSewa sandbox प्रयोग हुन्छ। eSewa ID 9806800001, पासवर्ड Nepal@123, MPIN 1122, OTP 123456।'
          )}
        </p>
      )}
    </div>
  );
}
