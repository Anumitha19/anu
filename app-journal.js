// Anu’s shit — a private free-form journal, behind a PIN / passkey lock.
import { db, settings } from './core-db.js';
import { esc, $, on, uid, debounce, longDate, timeLabel, dateOfTs } from './core-util.js';
import { sheet, confirmSheet, toast, iconGear, iconLock, iconTrash } from './core-ui.js';
import * as auth from './core-auth.js';
import { showLockScreen } from './core-lockscreen.js';

export default {
  id: 'journal', name: 'Anu’s shit', emoji: '🔐', theme: 'journal',
  async mount(ctx) {
    if (!auth.isUnlocked()) return showLockScreen(ctx, () => this.mount(ctx));
    // leaving the journal for another part of ANU locks it again (can be switched off in journal settings)
    ctx.onLeave(() => {
      if (!/^#\/journal/.test(location.hash) && settings.get('lockOnLeave', true)) auth.lock('leave');
    });
    const [sub, id] = ctx.parts;
    if (sub === 'new') return editor(ctx, null);
    if (sub === 'e' && id) {
      const entry = await db.get('journal', id);
      if (!entry) { ctx.go('#/journal'); return; }
      return editor(ctx, entry);
    }
    return listView(ctx);
  }
};

const preview = (t) => esc(t.trim().replace(/\s+/g, ' ').slice(0, 220));

async function listView(ctx) {
  const all = (await db.all('journal')).sort((a, b) => b.createdAt - a.createdAt);
  const showPreview = settings.get('journalPreview', true);
  const card = (e) => `<a class="j-card" href="#/journal/e/${e.id}">
      <div class="j-when"><b>${esc(longDate(dateOfTs(e.createdAt)))}</b><span>${esc(timeLabel(e.createdAt))}</span></div>
      ${showPreview ? `<p>${preview(e.text) || '<i class="muted">Empty entry</i>'}</p>` : ''}</a>`;
  ctx.render({
    title: 'Anu’s shit', back: '#/',
    right: `<button class="icon-btn" id="jLock" aria-label="Lock journal">${iconLock}</button><button class="icon-btn" id="jSet" aria-label="Journal settings">${iconGear}</button>`,
    body: `<a class="btn primary wide-btn j-new" href="#/journal/new">+ New Entry</a>
      ${all.length ? `<div class="searchbar"><input id="jSearch" type="search" placeholder="Search entries" aria-label="Search entries" autocomplete="off"></div>` : ''}
      <div id="jList" class="j-list">${all.length ? all.map(card).join('') : '<div class="empty"><p>Your journal is empty.</p><p class="muted">Tap “New Entry” and write whatever you like.</p></div>'}</div>`,
    bind(main, root) {
      const listEl = $('#jList', main);
      const search = $('#jSearch', main);
      if (search) search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const hits = q ? all.filter((e) => e.text.toLowerCase().includes(q) || longDate(dateOfTs(e.createdAt)).toLowerCase().includes(q)) : all;
        listEl.innerHTML = hits.length ? hits.map(card).join('') : '<div class="empty"><p class="muted">No entries match that.</p></div>';
      });
      $('#jLock', root).addEventListener('click', () => auth.lock('manual'));
      $('#jSet', root).addEventListener('click', () => settingsSheet(ctx));
    }
  });
}

async function editor(ctx, existing) {
  let entry = existing;
  let text = existing ? existing.text : '';
  let saved = existing ? existing.text : '';
  let saving = Promise.resolve();
  const created = existing ? existing.createdAt : Date.now();

  const persist = () => {
    if (text === saved) return saving;
    if (!entry && !text.trim()) return saving; // never save an empty new entry
    const now = Date.now();
    entry = { id: entry ? entry.id : uid(), createdAt: created, ...(entry || {}), text, updatedAt: now };
    saved = text;
    const snapshot = { ...entry };
    saving = saving.then(() => db.put('journal', snapshot)).catch((e) => toast('Couldn’t save: ' + e.message));
    return saving;
  };
  const autosave = debounce(persist, 700);
  const flush = () => { autosave.cancel(); persist(); };
  ctx.onLeave(flush);
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flush);
  ctx.onLeave(() => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); });

  const edited = existing && existing.updatedAt - existing.createdAt > 60000;
  ctx.render({
    title: existing ? 'Entry' : 'New Entry', back: '#/journal',
    right: `${existing ? `<button class="icon-btn" id="jDel" aria-label="Delete entry">${iconTrash}</button>` : ''}<button class="pill-btn strong" id="jDone">Done</button>`,
    className: 'editor-frame',
    body: `<div class="j-stamp"><b>${esc(longDate(dateOfTs(created)))}</b><span>${esc(timeLabel(created))}${edited ? ' · edited ' + esc(longDate(dateOfTs(existing.updatedAt))) : ''}</span></div>
      <textarea id="jText" class="j-text" placeholder="Start writing..." aria-label="Journal entry" autocapitalize="sentences" spellcheck="true">${esc(text)}</textarea>`,
    bind(main, root) {
      const ta = $('#jText', main);
      const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, window.innerHeight * 0.5) + 'px'; };
      ta.addEventListener('input', () => { text = ta.value; fit(); autosave(); });
      fit();
      if (!existing) setTimeout(() => { try { ta.focus(); } catch {} }, 80);
      $('#jDone', root).addEventListener('click', async () => { flush(); await saving; ctx.go('#/journal'); });
      const del = $('#jDel', root);
      if (del) del.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Delete this entry?', message: 'It will be gone for good.', okText: 'Delete', danger: true }))) return;
        autosave.cancel(); text = saved = ''; // stop any pending save from bringing it back
        await saving; await db.del('journal', entry.id); toast('Deleted'); ctx.go('#/journal');
      });
    }
  });
}

