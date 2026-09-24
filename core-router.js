// Tiny hash router + mini-app frame.
// Hash routes keep working on GitHub Pages sub-paths (…/anu/#/kaasu/day/2026-09-23) with no server rewrites.
import { esc, $ } from './core-util.js';
import { chevronLeft } from './core-ui.js';

const apps = new Map();
export const registerApp = (def) => apps.set(def.id, def);
export const listApps = () => Array.from(apps.values());
export const getApp = (id) => apps.get(id);

let token = 0;
let leaveFns = [];
let extraRoutes = {};
export const registerRoute = (name, def) => { extraRoutes[name] = def; };

const parse = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });

export const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

const THEME_COLORS = { home: '#FBE3E8', kaasu: '#FCEBEE', journal: '#F6E6EA', dumplings: '#FFE7E3', steps: '#FBE9F0', health: '#FCEAF0', backup: '#FBE3E8' };

export async function route() {
  const my = ++token;
  const fns = leaveFns; leaveFns = [];
  fns.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  const parts = parse();
  const root = $('#app');
  const first = parts[0] || 'home';
  const app = apps.get(first);
  const special = extraRoutes[first];
  const themeId = app ? app.theme : (special ? special.theme : 'home');
  root.dataset.theme = themeId;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', THEME_COLORS[themeId] || '#FBE3E8');

  let fresh = true;
  const ctx = {
    parts: parts.slice(1),
    root,
    go,
    alive: () => token === my,
    onLeave: (f) => leaveFns.push(f),
    // Draw a screen. Pass keepScroll:false to jump to the top.
    render({ title = '', subtitle = '', back = '#/', right = '', body = '', nav = null, navActive = '', bind = null, wide = false, bare = false, className = '' }) {
      if (token !== my) return null;
      const old = $('.scroll', root);
      const keep = !fresh && old ? old.scrollTop : 0;
      const navHtml = nav ? `<nav class="bottomnav" aria-label="Sections">${nav.map((n) =>
        `<a href="${n.href}" class="${n.id === navActive ? 'active' : ''}" ${n.id === navActive ? 'aria-current="page"' : ''}><span class="ni">${n.icon || ''}</span><span class="nl">${esc(n.label)}</span></a>`).join('')}</nav>` : '';
      root.innerHTML = `<div class="frame ${className}">
        ${bare ? '' : `<header class="topbar">
          <a class="icon-btn back" href="${back}" aria-label="Back">${chevronLeft}</a>
          <div class="tb-title"><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
          <div class="tb-right">${right}</div></header>`}
        <main class="scroll"><div class="page ${wide ? 'wide' : ''}">${body}</div></main>${navHtml}</div>`;
      const main = $('.scroll', root);
      if (fresh) { main.classList.add('page-in'); }
      main.scrollTop = keep;
      fresh = false;
      if (bind) bind(main, root);
      return main;
    }
  };

  try {
    if (app) await app.mount(ctx);
    else if (special) await special.mount(ctx);
    else if (first === 'home') await extraRoutes.home.mount(ctx);
    else location.replace('#/');
  } catch (e) {
    console.error(e);
    if (token === my) {
      ctx.render({ title: 'Oops', body: `<div class="card empty"><p>Something went wrong while opening this page.</p><p class="muted small">${esc(e && e.message)}</p><a class="btn primary" href="#/">Back to ANU</a></div>` });
    }
  }
}

export function startRouter() {
  window.addEventListener('hashchange', route);
  return route();
}
