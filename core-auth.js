// App-level lock for the journal.
//
// WHAT THIS IS (and isn't):
//  • The PIN is hashed with PBKDF2-SHA-256 (200,000 rounds, random salt) using the Web Crypto API. It is never stored in plain text.
//  • Face ID / Touch ID: Safari does NOT let web pages call Apple's Face ID API directly. The only route is WebAuthn
//    (a passkey held by iOS on this device). When a passkey is registered, "unlocking" asks iOS to verify you with Face ID / Touch ID.
//    There is no server, so the check is made by ANU's own code on this device — it is a convenient lock, not a vault.
//  • Journal text is stored in IndexedDB on this phone. It is protected by the app lock and by iOS's own device encryption
//    (your phone passcode), not by a per-entry encryption key like a native app could use.
import { settings } from './core-db.js';
import { bytesToB64, b64ToBytes } from './core-util.js';

let unlocked = false;
let hiddenAt = 0;
const lockListeners = new Set();

export const isUnlocked = () => unlocked;
export const hasPin = () => !!settings.get('auth');
export const markUnlocked = () => { unlocked = true; };
export const onLock = (f) => { lockListeners.add(f); return () => lockListeners.delete(f); };
export function lock(reason = 'manual') {
  if (!unlocked) return;
  unlocked = false;
  lockListeners.forEach((f) => { try { f(reason); } catch (e) { console.error(e); } });
}
export const lockDelaySeconds = () => Number(settings.get('lockAfter', 60));

// ---------- PIN ----------
const enc = new TextEncoder();
async function derive(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}
const sameBytes = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
export const validPin = (pin) => /^\d{4,8}$/.test(pin);

export async function setPin(pin) {
  if (!validPin(pin)) throw new Error('PIN must be 4 to 8 digits.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 200000;
  const hash = await derive(pin, salt, iter);
  await settings.set('auth', { salt: bytesToB64(salt), hash: bytesToB64(hash), iter });
  await settings.remove('authFail');
}

// Returns { ok: true } | { ok: false, wait: seconds }
export async function checkPin(pin) {
  const a = settings.get('auth');
  if (!a) return { ok: false, wait: 0 };
  const fail = settings.get('authFail', { n: 0, until: 0 });
  if (Date.now() < fail.until) return { ok: false, wait: Math.ceil((fail.until - Date.now()) / 1000) };
  const h = await derive(pin, b64ToBytes(a.salt), a.iter);
  if (sameBytes(h, b64ToBytes(a.hash))) {
    if (fail.n) await settings.remove('authFail');
    return { ok: true };
  }
  const n = fail.n + 1;
  const wait = n >= 5 ? Math.min(600, 15 * 2 ** (n - 5)) : 0;
  await settings.set('authFail', { n, until: wait ? Date.now() + wait * 1000 : 0 });
  return { ok: false, wait };
}

// ---------- Passkey (WebAuthn platform authenticator) ----------
export async function passkeySupported() {
  try {
    return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}
export const hasPasskey = () => !!settings.get('passkey');

export async function registerPasskey() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'ANU', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'anu', displayName: 'Anu' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: 60000
    }
  });
  if (!cred) throw new Error('No passkey was created.');
  await settings.set('passkey', { id: bytesToB64(new Uint8Array(cred.rawId)) });
}

export async function unlockWithPasskey() {
  const p = settings.get('passkey');
  if (!p) throw new Error('No passkey set up.');
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64ToBytes(p.id) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  if (!res) throw new Error('Passkey check was cancelled.');
  return true;
}
export const removePasskey = () => settings.remove('passkey');

// ---------- Lifecycle: privacy shield + auto-lock ----------
const inJournal = () => /^#\/journal/.test(location.hash);
export function initLifecycle() {
  const shield = document.getElementById('shield');
  const cover = () => { if (unlocked && inJournal()) shield.hidden = false; };
  const uncover = () => { shield.hidden = true; };
  const goneAway = () => {
    hiddenAt = Date.now();
    cover();
    if (lockDelaySeconds() === 0) lock('background');
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') goneAway();
    else {
      const delay = lockDelaySeconds();
      if (unlocked && delay > 0 && hiddenAt && Date.now() - hiddenAt >= delay * 1000) lock('timeout');
      uncover();
    }
  });
  window.addEventListener('pagehide', goneAway);
  window.addEventListener('pageshow', uncover);
}
