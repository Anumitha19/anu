# ANU 🌸

A private, offline-first personal-life app for iPhone. Plain HTML + CSS + JavaScript — no build step, no server, no accounts.
All data stays on the phone (IndexedDB).

## Files (all live in the repo root)

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `main.js` | App shell, shared design system, start-up |
| `manifest.webmanifest`, `service-worker.js` | PWA install + offline caching |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Icons |
| `core-db.js` | IndexedDB + settings |
| `core-router.js`, `core-ui.js`, `core-util.js` | Navigation, sheets/toasts, dates & money helpers |
| `core-auth.js`, `core-lockscreen.js` | Journal lock (PIN + optional passkey / Face ID) |
| `core-backup.js` | Backup & Restore (+ small settings) |
| `core-home.js` | Home screen |
| `app-kaasu.js` | 💰 Kaasu |
| `app-journal.js` | 🔐 Anu’s shit |
| `app-dumplings.js` | 🥟 Daily Dumplings |
| `app-steps.js` | 🌱 Small Steps |
| `app-health.js` | 🩷 Health mukiyam bigil uh |

## Publishing on GitHub Pages (from an iPhone)

1. In Safari, sign in at github.com → **+ → New repository**. Name it exactly `anu`, keep it Public (free Pages needs public), tick **Add a README**, create.
2. In the repo tap **Add file → Upload files**, choose **all 22 files** from the Files app (select them together), then **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment* pick **Deploy from a branch**, branch **main**, folder **/(root)**, Save.
4. After a minute your app is at `https://YOUR-USERNAME.github.io/anu/`.
5. Open that address in **Safari**, tap Share → **Add to Home Screen**. From then on, open ANU from the Home Screen icon.

> The repo is public, but your data is not in it — your journal, money and habits live only in your phone’s storage.

## Good to know

* **Use the Home Screen icon.** On iPhone, Safari and the Home Screen app keep separate storage. Set up your PIN and data inside the Home Screen app.
* **Back up regularly** (home screen → ⚙︎ Backup & Restore). Deleting the icon deletes the data.
* **Updating the app:** edit/replace files on GitHub, and bump `CACHE = 'anu-shell-v1'` in `service-worker.js` (e.g. to `v2`) so phones fetch the new files. Close and reopen ANU twice.
* **Adding a mini-app:** write `app-yourapp.js` that default-exports `{ id, name, emoji, theme, mount(ctx) }`, import it in `main.js`, add it to the list, and add its file to `SHELL` in `service-worker.js`.
* **Journal lock:** a browser can’t call Face ID directly. ANU uses a hashed PIN (PBKDF2) and, if you enable it, a WebAuthn passkey that iOS unlocks with Face ID / Touch ID. This is a browser-level lock, not a native hardware-backed vault.
