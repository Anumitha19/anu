// Health mukiyam bigil uh — habits Anu creates herself. Daily habits and weekly habits behave differently.
import { db } from './core-db.js';
import {
  esc, $, on, uid, pct, todayStr, isYmd, isMonthKey, addDays, addMonths, weekStartOf, weekDays, weekRangeLabel, dayTitle, weekdayOf,
  monthLabel, monthStart, monthEnd, monthGrid, dowHeaders, weeksOfMonth, DOW3, parseYmd, shortDate
} from './core-util.js';
import { sheet, confirmSheet, toast, chevronLeft, chevronRight, iconCheck } from './core-ui.js';

const nav = () => [
  { id: 'day', label: 'Day', icon: '🌸', href: '#/health' },
  { id: 'week', label: 'Week', icon: '🗓️', href: `#/health/week/${todayStr()}` },
  { id: 'month', label: 'Month', icon: '🌙', href: `#/health/month/${todayStr().slice(0, 7)}` },
  { id: 'habits', label: 'My habits', icon: '✏️', href: '#/health/habits' }
];
const badge = (h) => `<span class="badge ${h.type}">${h.type}</span>`;
const bar = (p) => `<div class="bar"><i style="width:${p}%"></i></div>`;
const logId = (h, d) => `${h}|${d}`;
const stepper = (prev, next, mid, sub = '', nextOff = false) => `<div class="stepper">
  <a class="icon-btn" href="${prev}" aria-label="Previous">${chevronLeft}</a>
  <div class="st-mid"><h2>${mid}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
  ${nextOff ? '<span class="icon-btn ghosted"></span>' : `<a class="icon-btn" href="${next}" aria-label="Next">${chevronRight}</a>`}</div>`;
const emptyHabits = `<div class="empty"><p>No habits yet.</p><p class="muted">Add the habits you want to keep — daily or weekly — and they’ll show up here.</p><a class="btn primary" href="#/health/habits">+ New Habit</a></div>`;

