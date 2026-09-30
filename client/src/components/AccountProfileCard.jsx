import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import { FiBriefcase, FiHome, FiMapPin, FiPhone, FiX } from 'react-icons/fi';
import api from '../utils/api';
import { normalizeUser } from '../utils/authFlow';
import { updateSessionUser } from '../utils/sessionAuth';
import { createIdempotencyHeader, createSubmissionGuard } from '../utils/submitProtection';
import {
  ADDRESS_LABELS,
  DELIVERY_CITIES,
  PROVINCES,
  emptyAddressDraft,
  prefillAddressDraft,
  sanitizePhone,
  sanitizeWords,
  toAddressDraft,
  validateDeliveryAddress,
} from '../utils/deliveryAddress';

const fieldClass = (hasError) => `w-full rounded-lg border bg-white px-3.5 py-3 pr-10 text-sm text-[#102341] outline-none transition placeholder:text-[#94A3B8] focus:ring-2 ${
  hasError ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100' : 'border-[#D6DEE8] focus:border-[#F2B71D] focus:ring-[#F2B71D]/20'
}`;

function AddressField({ label, error, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold text-[#334155]">{label}</span>
      {children}
      {error ? <span className="block text-[11px] font-medium text-rose-500">{error}</span> : null}
    </label>
  );
}

function ClearableInput({ value, onChange, onClear, error, ...props }) {
  return (
    <div className="relative">
      <input value={value} onChange={onChange} className={fieldClass(error)} {...props} />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[#CBD5E1] text-white transition hover:bg-[#94A3B8]"
          aria-label={`Clear ${props['aria-label'] || 'field'}`}
        >
          <FiX className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

export default function AccountProfileCard({ user, lang }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddressDraft);
  const [addressErrors, setAddressErrors] = useState({});
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const submitGuard = useMemo(() => createSubmissionGuard(), []);
  const addressGuard = useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  const persistUser = (updatedUser) => {
    const normalized = normalizeUser({ ...user, ...updatedUser });
    dispatch({ type: 'SET_USER', payload: normalized });
    updateSessionUser(normalized);
    return normalized;
  };

  useEffect(() => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setProfilePhoto(null);
    setPreviewUrl(user?.profilePicture || '');
    setAddresses(Array.isArray(user?.addresses) ? user.addresses : []);
  }, [user]);

  useEffect(() => {
    if (!profilePhoto) return undefined;
    const objectUrl = URL.createObjectURL(profilePhoto);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhoto]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!submitGuard.begin()) return;
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('phone', phone || '');
      if (profilePhoto) {
        formData.append('profilePhoto', profilePhoto);
      }

      const response = await api.put('/api/auth/profile', formData, {
        headers: {
          ...createIdempotencyHeader('account-profile'),
        },
        timeout: 60000,
      });
      const updatedUser = response.data?.user || response.data;
      if (updatedUser) {
        const normalized = persistUser(updatedUser);
        setPreviewUrl(normalized.profilePicture || previewUrl);
        setProfilePhoto(null);
      }
      Swal.fire({ icon: 'success', title: translate('Profile Updated', 'प्रोफाइल अद्यावधिक भयो') });
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Profile update failed.' });
    } finally {
      setIsSubmitting(false);
      submitGuard.finish();
    }
  };

  const saveAddresses = async (nextAddresses) => {
    const response = await api.put('/api/auth/profile', { addresses: nextAddresses }, {
      headers: createIdempotencyHeader('account-addresses'),
    });
    const updatedUser = response.data?.user || response.data;
    if (updatedUser) {
      const normalized = persistUser(updatedUser);
      setAddresses(Array.isArray(normalized.addresses) ? normalized.addresses : nextAddresses);
    } else {
      setAddresses(nextAddresses);
    }
  };

  const closeAddressForm = () => {
    setShowAddressForm(false);
    setEditingAddressId(null);
    setAddressForm(emptyAddressDraft);
    setAddressErrors({});
  };

  const openAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm(prefillAddressDraft(user, addresses));
    setAddressErrors({});
    setShowAddressForm(true);
  };

  const openEditAddress = (entry) => {
    setEditingAddressId(entry._id || entry.id || null);
    const draft = toAddressDraft(entry);
    const fallback = prefillAddressDraft(user, []);
    setAddressForm({ ...draft, fullName: draft.fullName || fallback.fullName, phone: draft.phone || fallback.phone });
    setAddressErrors({});
    setShowAddressForm(true);
  };

  const updateAddressField = (field, value) => {
    setAddressForm((prev) => ({ ...prev, [field]: value }));
    setAddressErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    const draft = {
      ...addressForm,
      fullName: addressForm.fullName.trim(),
      address: addressForm.address.trim(),
      landmark: addressForm.landmark.trim(),
    };
    const errors = validateDeliveryAddress(draft);
    if (Object.keys(errors).length) {
      setAddressErrors(errors);
      return;
    }
    if (!addressGuard.begin()) return;
    setIsSavingAddress(true);
    const saved = { ...draft, title: draft.label, location: draft.city };
    try {
      const nextAddresses = editingAddressId
        ? addresses.map((item) => (String(item._id || item.id) === String(editingAddressId) ? { _id: item._id || item.id, ...saved } : item))
        : [...addresses, { _id: `addr_${Date.now()}`, ...saved }];
      await saveAddresses(nextAddresses);
      closeAddressForm();
      Swal.fire({
        icon: 'success',
        title: editingAddressId
          ? translate('Address updated', 'ठेगाना अद्यावधिक भयो')
          : translate('Address added', 'ठेगाना थपियो'),
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Unable to save address.' });
    } finally {
      setIsSavingAddress(false);
      addressGuard.finish();
    }
  };

  const handleRemoveAddress = async (entry) => {
    const id = entry._id || entry.id;
    const result = await Swal.fire({
      title: translate('Remove address?', 'ठेगाना हटाउने?'),
      text: [entry.address, entry.city || entry.location].filter(Boolean).join(', ') || entry.title || '',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: translate('Remove', 'हटाउनुहोस्'),
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      const nextAddresses = addresses.filter((item) => String(item._id || item.id) !== String(id));
      await saveAddresses(nextAddresses);
      if (editingAddressId && String(editingAddressId) === String(id)) closeAddressForm();
      Swal.fire({
        icon: 'success',
        title: translate('Address removed', 'ठेगाना हटाइयो'),
        timer: 1100,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({ icon: 'error', text: err.response?.data?.message || 'Unable to remove address.' });
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-7rem)] space-y-6">
      <div className="rounded-2xl border border-[#E5EBF2] bg-white p-5 shadow-[0_8px_28px_rgba(16,35,65,0.06)] sm:p-8 lg:p-10">
        <div className="mb-8 border-b border-[#EEF2F7] pb-6">
          <h3 className="text-2xl font-extrabold tracking-tight text-[#102341] sm:text-3xl">
            {translate('Settings', 'सेटिङहरू')}
          </h3>
          <p className="mt-2 text-sm text-[#52627a]">
            {translate('Update your profile and delivery addresses.', 'आफ्नो प्रोफाइल र डेलिभरी ठेगाना अद्यावधिक गर्नुहोस्।')}
          </p>
        </div>

        <form onSubmit={handleUpdateProfile} className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-col gap-5 rounded-2xl border border-[#E8EDF4] bg-[#F8FAFC] p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F2B71D] bg-gradient-to-br from-[#F2B71D] to-[#E0A615] text-3xl font-black text-[#102341] shadow-sm">
              {previewUrl ? (
                <img src={previewUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                (name || user?.email || 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                {translate('Profile Photo', 'प्रोफाइल फोटो')}
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#102341] outline-none file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-[#F2B71D] file:px-4 file:py-2 file:text-sm file:font-bold file:text-[#102341] hover:file:bg-[#E0A615] focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
              />
              {profilePhoto && (
                <p className="text-xs font-semibold text-emerald-600">Selected: {profilePhoto.name}</p>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                {translate('Full Name', 'पूरा नाम')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3.5 text-sm font-medium text-[#102341] outline-none placeholder:text-[#94A3B8] focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
                placeholder="Your full name"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                {translate('Phone Number', 'फोन नम्बर')}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3.5 text-sm font-medium text-[#102341] outline-none placeholder:text-[#94A3B8] focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
                placeholder="98XXXXXXXX"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
              {translate('Email', 'इमेल')}
            </label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3.5 text-sm font-medium text-[#475569] outline-none"
            />
            <p className="text-xs text-[#64748B]">Email cannot be changed from this page.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[#EEF2F7] pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#F2B71D] px-8 py-3.5 text-sm font-bold text-[#102341] shadow-sm transition hover:bg-[#E0A615] disabled:opacity-60"
            >
              {isSubmitting ? translate('Saving...', 'सेभ हुँदै...') : translate('Save profile', 'प्रोफाइल सेभ गर्नुहोस्')}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-[#E5EBF2] bg-white p-5 shadow-[0_8px_28px_rgba(16,35,65,0.06)] sm:p-8 lg:p-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-[#EEF2F7] pb-5">
          <div>
            <h3 className="text-xl font-extrabold tracking-tight text-[#102341] sm:text-2xl">
              {translate('Delivery Addresses', 'डेलिभरी ठेगानाहरू')}
            </h3>
            <p className="mt-1.5 text-sm text-[#52627a]">
              {translate('Add addresses for faster checkout.', 'छिटो चेकआउटका लागि ठेगाना थप्नुहोस्।')}
            </p>
          </div>
          {!showAddressForm ? (
            <button
              type="button"
              onClick={openAddAddress}
              className="rounded-xl bg-[#0B1A30] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#16253d]"
            >
              {translate('Add address', 'ठेगाना थप्नुहोस्')}
            </button>
          ) : null}
        </div>

        {showAddressForm ? (
          <form onSubmit={handleSaveAddress} noValidate className="mb-6 overflow-hidden rounded-2xl border border-[#E8EDF4] bg-white">
            <div className="flex items-center justify-between gap-3 bg-[#F1F4F8] px-4 py-3 sm:px-6">
              <h4 className="text-lg font-semibold text-[#102341]">
                {editingAddressId ? translate('Edit My Address', 'मेरो ठेगाना सम्पादन') : translate('Add New Address', 'नयाँ ठेगाना थप्नुहोस्')}
              </h4>
              {editingAddressId ? (
                <button
                  type="button"
                  onClick={() => handleRemoveAddress(addresses.find((item) => String(item._id || item.id) === String(editingAddressId)) || {})}
                  className="text-sm font-semibold text-[#0EA5E9] hover:text-[#0284C7]"
                >
                  {translate('Delete', 'मेटाउनुहोस्')}
                </button>
              ) : null}
            </div>

            <div className="grid gap-x-8 gap-y-5 p-4 sm:p-6 md:grid-cols-2">
              <div className="space-y-5">
                <AddressField label={translate('Full Name', 'पूरा नाम')} error={addressErrors.fullName}>
                  <ClearableInput
                    type="text"
                    aria-label="Full Name"
                    autoComplete="name"
                    maxLength={60}
                    placeholder={translate('Enter your full name', 'पूरा नाम लेख्नुहोस्')}
                    value={addressForm.fullName}
                    error={addressErrors.fullName}
                    onChange={(e) => updateAddressField('fullName', sanitizeWords(e.target.value))}
                    onClear={() => updateAddressField('fullName', '')}
                  />
                </AddressField>
                <AddressField label={translate('Phone Number', 'फोन नम्बर')} error={addressErrors.phone}>
                  <ClearableInput
                    type="tel"
                    aria-label="Phone Number"
                    autoComplete="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder={translate('Enter your phone number', 'फोन नम्बर लेख्नुहोस्')}
                    value={addressForm.phone}
                    error={addressErrors.phone}
                    onChange={(e) => updateAddressField('phone', sanitizePhone(e.target.value))}
                    onClear={() => updateAddressField('phone', '')}
                  />
                </AddressField>
                <AddressField label={translate('Landmark (Optional)', 'स्थलचिन्ह (ऐच्छिक)')} error={addressErrors.landmark}>
                  <ClearableInput
                    type="text"
                    aria-label="Landmark"
                    maxLength={120}
                    placeholder={translate('E.g. beside train station', 'जस्तै: बस पार्क नजिक')}
                    value={addressForm.landmark}
                    error={addressErrors.landmark}
                    onChange={(e) => updateAddressField('landmark', sanitizeWords(e.target.value))}
                    onClear={() => updateAddressField('landmark', '')}
                  />
                </AddressField>
              </div>

              <div className="space-y-5">
                <AddressField label={translate('Province / Region', 'प्रदेश / क्षेत्र')} error={addressErrors.province}>
                  <select
                    aria-label="Province / Region"
                    value={addressForm.province}
                    onChange={(e) => updateAddressField('province', e.target.value)}
                    className={fieldClass(addressErrors.province)}
                  >
                    <option value="">{translate('Please choose your province / region', 'प्रदेश छान्नुहोस्')}</option>
                    {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                  </select>
                </AddressField>
                <AddressField label={translate('City', 'सहर')} error={addressErrors.city}>
                  <select
                    aria-label="City"
                    value={addressForm.city}
                    onChange={(e) => updateAddressField('city', e.target.value)}
                    className={fieldClass(addressErrors.city)}
                  >
                    <option value="">{translate('Please choose your city', 'सहर छान्नुहोस्')}</option>
                    {DELIVERY_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                  </select>
                </AddressField>
                <AddressField label={translate('Address', 'ठेगाना')} error={addressErrors.address}>
                  <ClearableInput
                    type="text"
                    aria-label="Address"
                    autoComplete="street-address"
                    maxLength={120}
                    placeholder={translate('For example: Shrijana Chowk', 'जस्तै: सिर्जना चोक')}
                    value={addressForm.address}
                    error={addressErrors.address}
                    onChange={(e) => updateAddressField('address', sanitizeWords(e.target.value))}
                    onClear={() => updateAddressField('address', '')}
                  />
                </AddressField>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#334155]">{translate('Select a label for effective delivery:', 'छिटो डेलिभरीका लागि लेबल छान्नुहोस्:')}</p>
                  <div className="flex gap-3" role="radiogroup" aria-label="Address label">
                    {ADDRESS_LABELS.map((label) => {
                      const selected = addressForm.label === label;
                      const Icon = label === 'Office' ? FiBriefcase : FiHome;
                      const tone = label === 'Office'
                        ? (selected ? 'border-[#0EA5E9] bg-[#F0F9FF] text-[#0369A1] ring-2 ring-[#0EA5E9]/20' : 'border-[#BAE6FD] bg-white text-[#475569]')
                        : (selected ? 'border-[#F43F5E] bg-[#FFF1F2] text-[#BE123C] ring-2 ring-[#F43F5E]/20' : 'border-[#FECDD3] bg-white text-[#475569]');
                      return (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => updateAddressField('label', label)}
                          className={`flex min-w-[104px] items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-bold uppercase tracking-wide transition ${tone}`}
                        >
                          <Icon className="h-4 w-4" /> {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#EEF2F7] px-4 py-4 sm:px-6">
              <button
                type="button"
                onClick={closeAddressForm}
                className="min-w-[120px] rounded-lg border border-[#D6DEE8] bg-[#F1F4F8] px-6 py-2.5 text-sm font-semibold text-[#475569] transition hover:bg-[#E2E8F0]"
              >
                {translate('Cancel', 'रद्द गर्नुहोस्')}
              </button>
              <button
                type="submit"
                disabled={isSavingAddress}
                className="min-w-[160px] rounded-lg bg-[#F2B71D] px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-[#102341] transition hover:bg-[#E0A615] disabled:opacity-60"
              >
                {isSavingAddress ? translate('Saving...', 'सेभ हुँदै...') : translate('Save', 'सेभ')}
              </button>
            </div>
          </form>
        ) : null}

        {addresses.length === 0 && !showAddressForm ? (
          <div className="rounded-2xl border border-dashed border-[#D6DEE8] bg-[#F8FAFC] px-4 py-10 text-center">
            <p className="text-sm font-semibold text-[#334155]">
              {translate('No addresses yet', 'अहिले कुनै ठेगाना छैन')}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              {translate('Add one so checkout can fill it in automatically.', 'चेकआउटमा स्वतः भर्न एउटा ठेगाना थप्नुहोस्।')}
            </p>
            <button
              type="button"
              onClick={openAddAddress}
              className="mt-4 rounded-xl bg-[#F2B71D] px-5 py-2.5 text-sm font-bold text-[#102341] transition hover:bg-[#E0A615]"
            >
              {translate('Add address', 'ठेगाना थप्नुहोस्')}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((entry) => {
              const id = entry._id || entry.id;
              const label = entry.label || entry.title || 'Home';
              const isOffice = String(label).toLowerCase() === 'office';
              return (
                <article
                  key={id}
                  className="rounded-2xl border border-[#E5EBF2] bg-[#FCFCFD] p-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isOffice ? 'bg-[#F0F9FF] text-[#0369A1]' : 'bg-[#FFF1F2] text-[#BE123C]'}`}>
                        {isOffice ? <FiBriefcase className="h-3 w-3" /> : <FiHome className="h-3 w-3" />} {label}
                      </span>
                      {entry.fullName ? <span className="text-sm font-bold text-[#102341]">{entry.fullName}</span> : null}
                    </div>
                    {entry.phone ? (
                      <p className="flex items-center gap-1.5 text-xs text-[#52627a]"><FiPhone className="h-3 w-3" /> {entry.phone}</p>
                    ) : null}
                    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[#334155]">
                      <FiMapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>
                        {[entry.address, entry.landmark, entry.city || entry.location, entry.province].filter(Boolean).join(', ') || '—'}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditAddress(entry)}
                      className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-[11px] font-bold text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      {translate('Edit', 'सम्पादन')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveAddress(entry)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-100"
                    >
                      {translate('Remove', 'हटाउनुहोस्')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
