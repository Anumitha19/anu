// Backup & Restore + a few app settings. Reachable from the small button on the home screen.
import { esc, $, on, bytesToB64, b64ToBytes, todayStr, cfg, isYmd, isMonthKey, longDate } from './core-util.js';
import { db, settings, STORES, askPersistentStorage } from './core-db.js';
import { sheet, confirmSheet, notice, toast } from './core-ui.js';

const FORMAT = 1;
const EXCLUDE_SETTINGS = new Set(['passkey', 'authFail']); // device-specific, never exported
const LABELS = {
  kaasuTx: 'Kaasu transactions', kaasuNotes: 'Kaasu monthly plans', journal: 'Journal entries', dumplings: 'Daily Dumplings',
  areas: 'Growth areas', goals: 'Goals (with their small steps)', habits: 'Health habits', habitLogs: 'Health check-ins', settings: 'Settings'
};

// ---------- building a backup ----------
export async function collect() {
  const data = {};
  for (const name of Object.keys(STORES)) {
    let rows = await db.all(name);
    if (name === 'settings') rows = rows.filter((r) => !EXCLUDE_SETTINGS.has(r.key));
    data[name] = rows;
  }
  return { app: 'ANU', format: FORMAT, exportedAt: new Date().toISOString(), data };
}

const te = new TextEncoder(), td = new TextDecoder();
async function keyFrom(pw, salt, iter, usage) {
  const km = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, usage);
}
export async function encryptBackup(obj, pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 250000;
  const key = await keyFrom(pw, salt, iter, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
  return { app: 'ANU', format: FORMAT, encrypted: true, kdf: 'PBKDF2-SHA256', iterations: iter, salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(ct) };
}
export async function decryptBackup(file, pw) {
  const key = await keyFrom(pw, b64ToBytes(file.salt), file.iterations, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(file.iv) }, key, b64ToBytes(file.ciphertext));
  return JSON.parse(td.decode(pt));
}

// ---------- validating a backup ----------
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string';
const RULES = {
  kaasuTx: (r) => str(r.id) && isYmd(r.date) && ['income', 'outgoing', 'savings'].includes(r.type) && typeof r.amount === 'number' && isFinite(r.amount) && r.amount >= 0 && (r.note === undefined || str(r.note)),
  kaasuNotes: (r) => isMonthKey(r.month) && str(r.text),
  journal: (r) => str(r.id) && typeof r.createdAt === 'number' && str(r.text),
  dumplings: (r) => isYmd(r.date) && ['learned', 'challenge', 'improvement', 'mistake'].every((k) => r[k] === undefined || str(r[k])),
  areas: (r) => str(r.id) && str(r.name),
  goals: (r) => str(r.id) && str(r.areaId) && str(r.name) && Array.isArray(r.steps) && r.steps.every((s) => isObj(s) && str(s.id) && str(s.text) && typeof s.done === 'boolean'),
  habits: (r) => str(r.id) && str(r.name) && ['daily', 'weekly'].includes(r.type) && typeof r.active === 'boolean',
  habitLogs: (r) => str(r.id) && str(r.habitId) && isYmd(r.date),
  settings: (r) => str(r.key) && 'value' in r
};
export function validate(obj) {
  if (!isObj(obj) || obj.app !== 'ANU') throw new Error('This file isn’t an ANU backup.');
  if (typeof obj.format !== 'number' || obj.format > FORMAT) throw new Error('This backup was made by a newer version of ANU. Update the app and try again.');
  if (!isObj(obj.data)) throw new Error('The backup has no data section.');
  const clean = {};
  for (const [name, rule] of Object.entries(RULES)) {
    if (!(name in obj.data)) continue;
    const rows = obj.data[name];
    if (!Array.isArray(rows)) throw new Error(`“${LABELS[name]}” is damaged in this file.`);
    rows.forEach((r, i) => { if (!isObj(r) || !rule(r)) throw new Error(`Entry ${i + 1} in “${LABELS[name]}” is damaged, so nothing was imported.`); });
    clean[name] = name === 'settings' ? rows.filter((r) => !EXCLUDE_SETTINGS.has(r.key)) : rows;
  }
  if (!Object.keys(clean).length) throw new Error('This backup is empty.');
  return clean;
}

