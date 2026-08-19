import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import api from '../utils/api';
import { normalizeUser } from '../utils/authFlow';
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
        localStorage.setItem('user', JSON.stringify(normalized));
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
    <div className="rounded-[32px] border border-slate-800 bg-slate-900/30 p-5 sm:p-6 space-y-6">
      <div>
        <h3 className="text-lg font-extrabold text-white">{translate('Account Profile', 'खाता प्रोफाइल')}</h3>
        <p className="text-xs text-slate-400 mt-1">
          {translate('Update your name, phone, and profile photo.', 'आफ्नो नाम, फोन र प्रोफाइल फोटो अद्यावधिक गर्नुहोस्।')}
        </p>
      </div>

      <form onSubmit={handleUpdateProfile} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-700 bg-gradient-to-br from-amber-400 to-amber-600 text-2xl font-black text-slate-950 flex items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              (name || user?.email || 'U').charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {translate('Profile Photo', 'प्रोफाइल फोटो')}
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfilePhoto(e.target.files?.[0] || null)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none file:cursor-pointer file:rounded-full file:border-0 file:bg-amber-500/20 file:px-3 file:py-1 file:text-amber-200"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-white outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : translate('Save profile', 'प्रोफाइल सेभ गर्नुहोस्')}
        </button>
      </form>
    </div>
  );
}
