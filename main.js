// ANU — entry point. To add a mini-app: create app-yourapp.js that default-exports
// { id, name, emoji, theme, mount(ctx) }, import it below and add it to the list.
import { openDb, settings, askPersistentStorage } from './core-db.js';
import { registerApp, registerRoute, startRouter, route } from './core-router.js';
import { initLifecycle, onLock } from './core-auth.js';
import { mountBackup, applySettings } from './core-backup.js';
import './core-home.js';
import kaasu from './app-kaasu.js';
import journal from './app-journal.js';
import dumplings from './app-dumplings.js';
import steps from './app-steps.js';
import health from './app-health.js';

[kaasu, journal, dumplings, steps, health].forEach(registerApp);
registerRoute('backup', { theme: 'backup', mount: mountBackup });

async function boot() {
  try {
    await openDb();
    await settings.load();
    applySettings();
    askPersistentStorage();
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="boot-error"><h1>ANU can’t open its storage</h1>
      <p>${String(e && e.message || e)}</p><p>If you’re in a Private Browsing tab, open ANU in a normal tab or from your Home Screen.</p></div>`;
    return;
  }
  initLifecycle();
  // When the journal locks itself (timeout, background, leaving), redraw so the lock screen appears.
  onLock(() => { if (/^#\/journal/.test(location.hash)) route(); });
  await startRouter();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch((e) => console.warn('Service worker not registered', e));
  }
}
boot();