// ---------- restoring ----------
export async function restore(clean, mode) {
  const names = Object.keys(clean);
  const existing = {};
  for (const n of names) existing[n] = await db.all(n);
  const keyOf = (n) => STORES[n].keyPath;
  let added = 0, updated = 0, skipped = 0;
  await db.batch(names, (store) => {
    for (const n of names) {
      const s = store(n);
      if (mode === 'replace') { s.clear(); clean[n].forEach((r) => s.put(r)); added += clean[n].length; continue; }
      const have = new Map(existing[n].map((r) => [r[keyOf(n)], r]));
      for (const r of clean[n]) {
        const cur = have.get(r[keyOf(n)]);
        if (!cur) { s.put(r); added++; continue; }
        if (n === 'settings') { skipped++; continue; }           // merge never overwrites current settings / PIN
        const a = cur.updatedAt || 0, b = r.updatedAt || 0;
        if (b > a) { s.put(r); updated++; } else skipped++;
      }
    }
  });
  await settings.load();
  applySettings();
  return { added, updated, skipped };
}

export function applySettings() { cfg.weekStart = Number(settings.get('weekStart', 1)) === 0 ? 0 : 1; }

// ---------- UI ----------
function counts(clean) {
  return Object.keys(clean).filter((n) => n !== 'settings').map((n) => `<li><span>${esc(LABELS[n])}</span><b>${clean[n].length}</b></li>`).join('');
}

export async function mountBackup(ctx) {
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const last = settings.get('lastBackup');
  const body = `
    <section class="card">
      <h2>Export backup</h2>
      <p class="muted">Saves everything — Kaasu, journal, dumplings, small steps and habits — into one file. Keep it somewhere safe (Files app, iCloud Drive you choose yourself, or email it to yourself).</p>
      <p class="muted small">${last ? `Last backup: ${esc(longDate(last))}` : 'You haven’t made a backup yet.'}</p>
      <label class="field"><span>Password for the file (optional)</span>
        <input id="bkPw" type="password" autocomplete="new-password" placeholder="Leave empty for a normal file"></label>
      <p class="muted small">Without a password the file is readable by anyone who opens it — including your journal. With a password it’s encrypted, and <b>a forgotten password can’t be recovered</b>.</p>
      <div class="btn-row"><button class="btn primary" id="bkShare">Save to Files…</button><button class="btn ghost" id="bkDl">Download file</button></div>
    </section>
    <section class="card">
      <h2>Import backup</h2>
      <p class="muted">Pick a backup file from the Files app. You’ll see what’s inside and choose how to bring it in before anything changes.</p>
      <input id="bkFile" type="file" accept="application/json,.json" hidden>
      <button class="btn primary" id="bkPick">Choose backup file</button>
    </section>
    <section class="card">
      <h2>Settings</h2>
      <div class="seg" id="wkSeg" role="group" aria-label="Week starts on">
        <button data-w="1" class="${cfg.weekStart === 1 ? 'on' : ''}">Week starts Monday</button>
        <button data-w="0" class="${cfg.weekStart === 0 ? 'on' : ''}">Week starts Sunday</button>
      </div>
    </section>
    <section class="card soft">
      <h2>How your data is kept</h2>
      <p class="muted small">Everything lives only on this phone, inside this app (IndexedDB). Nothing is uploaded anywhere, and there’s no account.</p>
      <p class="muted small">The Home Screen app and Safari keep <b>separate</b> storage on iPhone, so always use ANU from the Home Screen icon. Deleting the app icon from your Home Screen deletes its data — that’s what backups are for.</p>
      <p class="muted small">Storage protection: ${persisted ? 'this device has agreed to keep ANU’s data' : 'the browser may clear data if the phone runs very low on space'}.</p>
      <p class="muted small">Your journal is locked by a PIN (and optionally Face ID / Touch ID through a passkey). That’s a browser-level lock, not the same as a native iOS app’s hardware-backed vault.</p>
    </section>`;

  ctx.render({
    title: 'Backup & Restore', back: '#/', body,
    bind(main) {
      const pw = () => $('#bkPw', main).value;
      const build = async () => {
        const obj = await collect();
        const finalObj = pw() ? await encryptBackup(obj, pw()) : obj;
        const name = `anu-backup-${todayStr()}${pw() ? '-encrypted' : ''}.json`;
        return new File([JSON.stringify(finalObj)], name, { type: 'application/json' });
      };
      const markDone = async () => { await settings.set('lastBackup', todayStr()); toast('Backup saved 🎀'); ctx.go('#/backup'); };
      $('#bkShare', main).addEventListener('click', async () => {
        try {
          const file = await build();
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'ANU backup' });
            await markDone();
          } else { download(file); await markDone(); }
        } catch (e) { if (!e || e.name !== 'AbortError') toast('Couldn’t save the backup: ' + (e && e.message)); }
      });
      $('#bkDl', main).addEventListener('click', async () => {
        try { download(await build()); await markDone(); } catch (e) { toast('Couldn’t create the backup: ' + (e && e.message)); }
      });
      $('#bkPick', main).addEventListener('click', () => $('#bkFile', main).click());
      $('#bkFile', main).addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (f) importFlow(f);
      });
      on(main, 'click', '#wkSeg button', async (e, b) => {
        await settings.set('weekStart', Number(b.dataset.w));
        applySettings(); ctx.go('#/backup');
        toast('Saved');
      });
    }
  });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function importFlow(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { return notice('Can’t read that file', 'It isn’t a valid backup (not readable JSON).'); }
  try {
    if (parsed && parsed.encrypted) {
      const inner = await askPassword(parsed);
      if (!inner) return;
      parsed = inner;
    }
    const clean = validate(parsed);
    chooseMode(clean, parsed.exportedAt);
  } catch (e) { notice('Can’t import this backup', e.message || String(e)); }
}

