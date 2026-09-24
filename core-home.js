// The home screen: a greeting and five cards. Nothing else.
import { esc } from './core-util.js';
import { listApps, registerRoute } from './core-router.js';
import { iconGear } from './core-ui.js';

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning, Anu 🌷';
  if (h >= 12 && h < 17) return 'Good afternoon, Anu 🎀';
  return 'Good evening, Anu 🌙';
}

const flower = (x, y, s, rot, c1, c2) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-22" rx="14" ry="20" fill="${c1}" transform="rotate(${a})"/>`).join('')}
  <circle r="10" fill="${c2}"/></g>`;
const cloud = (x, y, s, o) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M20 50h84a22 22 0 000-44 30 30 0 00-58-6 26 26 0 00-26 50z" fill="#fff"/></g>`;
const bow = (x, y, s, rot) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0C-20-26-52-22-50 0-52 22-20 26 0 0zM0 0C20-26 52-22 50 0 52 22 20 26 0 0z" fill="#F4A3BC"/><path d="M-4 4l-12 34 12-8 6 10zM4 4l12 34-12-8-6 10z" fill="#EE8CAA"/><circle r="8" fill="#E0678C"/></g>`;

function decor() {
  return `<svg class="home-decor" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${cloud(-10, 70, 1.4, 0.75)}${cloud(250, 330, 1.1, 0.6)}${cloud(20, 640, 1.5, 0.65)}
    ${flower(345, 90, 1.1, 10, '#F9CFDA', '#F2A2BA')}${flower(60, 410, 0.8, -20, '#FBDDE5', '#F5B5C8')}
    ${flower(360, 560, 1.3, 25, '#F9CFDA', '#F2A2BA')}${flower(310, 760, 0.9, 0, '#FBDDE5', '#F5B5C8')}
    ${bow(65, 215, 0.7, -14)}${bow(335, 445, 0.6, 16)}
  </svg>`;
}

registerRoute('home', {
  theme: 'home',
  mount(ctx) {
    const apps = listApps();
    ctx.render({
      bare: true, className: 'homeframe',
      body: `${decor()}
        <div class="home">
          <div class="home-top"><a class="icon-btn" href="#/backup" aria-label="Backup and restore">${iconGear}</a></div>
          <h1 class="hello">${greeting()}</h1>
          <div class="app-grid">
            ${apps.map((a) => `<a class="app-card" data-app="${esc(a.id)}" href="#/${esc(a.id)}">
              <span class="app-emoji" aria-hidden="true">${a.emoji}</span><span class="app-name">${esc(a.name)}</span></a>`).join('')}
          </div>
        </div>`
    });
  }
});
