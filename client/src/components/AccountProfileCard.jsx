import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { normalizeUser } from '../utils/authFlow';
import { updateSessionUser } from '../utils/sessionAuth';
import { createIdempotencyHeader, createSubmissionGuard } from '../utils/submitProtection';

export default function AccountProfileCard({ user, lang }) {
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitGuard = useMemo(() => createSubmissionGuard(), []);

  const translate = (enText, neText) => (lang === 'en' ? enText : neText);

  useEffect(() => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
    setProfilePhoto(null);
    setPreviewUrl(user?.profilePicture || '');
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
        const normalized = normalizeUser({ ...user, ...updatedUser });
        dispatch({ type: 'SET_USER', payload: normalized });
        updateSessionUser(normalized);
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

  return (
    <div className="w-full min-h-[calc(100vh-7rem)] rounded-2xl border border-[#E5EBF2] bg-white p-5 shadow-[0_8px_28px_rgba(16,35,65,0.06)] sm:p-8 lg:p-10">
      <div className="mb-8 border-b border-[#EEF2F7] pb-6">
        <h3 className="text-2xl font-extrabold tracking-tight text-[#102341] sm:text-3xl">
          {translate('Account Profile', 'खाता प्रोफाइल')}
        </h3>
        <p className="mt-2 text-sm text-[#52627a]">
          {translate('Update your name, phone, and profile photo.', 'आफ्नो नाम, फोन र प्रोफाइल फोटो अद्यावधिक गर्नुहोस्।')}
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
  );
}