async function settingsSheet(ctx) {
  const canPasskey = await auth.passkeySupported();
  const draw = () => {
    const delay = settings.get('lockAfter', 60);
    const opts = [[0, 'Right away'], [60, 'After 1 minute'], [300, 'After 5 minutes'], [900, 'After 15 minutes']];
    return `<div class="set-block"><b>Lock after leaving the app</b>
        <div class="seg col" id="delaySeg">${opts.map(([v, l]) => `<button data-v="${v}" class="${Number(delay) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <label class="switch-row"><span>Lock when I leave the journal</span><input type="checkbox" id="lockLeave" ${settings.get('lockOnLeave', true) ? 'checked' : ''}></label>
      <label class="switch-row"><span>Show a preview of each entry in the list</span><input type="checkbox" id="prevSw" ${settings.get('journalPreview', true) ? 'checked' : ''}></label>
      <div class="set-block"><b>Face ID / Touch ID</b>
        <p class="muted small">${canPasskey ? 'Uses a passkey stored on this iPhone. Your PIN always still works.' : 'Not available in this browser — your PIN is used.'}</p>
        ${canPasskey ? (auth.hasPasskey() ? '<button class="btn ghost" data-a="pk-off">Turn off Face ID / Touch ID</button>' : '<button class="btn soft" data-a="pk-on">Set up Face ID / Touch ID</button>') : ''}</div>
      <div class="btn-row"><button class="btn ghost" data-a="pin">Change PIN</button><button class="btn primary" data-a="lock">Lock now</button></div>
      <p class="muted small">This is a browser-level lock. It keeps people out of the journal screen, but it isn’t the same as a native iPhone app’s hardware-backed vault. Entries are kept only on this phone.</p>`;
  };
  const s = sheet({
    title: 'Journal settings', html: draw(),
    onMount(api) {
      const redraw = () => { api.el.innerHTML = draw(); };
      api.el.addEventListener('change', async (e) => {
        if (e.target.id === 'lockLeave') await settings.set('lockOnLeave', e.target.checked);
        if (e.target.id === 'prevSw') { await settings.set('journalPreview', e.target.checked); }
      });
      api.el.addEventListener('click', async (e) => {
        const seg = e.target.closest('#delaySeg button');
        if (seg) { await settings.set('lockAfter', Number(seg.dataset.v)); redraw(); return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        const a = b.dataset.a;
        if (a === 'lock') { api.close(); auth.lock('manual'); }
        if (a === 'pk-on') { try { await auth.registerPasskey(); toast('Face ID / Touch ID is on 🎀'); } catch { toast('Couldn’t set it up.'); } redraw(); }
        if (a === 'pk-off') { await auth.removePasskey(); toast('Turned off'); redraw(); }
        if (a === 'pin') changePin(api);
      });
    },
    onClose: () => { if (auth.isUnlocked() && /^#\/journal\/?$/.test(location.hash)) ctx.go('#/journal'); }
  });
  return s;
}

function changePin(parent) {
  sheet({
    title: 'Change PIN',
    html: `<label class="field"><span>Current PIN</span><input id="p0" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <label class="field"><span>New PIN (4–8 digits)</span><input id="p1" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <label class="field"><span>New PIN again</span><input id="p2" type="password" inputmode="numeric" maxlength="8" autocomplete="off"></label>
      <p class="bad small" id="perr" hidden></p>
      <div class="btn-row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">Change PIN</button></div>`,
    onMount(api) {
      const err = (m) => { const e = $('#perr', api.el); e.textContent = m; e.hidden = false; };
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'c') return api.close();
        const [p0, p1, p2] = ['#p0', '#p1', '#p2'].map((s) => $(s, api.el).value);
        if (!auth.validPin(p1)) return err('The new PIN must be 4 to 8 digits.');
        if (p1 !== p2) return err('The new PINs don’t match.');
        const r = await auth.checkPin(p0);
        if (!r.ok) return err(r.wait ? `Too many tries. Wait ${r.wait}s.` : 'Your current PIN isn’t right.');
        await auth.setPin(p1);
        api.close(); toast('PIN changed 🎀');
      });
    }
  });
}
