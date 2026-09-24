// The PIN / passkey screen shown before the journal.
import { esc, $ } from './core-util.js';
import { confirmSheet, sheet, toast, iconCheck } from './core-ui.js';
import * as auth from './core-auth.js';
import { db, settings } from './core-db.js';

const dots = (n) => Array.from({ length: 8 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

export async function showLockScreen(ctx, onUnlocked) {
  const canPasskey = await auth.passkeySupported();
  if (!ctx.alive()) return;
  if (!auth.hasPin()) return setupFlow(ctx, canPasskey, onUnlocked);
  return unlockFlow(ctx, onUnlocked);
}

function keypadHtml({ passkey }) {
  const k = (n) => `<button class="key" data-k="${n}" aria-label="${n}">${n}</button>`;
  return `<div class="keypad">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k).join('')}
    ${passkey ? '<button class="key alt" data-act="passkey" aria-label="Use Face ID or Touch ID">🔑</button>' : '<span></span>'}
    ${k(0)}
    <button class="key alt" data-act="del" aria-label="Delete">⌫</button></div>`;
}

function pinEntry(ctx, { title, hint, passkey, submitText, onSubmit, extraHtml = '', onExtra }) {
  let value = '';
  let busy = false;
  const main = ctx.render({
    bare: true, className: 'lockframe',
    body: `<div class="lock">
      <div class="lock-badge">🔐</div>
      <h1>${esc(title)}</h1>
      <p class="lock-hint" id="lockHint">${esc(hint)}</p>
      <div class="pin-dots" id="pinDots" aria-hidden="true">${dots(0)}</div>
      ${keypadHtml({ passkey })}
      <button class="btn primary lock-go" id="lockGo" disabled>${esc(submitText)}</button>
      ${extraHtml}
      <a class="lock-back" href="#/">Back to ANU</a></div>`
  });
  if (!main) return;
  const setHint = (t, bad) => { const h = $('#lockHint', main); h.textContent = t; h.classList.toggle('bad', !!bad); };
  const refresh = () => { $('#pinDots', main).innerHTML = dots(value.length); $('#lockGo', main).disabled = value.length < 4 || busy; };
  const push = (d) => { if (value.length < 8) { value += d; refresh(); } };
  const pop = () => { value = value.slice(0, -1); refresh(); };
  const submit = async () => {
    if (value.length < 4 || busy) return;
    busy = true; refresh();
    const v = value;
    const res = await onSubmit(v, setHint);
    busy = false;
    if (res !== 'keep') value = '';
    if (ctx.alive()) refresh();
  };
  main.addEventListener('click', (e) => {
    const key = e.target.closest('[data-k]');
    if (key) return push(key.dataset.k);
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'del') pop();
    if (act && act.dataset.act === 'passkey') tryPasskey(ctx, setHint);
    if (e.target.closest('#lockGo')) submit();
    if (onExtra) onExtra(e, main);
  });
  const onKey = (e) => {
    if (!ctx.alive() || document.querySelector('.sheet-back')) return;
    if (/^\d$/.test(e.key)) push(e.key);
    else if (e.key === 'Backspace') pop();
    else if (e.key === 'Enter') submit();
  };
  document.addEventListener('keydown', onKey);
  ctx.onLeave(() => document.removeEventListener('keydown', onKey));
  refresh();
}

let pendingUnlock = null;
async function tryPasskey(ctx, setHint) {
  try {
    await auth.unlockWithPasskey();
    auth.markUnlocked();
    pendingUnlock && pendingUnlock();
  } catch (e) {
    if (e && e.name === 'NotAllowedError') setHint('Face ID / Touch ID was cancelled. You can use your PIN.', true);
    else setHint('Face ID / Touch ID isn’t available right now. Use your PIN.', true);
  }
}

function unlockFlow(ctx, onUnlocked) {
  pendingUnlock = onUnlocked;
  const passkey = auth.hasPasskey();
  pinEntry(ctx, {
    title: 'Anu’s shit',
    hint: passkey ? 'Enter your PIN, or tap 🔑 for Face ID / Touch ID.' : 'Enter your PIN to open your journal.',
    passkey,
    submitText: 'Unlock',
    extraHtml: '<button class="lock-forgot" data-act="forgot">Forgot PIN?</button>',
    onExtra: async (e) => { if (e.target.closest('[data-act="forgot"]')) forgot(ctx); },
    onSubmit: async (pin, setHint) => {
      const r = await auth.checkPin(pin);
      if (r.ok) { auth.markUnlocked(); onUnlocked(); return 'done'; }
      setHint(r.wait ? `Too many tries. Wait ${r.wait}s and try again.` : 'That PIN isn’t right. Try again.', true);
      return 'done';
    }
  });
}

async function forgot(ctx) {
  const ok = await confirmSheet({
    title: 'Forgot your PIN?',
    message: 'A forgotten PIN can’t be recovered — that’s what keeps the journal private.\n\nYou can erase all journal entries on this phone and set a new PIN. Other mini-apps are not touched. (If you have a backup file, you can restore your journal from it afterwards.)',
    okText: 'Erase journal', danger: true
  });
  if (!ok) return;
  const again = await confirmSheet({ title: 'Really erase the journal?', message: 'Every journal entry on this phone will be deleted. This can’t be undone.', okText: 'Yes, erase it', danger: true });
  if (!again) return;
  await db.clear('journal');
  await settings.remove('auth'); await settings.remove('authFail'); await settings.remove('passkey');
  toast('Journal erased. Set a new PIN.');
  showLockScreen(ctx, pendingUnlock);
}

function setupFlow(ctx, canPasskey, onUnlocked) {
  pendingUnlock = onUnlocked;
  let first = null;
  const step1 = () => {
    first = null;
    pinEntry(ctx, {
      title: 'Make a PIN', hint: 'Pick 4 to 8 digits. You’ll need it to open your journal.',
      submitText: 'Continue',
      onSubmit: async (pin) => { first = pin; step2(); return 'done'; }
    });
  };
  const step2 = () => {
    pinEntry(ctx, {
      title: 'Say it again', hint: 'Enter the same PIN once more.', submitText: 'Save PIN',
      extraHtml: '<button class="lock-forgot" data-act="restart">Start over</button>',
      onExtra: (e) => { if (e.target.closest('[data-act="restart"]')) step1(); },
      onSubmit: async (pin, setHint) => {
        if (pin !== first) { setHint('Those didn’t match. Try again, or start over.', true); return 'done'; }
        await auth.setPin(pin);
        auth.markUnlocked();
        if (canPasskey) offerPasskey(); else onUnlocked();
        return 'done';
      }
    });
  };
  const offerPasskey = () => {
    sheet({
      title: 'Use Face ID / Touch ID too?',
      html: `<p class="sheet-msg">ANU can ask iOS to check your face or fingerprint (through a passkey) so you don’t have to type the PIN each time. Your PIN always still works.</p>
      <div class="btn-row"><button class="btn ghost" data-a="skip">Not now</button><button class="btn primary" data-a="yes">Set it up</button></div>`,
      onMount: (api) => api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'yes') {
          try { await auth.registerPasskey(); toast('Face ID / Touch ID is on 🎀'); }
          catch { toast('Couldn’t set it up — PIN only for now.'); }
        }
        api.close();
      }),
      onClose: () => onUnlocked()
    });
  };
  step1();
}
