import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { normalizeUser } from '../utils/authFlow';
import { updateSessionUser } from '../utils/sessionAuth';
import { createIdempotencyHeader, createSubmissionGuard } from '../utils/submitProtection';

const emptyAddressForm = { title: 'Home', location: '', address: '' };

export default function AccountProfileCard({ user, lang }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState(emptyAddressForm);
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

  const openAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm(emptyAddressForm);
    setShowAddressForm(true);
  };

  const openEditAddress = (entry) => {
    setEditingAddressId(entry._id || entry.id || null);
    setAddressForm({
      title: entry.title || 'Home',
      location: entry.location || '',
      address: entry.address || '',
    });
    setShowAddressForm(true);
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    const title = String(addressForm.title || '').trim() || 'Home';
    const location = String(addressForm.location || '').trim();
    const address = String(addressForm.address || '').trim();
    if (!location || !address) {
      Swal.fire({
        icon: 'warning',
        text: translate('City/area and street address are required.', 'सहर/क्षेत्र र सडक ठेगाना आवश्यक छन्।'),
      });
      return;
    }
    if (!addressGuard.begin()) return;
    setIsSavingAddress(true);
    try {
      let nextAddresses;
      if (editingAddressId) {
        nextAddresses = addresses.map((item) => {
          const id = item._id || item.id;
          if (String(id) !== String(editingAddressId)) return item;
          return { ...item, title, location, address };
        });
      } else {
        nextAddresses = [
          ...addresses,
          {
            _id: `addr_${Date.now()}`,
            title,
            location,
            address,
          },
        ];
      }
      await saveAddresses(nextAddresses);
      setShowAddressForm(false);
      setEditingAddressId(null);
      setAddressForm(emptyAddressForm);
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
      text: entry.address || entry.title || '',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: translate('Remove', 'हटाउनुहोस्'),
      confirmButtonColor: '#dc2626',
    });
    if (!result.isConfirmed) return;
    try {
      const nextAddresses = addresses.filter((item) => String(item._id || item.id) !== String(id));
      await saveAddresses(nextAddresses);
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
          <form onSubmit={handleSaveAddress} className="mb-6 space-y-4 rounded-2xl border border-[#E8EDF4] bg-[#F8FAFC] p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                  {translate('Label', 'लेबल')}
                </label>
                <input
                  type="text"
                  value={addressForm.title}
                  onChange={(e) => setAddressForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-sm font-medium text-[#102341] outline-none focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
                  placeholder="Home, Office..."
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                  {translate('City / Area', 'सहर / क्षेत्र')}
                </label>
                <input
                  type="text"
                  value={addressForm.location}
                  onChange={(e) => setAddressForm((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-sm font-medium text-[#102341] outline-none focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
                  placeholder="Kathmandu, Baneshwor..."
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-[0.12em] text-[#334155]">
                {translate('Street address / Landmark', 'सडक ठेगाना / स्थलचिन्ह')}
              </label>
              <textarea
                value={addressForm.address}
                onChange={(e) => setAddressForm((prev) => ({ ...prev, address: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-[#CBD5E1] bg-white px-4 py-3 text-sm font-medium text-[#102341] outline-none focus:border-[#F2B71D] focus:ring-2 focus:ring-[#F2B71D]/20"
                placeholder="House no., street, nearby landmark"
                required
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSavingAddress}
                className="rounded-xl bg-[#F2B71D] px-6 py-2.5 text-sm font-bold text-[#102341] transition hover:bg-[#E0A615] disabled:opacity-60"
              >
                {isSavingAddress
                  ? translate('Saving...', 'सेभ हुँदै...')
                  : editingAddressId
                    ? translate('Update address', 'ठेगाना अद्यावधिक गर्नुहोस्')
                    : translate('Save address', 'ठेगाना सेभ गर्नुहोस्')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddressForm(false);
                  setEditingAddressId(null);
                  setAddressForm(emptyAddressForm);
                }}
                className="rounded-xl border border-[#CBD5E1] bg-white px-6 py-2.5 text-sm font-bold text-[#334155] transition hover:bg-[#F8FAFC]"
              >
                {translate('Cancel', 'रद्द गर्नुहोस्')}
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
              return (
                <article
                  key={id}
                  className="rounded-2xl border border-[#E5EBF2] bg-[#FCFCFD] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#F2B71D]">
                        {entry.title || 'Address'}
                      </p>
                      <p className="mt-1 text-sm font-bold text-[#102341]">
                        {entry.location || '—'}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[#52627a]">
                        {entry.address || '—'}
                      </p>
                    </div>
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