function askPassword(file) {
  return new Promise((resolve) => {
    let done = false;
    sheet({
      title: 'This backup has a password',
      html: `<label class="field"><span>Password</span><input id="pwIn" type="password" autocomplete="off"></label>
        <p class="bad small" id="pwErr" hidden>That password didn’t work.</p>
        <div class="btn-row"><button class="btn ghost" data-a="c">Cancel</button><button class="btn primary" data-a="ok">Unlock file</button></div>`,
      onMount: (api) => api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'c') return api.close();
        try { const v = await decryptBackup(file, $('#pwIn', api.el).value); done = true; resolve(v); api.close(); }
        catch { $('#pwErr', api.el).hidden = false; }
      }),
      onClose: () => { if (!done) resolve(null); }
    });
  });
}

function chooseMode(clean, exportedAt) {
  const when = exportedAt ? new Date(exportedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown time';
  sheet({
    title: 'Import this backup?',
    html: `<p class="muted small">Made on ${esc(when)}. It contains:</p>
      <ul class="bk-list">${counts(clean)}</ul>
      <div class="opt"><b>Merge</b><span>Keeps everything on this phone and adds what’s new from the file. If both have the same item, the more recently edited one wins. Your current PIN stays.</span>
        <button class="btn primary" data-m="merge">Merge</button></div>
      <div class="opt"><b>Replace</b><span>Deletes the matching data on this phone and puts the file’s data in its place${'settings' in clean ? ', including the journal PIN from the backup' : ''}.</span>
        <button class="btn danger" data-m="replace">Replace…</button></div>
      <button class="btn ghost wide-btn" data-m="cancel">Cancel</button>`,
    onMount: (api) => api.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'cancel') return api.close();
      if (m === 'replace') {
        const ok = await confirmSheet({ title: 'Replace data on this phone?', message: 'The current data in the sections listed will be deleted and swapped for the backup. Tip: export a backup of what you have now first if you’re not sure.', okText: 'Replace', danger: true });
        if (!ok) return;
      }
      try {
        const r = await restore(clean, m);
        api.close();
        notice('Backup imported 🎀', m === 'replace' ? `${r.added} items restored.` : `${r.added} added, ${r.updated} updated, ${r.skipped} already up to date.`).then(() => { location.hash = '#/'; });
      } catch (err) { notice('Import failed', 'Nothing was changed. ' + (err.message || '')); }
    })
  });
}
