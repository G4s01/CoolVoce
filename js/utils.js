// Helper condivisi: escapeHtml, copyToClipboard, aria-live announce, sanitize wrapper.

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fallback */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch (e) {
    return false;
  }
}

export function ensureAriaLive() {
  let region = document.getElementById('cv-aria-live');
  if (!region) {
    region = document.createElement('div');
    region.id = 'cv-aria-live';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('role', 'status');
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(1px, 1px, 1px, 1px)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(region);
  }
  return region;
}

export function announce(msg) {
  const region = ensureAriaLive();
  region.textContent = msg;
  setTimeout(() => { region.textContent = ''; }, 1500);
}

// wrapper around DOMPurify if present
export function sanitizeHtml(html, opts = {}) {
  if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
    try {
      return window.DOMPurify.sanitize(html, opts);
    } catch (e) {
      // fall through to fallback escape (conservative)
    }
  }
  // conservative fallback: escape everything
  return escapeHtml(html);
}