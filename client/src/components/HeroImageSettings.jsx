import React, { useEffect, useRef, useState } from 'react';
import { FiImage, FiRotateCcw, FiUpload } from 'react-icons/fi';
import Swal from 'sweetalert2';
import { resolveImageUploadUrl } from '../utils/mediaUpload';
import { DEFAULT_HERO_IMAGE, fetchHeroImage, heroBackground, saveHeroImage } from '../utils/siteAppearance';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function HeroImageSettings({ lang }) {
  const translate = (enText, neText) => (lang === 'en' ? enText : neText);
  const [current, setCurrent] = useState(DEFAULT_HERO_IMAGE);
  const [preview, setPreview] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [linkInput, setLinkInput] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchHeroImage().then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const resetDraft = () => {
    setPendingFile(null);
    setPreview('');
    setLinkInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      Swal.fire({ icon: 'error', text: translate('Choose a JPG, PNG, WebP or GIF image.', 'JPG, PNG, WebP वा GIF फोटो छान्नुहोस्।') });
      event.target.value = '';
      return;
    }
    if (file.size > MAX_BYTES) {
      Swal.fire({ icon: 'error', text: translate('Image must be under 8MB.', 'फोटो ८MB भन्दा सानो हुनुपर्छ।') });
      event.target.value = '';
      return;
    }
    setLinkInput('');
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleLinkChange = (event) => {
    const value = event.target.value;
    setLinkInput(value);
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPreview(/^https:\/\/\S+$/i.test(value.trim()) ? value.trim() : '');
  };

  const persist = async (value, successText) => {
    setBusy(true);
    try {
      const saved = await saveHeroImage(value);
      setCurrent(saved);
      resetDraft();
      Swal.fire({ icon: 'success', text: successText });
    } catch (error) {
      Swal.fire({ icon: 'error', text: error?.response?.data?.message || translate('Could not update the home page picture.', 'गृहपृष्ठको फोटो अद्यावधिक गर्न सकिएन।') });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    if (pendingFile) {
      setBusy(true);
      let uploaded = null;
      try {
        uploaded = await resolveImageUploadUrl(pendingFile);
      } catch {
        uploaded = null;
      }
      setBusy(false);
      if (!uploaded) {
        Swal.fire({ icon: 'error', text: translate('Image upload failed. Please try again.', 'फोटो अपलोड असफल भयो। फेरि प्रयास गर्नुहोस्।') });
        return;
      }
      await persist(uploaded, translate('Home page picture updated.', 'गृहपृष्ठको फोटो अद्यावधिक भयो।'));
      return;
    }
    const link = linkInput.trim();
    if (!/^https:\/\/\S+$/i.test(link)) {
      Swal.fire({ icon: 'info', text: translate('Choose an image or paste an https:// image link first.', 'पहिले फोटो छान्नुहोस् वा https:// लिङ्क टाँस्नुहोस्।') });
      return;
    }
    await persist(link, translate('Home page picture updated.', 'गृहपृष्ठको फोटो अद्यावधिक भयो।'));
  };

  const handleReset = async () => {
    if (busy) return;
    const confirm = await Swal.fire({
      title: translate('Restore the default picture?', 'पूर्वनिर्धारित फोटो फर्काउने?'),
      text: translate('The home page will go back to the original cafe photo.', 'गृहपृष्ठमा पुरानो क्याफे फोटो देखिनेछ।'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: translate('Restore', 'फर्काउनुहोस्'),
    });
    if (!confirm.isConfirmed) return;
    await persist('', translate('Default home page picture restored.', 'पूर्वनिर्धारित फोटो फर्काइयो।'));
  };

  const shown = preview || current;
  const hasDraft = Boolean(pendingFile || preview);
  const isDefault = current === DEFAULT_HERO_IMAGE;

  return (
    <section className="rounded-4xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FiImage className="text-amber-400" />
        <h4 className="text-sm font-extrabold text-white">{translate('Home Page Picture', 'गृहपृष्ठ फोटो')}</h4>
      </div>
      <p className="text-xs text-slate-400">
        {translate(
          'This is the large background photo at the top of the home page. A wide landscape image (at least 1600px) looks best.',
          'यो गृहपृष्ठको माथिल्लो ठूलो पृष्ठभूमि फोटो हो। चौडा ल्यान्डस्केप फोटो (कम्तीमा 1600px) राम्रो देखिन्छ।'
        )}
      </p>

      <div
        className="relative h-44 w-full overflow-hidden rounded-3xl border border-slate-800 bg-[#1a120c] bg-cover bg-center"
        style={{ backgroundImage: heroBackground(shown) }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/50" />
        <div className="relative flex h-full flex-col justify-center px-5">
          <span className="text-lg font-semibold leading-tight text-[#fff] sm:text-xl">
            {translate('CONNECT WITH THE HEART OF YOUR COMMUNITY', 'समुदायको मुटुसँग जोडिनुहोस्')}
          </span>
          <span className="mt-2 text-[11px] text-[#ffffffcc]">
            {hasDraft ? translate('Preview — not saved yet', 'पूर्वावलोकन — अझै सुरक्षित गरिएको छैन') : translate('Currently live', 'हाल प्रत्यक्ष')}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/40 px-4 py-3 text-xs font-bold text-white hover:border-amber-400">
          <FiUpload />
          {translate('Choose Image', 'फोटो छान्नुहोस्')}
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handleFileChange} className="hidden" disabled={busy} />
        </label>
        <input
          value={linkInput}
          onChange={handleLinkChange}
          placeholder={translate('…or paste an https:// image link', '…वा https:// फोटो लिङ्क टाँस्नुहोस्')}
          className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-white outline-none"
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleSave} disabled={busy || !hasDraft} className="rounded-full bg-amber-400 px-6 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-60">
          {busy ? translate('Saving...', 'सुरक्षित गर्दै...') : translate('Save Picture', 'फोटो सुरक्षित गर्नुहोस्')}
        </button>
        {hasDraft && (
          <button type="button" onClick={resetDraft} disabled={busy} className="rounded-full border border-slate-700 px-5 py-2.5 text-xs font-bold text-slate-200 disabled:opacity-60">
            {translate('Cancel', 'रद्द गर्नुहोस्')}
          </button>
        )}
        {!isDefault && !hasDraft && (
          <button type="button" onClick={handleReset} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-5 py-2.5 text-xs font-bold text-slate-200 disabled:opacity-60">
            <FiRotateCcw />
            {translate('Restore Default', 'पूर्वनिर्धारित फर्काउनुहोस्')}
          </button>
        )}
      </div>
    </section>
  );
}
