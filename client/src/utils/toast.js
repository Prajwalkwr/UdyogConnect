import Swal from 'sweetalert2';

// Popups that ask the user something (confirm/cancel, inputs, custom forms, loaders) stay as dialogs.
const DIALOG_KEYS = [
  'input', 'html', 'showCancelButton', 'showDenyButton', 'preConfirm', 'inputValidator',
  'didOpen', 'footer', 'imageUrl', 'toast',
];

const BASE_MS = { success: 2600, info: 3200, question: 3200, warning: 4200, error: 4800 };
const MAX_MS = 8000;

const normalizeArgs = (args) => {
  const [first, second, third] = args;
  if (first && typeof first === 'object') return { ...first };
  return { title: first, text: second, icon: third };
};

const isNotification = (params) => !DIALOG_KEYS.some((key) => params[key] !== undefined && params[key] !== false)
  && params.allowOutsideClick !== false;

const toastDuration = (params) => {
  const icon = params.icon || 'info';
  const textLength = `${params.title || ''} ${params.text || ''}`.trim().length;
  const readingTime = (BASE_MS[icon] || BASE_MS.info) + textLength * 35;
  return Math.min(MAX_MS, Math.max(Number(params.timer) || 0, readingTime));
};

const toToast = (params) => {
  const { title, text, icon } = params;
  return {
    toast: true,
    position: 'top',
    icon: icon || 'info',
    // A lone message reads better as the bold line of the toast.
    title: title || text || '',
    text: title ? text || '' : '',
    timer: toastDuration(params),
    timerProgressBar: true,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { container: 'uc-toast-container', popup: `uc-toast uc-toast--${icon || 'info'}` },
    showClass: { popup: 'uc-toast-in' },
    hideClass: { popup: 'uc-toast-out' },
    didOpen: (popup) => {
      popup.addEventListener('mouseenter', Swal.stopTimer);
      popup.addEventListener('mouseleave', Swal.resumeTimer);
    },
  };
};

/** Shows message-only SweetAlert popups (login, logout, add to cart, saved...) as a small top toast. */
export function installToastNotifications() {
  if (Swal.__ucToastInstalled) return;
  const originalFire = Swal.fire.bind(Swal);
  Swal.fire = (...args) => {
    const params = normalizeArgs(args);
    return originalFire(isNotification(params) ? toToast(params) : params);
  };
  Swal.__ucToastInstalled = true;
}

installToastNotifications();
