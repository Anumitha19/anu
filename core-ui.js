// Shared UI: bottom sheets, confirm dialogs, toasts, tiny form helpers.
import { esc, $ } from './core-util.js';

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Bottom sheet. Returns { el, close }.
export function sheet({ title = '', html = '', onMount, onClose, theme } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const app = $('#app');
  back.dataset.theme = theme || (app && app.dataset.theme) || '';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grab"></div>
    ${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ''}
    <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    back.classList.remove('open');
    setTimeout(() => back.remove(), 200);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  const api = { el: back.querySelector('.sheet-body'), root: back, close };
  if (onMount) onMount(api);
  return api;
}

// Yes/no question. Resolves true/false.
export function confirmSheet({ title = 'Are you sure?', message = '', okText = 'Yes', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const s = sheet({
      title,
      html: `<p class="sheet-msg">${esc(message).replace(/\n/g, '<br>')}</p>
        <div class="btn-row"><button class="btn ghost" data-a="no">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(okText)}</button></div>`,
      onMount: (api) => api.el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        answered = true; resolve(b.dataset.a === 'yes'); api.close();
      }),
      onClose: () => { if (!answered) resolve(false); }
    });
    return s;
  });
}

// Plain message with one button.
export function notice(title, message) {
  return new Promise((resolve) => {
    sheet({
      title,
      html: `<p class="sheet-msg">${esc(message).replace(/\n/g, '<br>')}</p><div class="btn-row"><button class="btn primary" data-a="ok">OK</button></div>`,
      onMount: (api) => api.el.addEventListener('click', (e) => { if (e.target.closest('[data-a]')) api.close(); }),
      onClose: resolve
    });
  });
}

export const spinIcon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const chevronLeft = spinIcon;
export const chevronRight = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const iconTrash = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const iconPencil = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const iconGear = '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
export const iconLock = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
export const iconCheck = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Read a number from an <input>; returns NaN when empty/invalid.
export function readAmount(input) {
  const v = String(input.value).replace(/[,₹\s]/g, '');
  if (!/^\d*\.?\d+$/.test(v)) return NaN;
  return Number(v);
}