async function activeHabits() {
  return (await db.all('habits')).filter((h) => h.active).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
const logsIn = (lo, hi) => db.range('habitLogs', 'date', lo, hi);
async function setLog(habitId, date, on_) {
  if (on_) await db.put('habitLogs', { id: logId(habitId, date), habitId, date, updatedAt: Date.now() });
  else await db.del('habitLogs', logId(habitId, date));
}

export default {
  id: 'health', name: 'Health mukiyam bigil uh', emoji: '🩷', theme: 'health',
  async mount(ctx) {
    const [sub, arg] = ctx.parts;
    if (sub === 'habits') return habitsView(ctx);
    if (sub === 'week' && isYmd(arg)) return weekView(ctx, arg);
    if (sub === 'month' && isMonthKey(arg)) return monthView(ctx, arg);
    return dayView(ctx, sub === 'day' && isYmd(arg) ? arg : todayStr());
  }
};

// ---------------- DAY ----------------
async function dayView(ctx, date) {
  const today = todayStr();
  const ws = weekStartOf(date), we = addDays(ws, 6);
  const [habits, logs] = await Promise.all([activeHabits(), logsIn(ws, we)]);
  const daily = habits.filter((h) => h.type === 'daily'), weekly = habits.filter((h) => h.type === 'weekly');
  const future = date > today;
  const isDone = (h) => logs.some((l) => l.habitId === h.id && l.date === date);
  const weekLogs = (h) => logs.filter((l) => l.habitId === h.id);
  const nDone = daily.filter(isDone).length;
  const dayHref = (d) => (d === today ? '#/health' : `#/health/day/${d}`);

  const dailyRows = daily.map((h) => `<button class="hrow ${isDone(h) ? 'done' : ''}" data-daily="${h.id}" role="checkbox" aria-checked="${isDone(h)}" ${future ? 'disabled' : ''}>
      <span class="check ${isDone(h) ? 'on' : ''}">${isDone(h) ? iconCheck : ''}</span><span class="hname">${esc(h.name)}</span></button>`).join('');
  const weeklyRows = weekly.map((h) => {
    const ls = weekLogs(h), on_ = ls.length > 0;
    const days = ls.map((l) => weekdayOf(l.date).slice(0, 3)).join(', ');
    return `<button class="hrow ${on_ ? 'done' : ''}" data-weekly="${h.id}" role="checkbox" aria-checked="${on_}" ${future && !on_ ? 'disabled' : ''}>
      <span class="check ${on_ ? 'on' : ''}">${on_ ? iconCheck : ''}</span><span class="hname">${esc(h.name)}<small>${on_ ? 'Done this week · ' + days : 'Not yet this week'}</small></span></button>`;
  }).join('');

  ctx.render({
    title: 'Health', subtitle: '', back: '#/', nav: nav(), navActive: 'day',
    right: date !== today ? `<a class="pill-btn" href="#/health">Today</a>` : '',
    body: `${stepper(dayHref(addDays(date, -1)), dayHref(addDays(date, 1)), esc(dayTitle(date)), esc(weekdayOf(date)))}
      ${!habits.length ? emptyHabits : ''}
      ${daily.length ? `<section class="card"><div class="sec-head"><h3>Daily ${badge({ type: 'daily' })}</h3><small class="muted">${nDone} of ${daily.length}</small></div>${dailyRows}</section>` : ''}
      ${weekly.length ? `<section class="card"><div class="sec-head"><h3>Weekly ${badge({ type: 'weekly' })}</h3><small class="muted">${esc(weekRangeLabel(ws))}</small></div>${weeklyRows}</section>` : ''}
      ${future ? '<p class="muted small center">You can check things off once the day arrives.</p>' : ''}`,
    bind(main) {
      const again = () => dayView(ctx, date);
      on(main, 'click', '[data-daily]', async (e, b) => { const id = b.dataset.daily; await setLog(id, date, !isDone(daily.find((h) => h.id === id))); again(); });
      on(main, 'click', '[data-weekly]', async (e, b) => {
        const h = weekly.find((x) => x.id === b.dataset.weekly), ls = weekLogs(h);
        if (ls.length) await db.delMany('habitLogs', ls.map((l) => l.id)); else await setLog(h.id, date, true);
        again();
      });
    }
  });
}

// ---------------- WEEK ----------------
async function weekView(ctx, any) {
  const today = todayStr();
  const ws = weekStartOf(any), days = weekDays(ws);
  const [habits, logs] = await Promise.all([activeHabits(), logsIn(ws, days[6])]);
  const has = new Set(logs.map((l) => l.id));
  const daily = habits.filter((h) => h.type === 'daily'), weekly = habits.filter((h) => h.type === 'weekly');
  const dot = (h, d) => `<button class="wdot ${has.has(logId(h.id, d)) ? 'on' : ''} ${d === today ? 'today' : ''}" data-tog="${h.id}|${d}" ${d > today ? 'disabled' : ''} role="checkbox" aria-checked="${has.has(logId(h.id, d))}" aria-label="${esc(h.name)}, ${weekdayOf(d)}">${has.has(logId(h.id, d)) ? iconCheck : ''}</button>`;
  const head = `<div class="wdays">${days.map((d) => `<span class="${d === today ? 'today' : ''}"><small>${weekdayOf(d).slice(0, 3)}</small><b>${Number(d.slice(8))}</b></span>`).join('')}</div>`;

  ctx.render({
    title: 'Health', back: '#/', nav: nav(), navActive: 'week',
    right: weekStartOf(today) !== ws ? `<a class="pill-btn" href="#/health/week/${today}">Today</a>` : '',
    body: `${stepper(`#/health/week/${addDays(ws, -7)}`, `#/health/week/${addDays(ws, 7)}`, esc(weekRangeLabel(ws)))}
      ${!habits.length ? emptyHabits : ''}
      ${daily.length ? `<section class="card"><div class="sec-head"><h3>Daily ${badge({ type: 'daily' })}</h3></div>${head}
        ${daily.map((h) => { const n = days.filter((d) => has.has(logId(h.id, d))).length;
          return `<div class="wh"><div class="wh-top"><b>${esc(h.name)}</b><small>${n}/7</small></div><div class="wrow">${days.map((d) => dot(h, d)).join('')}</div></div>`; }).join('')}</section>` : ''}
      ${weekly.length ? `<section class="card"><div class="sec-head"><h3>Weekly ${badge({ type: 'weekly' })}</h3></div>${head}
        ${weekly.map((h) => { const n = days.filter((d) => has.has(logId(h.id, d))).length;
          return `<div class="wh"><div class="wh-top"><b>${esc(h.name)}</b><span class="wk-pill ${n ? 'yes' : ''}">${n ? 'Done ✓' : 'Not yet'}</span></div><div class="wrow">${days.map((d) => dot(h, d)).join('')}</div></div>`; }).join('')}</section>` : ''}`,
    bind(main) {
      on(main, 'click', '[data-tog]', async (e, b) => {
        const [hid, d] = b.dataset.tog.split('|');
        await setLog(hid, d, !has.has(logId(hid, d)));
        weekView(ctx, any);
      });
    }
  });
}

// ---------------- MONTH ----------------
async function monthView(ctx, mk) {
  const today = todayStr();
  const weeks = weeksOfMonth(mk);
  const lo = weeks[0], hi = addDays(weeks[weeks.length - 1], 6);
  const [habits, logs] = await Promise.all([activeHabits(), logsIn(lo, hi)]);
  const has = new Set(logs.map((l) => l.id));
  const daily = habits.filter((h) => h.type === 'daily'), weekly = habits.filter((h) => h.type === 'weekly');
  const applies = (h, d) => (h.createdDate || '0000-00-00') <= d || has.has(logId(h.id, d));

  const cell = (d) => {
    if (!d) return '<span class="hday blank"></span>';
    const tot = daily.filter((h) => applies(h, d)), done = tot.filter((h) => has.has(logId(h.id, d))).length;
    const star = weekly.some((h) => has.has(logId(h.id, d)));
    const p = tot.length ? Math.round((done / tot.length) * 100) : 0;
    const cls = tot.length && done === tot.length ? 'full' : done ? 'part' : '';
    return `<a class="hday ${cls} ${d === today ? 'today' : ''}" href="#/health/day/${d}" aria-label="${esc(dayTitle(d))}: ${done} of ${tot.length} daily habits${star ? ', weekly habit done' : ''}">
      <span class="ring" style="--p:${p}"><b>${Number(d.slice(8))}</b></span>${star ? '<i class="star" aria-hidden="true">✦</i>' : ''}</a>`;
  };

  const dailyStats = daily.map((h) => {
    const from = [monthStart(mk), h.createdDate || monthStart(mk)].sort().pop();
    const to = [monthEnd(mk), today].sort()[0];
    let possible = 0, done = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) { possible++; if (has.has(logId(h.id, d))) done++; }
    return `<div class="stat"><div class="wh-top"><b>${esc(h.name)}</b>${badge(h)}</div>${possible ? bar(pct(done, possible)) : ''}<small class="muted">${possible ? `${done} of ${possible} days` : 'Nothing to count yet'}</small></div>`;
  }).join('');
  const weeklyStats = weekly.map((h) => {
    const relevant = weeks.filter((w) => w <= today && addDays(w, 6) >= (h.createdDate || w));
    const done = relevant.filter((w) => weekDays(w).some((d) => has.has(logId(h.id, d)))).length;
    return `<div class="stat"><div class="wh-top"><b>${esc(h.name)}</b>${badge(h)}</div>${relevant.length ? bar(pct(done, relevant.length)) : ''}<small class="muted">${relevant.length ? `done in ${done} of ${relevant.length} ${relevant.length === 1 ? 'week' : 'weeks'}` : 'Nothing to count yet'}</small></div>`;
  }).join('');

  ctx.render({
    title: 'Health', back: '#/', nav: nav(), navActive: 'month',
    right: mk !== today.slice(0, 7) ? `<a class="pill-btn" href="#/health/month/${today.slice(0, 7)}">Today</a>` : '',
    body: `${stepper(`#/health/month/${addMonths(mk, -1)}`, `#/health/month/${addMonths(mk, 1)}`, monthLabel(mk))}
      ${!habits.length ? emptyHabits : `<section class="card cal hcal">
        <div class="cal-head">${dowHeaders().map((d) => `<span>${d.slice(0, 3)}</span>`).join('')}</div>
        <div class="cal-grid">${monthGrid(mk).map((w) => w.map(cell).join('')).join('')}</div>
        <div class="legend"><span><i class="lg full"></i>all daily done</span><span><i class="lg part"></i>some</span><span><i class="star">✦</i>weekly habit done</span></div></section>
      ${daily.length ? `<section class="card"><div class="sec-head"><h3>Daily habits ${badge({ type: 'daily' })}</h3></div>${dailyStats}</section>` : ''}
      ${weekly.length ? `<section class="card"><div class="sec-head"><h3>Weekly habits ${badge({ type: 'weekly' })}</h3></div>${weeklyStats}</section>` : ''}`}`
  });
}

// ---------------- MY HABITS ----------------
async function habitsView(ctx) {
  const all = (await db.all('habits')).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const row = (h) => `<button class="habit-row ${h.active ? '' : 'off'}" data-h="${h.id}"><span class="hname">${esc(h.name)}</span>${badge(h)}<span class="st ${h.active ? 'on' : ''}">${h.active ? 'active' : 'paused'}</span></button>`;
  ctx.render({
    title: 'Health', back: '#/', nav: nav(), navActive: 'habits',
    body: `<h2 class="page-h">My habits</h2>
      ${all.length ? `<section class="card">${all.map(row).join('')}</section>` : '<div class="empty"><p>Nothing here yet.</p><p class="muted">Add the first habit you want to keep.</p></div>'}
      <button class="btn primary wide-btn" id="newH">+ New Habit</button>`,
    bind(main) {
      $('#newH', main).addEventListener('click', () => habitSheet(ctx, null));
      on(main, 'click', '[data-h]', (e, b) => habitSheet(ctx, all.find((h) => h.id === b.dataset.h)));
    }
  });
}

function habitSheet(ctx, habit) {
  let type = habit ? habit.type : 'daily';
  sheet({
    title: habit ? 'Edit habit' : 'New Habit',
    html: `<label class="field"><span>Habit name</span><input id="hName" value="${esc(habit ? habit.name : '')}" placeholder="Habit name" autocomplete="off"></label>
      <div class="field"><span>How often</span><div class="seg" id="hType"><button data-t="daily" class="${type === 'daily' ? 'on' : ''}">Daily</button><button data-t="weekly" class="${type === 'weekly' ? 'on' : ''}">Weekly</button></div>
        <small class="muted" id="hTypeNote"></small></div>
      <label class="switch-row"><span>Active</span><input type="checkbox" id="hActive" ${!habit || habit.active ? 'checked' : ''}></label>
      <p class="bad small" id="err" hidden>Give the habit a name.</p>
      <div class="btn-row">${habit ? '<button class="btn danger-ghost" data-a="del">Delete</button>' : ''}<button class="btn primary" data-a="save">Save</button></div>`,
    onMount(api) {
      const note = () => { $('#hTypeNote', api.el).textContent = type === 'daily' ? 'Checked off every day it’s done.' : 'Once a week is enough — it counts for the whole week.'; };
      note();
      setTimeout(() => { try { if (!habit) $('#hName', api.el).focus(); } catch {} }, 60);
      api.el.addEventListener('click', async (e) => {
        const t = e.target.closest('#hType button');
        if (t) { type = t.dataset.t; api.el.querySelectorAll('#hType button').forEach((x) => x.classList.toggle('on', x === t)); note(); return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'del') {
          const ok = await confirmSheet({ title: `Delete “${habit.name}”?`, message: 'Its past check-ins will be deleted too. If you only want a break, switch it to inactive instead.', okText: 'Delete', danger: true });
          if (!ok) return;
          const logs = await db.byIndex('habitLogs', 'habitId', habit.id);
          await db.delMany('habitLogs', logs.map((l) => l.id)); await db.del('habits', habit.id);
          api.close(); toast('Deleted'); habitsView(ctx); return;
        }
        const name = $('#hName', api.el).value.trim();
        if (!name) { $('#err', api.el).hidden = false; return; }
        const now = Date.now();
        await db.put('habits', { ...(habit || { id: uid(), createdAt: now, createdDate: todayStr() }), name, type, active: $('#hActive', api.el).checked, updatedAt: now });
        api.close(); toast('Saved 🎀'); habitsView(ctx);
      });
    }
  });
}
