import Swal from 'sweetalert2';
import api from './api';

export const REPORT_REASON_LABELS = {
  spam: 'Spam or advertising',
  fake: 'Fake or misleading',
  offensive: 'Offensive or abusive',
  inappropriate: 'Inappropriate content',
  scam: 'Scam or fraud',
  wrong_info: 'Wrong business information',
  other: 'Other',
};

const REASONS_BY_TARGET = {
  review: ['fake', 'spam', 'offensive', 'inappropriate', 'other'],
  business: ['scam', 'fake', 'wrong_info', 'inappropriate', 'spam', 'other'],
};

export const CONTENT_REPORTS_EVENT = 'content-reports-changed';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

/**
 * Opens the report dialog and submits it. Resolves true when a report was filed.
 */
export async function openReportDialog({ targetType, targetId, targetLabel = '' }) {
  const reasons = REASONS_BY_TARGET[targetType] || REASONS_BY_TARGET.review;
  const heading = targetType === 'business' ? 'Report this business' : 'Report this review';
  const options = reasons
    .map((key, index) => `
      <label class="uc-report-option">
        <input type="radio" name="uc-report-reason" value="${key}" ${index === 0 ? 'checked' : ''} />
        <span>${escapeHtml(REPORT_REASON_LABELS[key])}</span>
      </label>`)
    .join('');

  const result = await Swal.fire({
    title: heading,
    html: `
      <div class="uc-report-form">
        ${targetLabel ? `<p class="uc-report-target">${escapeHtml(targetLabel)}</p>` : ''}
        <div class="uc-report-options">${options}</div>
        <textarea id="uc-report-details" maxlength="500" rows="3" placeholder="Tell the admin team what's wrong (optional)"></textarea>
        <p class="uc-report-note">Reports are private. Only UdyogConnect admins can see who reported.</p>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Submit Report',
    confirmButtonColor: '#dc2626',
    focusConfirm: false,
    preConfirm: () => {
      const reason = document.querySelector('input[name="uc-report-reason"]:checked')?.value;
      const details = document.getElementById('uc-report-details')?.value.trim() || '';
      if (!reason) {
        Swal.showValidationMessage('Choose a reason.');
        return false;
      }
      if (reason === 'other' && !details) {
        Swal.showValidationMessage('Please describe the problem.');
        return false;
      }
      return { reason, details };
    },
  });
  if (!result.isConfirmed || !result.value) return false;

  try {
    const response = await api.post('/api/reports', { targetType, targetId, ...result.value });
    Swal.fire({
      icon: 'success',
      title: response.data?.alreadyReported ? 'Report updated' : 'Report submitted',
      text: 'Thanks — our admin team will review it.',
    });
    window.dispatchEvent(new CustomEvent(CONTENT_REPORTS_EVENT));
    return true;
  } catch (error) {
    Swal.fire({ icon: 'error', text: error.response?.data?.message || 'Could not submit the report.' });
    return false;
  }
}
