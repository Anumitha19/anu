// Kaasu — a money diary. Calendar → day page → separate income / outgoing / savings entries.
import { db } from './core-db.js';
import {
  esc, $, on, uid, debounce, inr, todayStr, isYmd, isMonthKey, addDays, addMonths, monthOf, monthStart, monthEnd,
  monthLabel, monthName, monthGrid, dowHeaders, weekStartOf, weekDays, weekRangeLabel, longDate, weekdayOf, shortDate, MON3, DOW3, parseYmd
} from './core-util.js';
import { sheet, confirmSheet, toast, readAmount, chevronLeft, chevronRight, iconTrash } from './core-ui.js';

const TYPES = {
  income: { label: 'Income', emoji: '🌷', add: 'Add income', cls: 'in' },
  outgoing: { label: 'Outgoing', emoji: '🛍️', add: 'Add outgoing', cls: 'out' },
  savings: { label: 'Savings', emoji: '🐷', add: 'Add savings', cls: 'sav' }
};
const nav = (active) => [
  { id: 'month', label: 'Month', icon: '🌸', href: `#/kaasu/month/${todayStr().slice(0, 7)}` },
  { id: 'week', label: 'Week', icon: '🗓️', href: `#/kaasu/week/${todayStr()}` },
  { id: 'year', label: 'Year', icon: '🌷', href: `#/kaasu/year/${todayStr().slice(0, 4)}` }
];

const totals = (list) => list.reduce((t, x) => { t[x.type] += x.amount; return t; }, { income: 0, outgoing: 0, savings: 0 });
const groupBy = (list, key) => list.reduce((m, x) => { (m[x[key]] = m[x[key]] || []).push(x); return m; }, {});
const sumRow = (t, cls = '') => `<div class="sum3 ${cls}">
  <div class="s in"><small>Income</small><b>${inr(t.income)}</b></div>
  <div class="s out"><small>Expenses</small><b>${inr(t.outgoing)}</b></div>
  <div class="s sav"><small>Savings</small><b>${inr(t.savings)}</b></div></div>`;
const stepper = (prev, next, mid, sub = '') => `<div class="stepper">
  <a class="icon-btn" href="${prev}" aria-label="Previous">${chevronLeft}</a>
  <div class="st-mid"><h2>${mid}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
  <a class="icon-btn" href="${next}" aria-label="Next">${chevronRight}</a></div>`;

export default {
  id: 'kaasu', name: 'Kaasu', emoji: '💰', theme: 'kaasu',
  async mount(ctx) {
    const [view, arg] = ctx.parts;
    if (view === 'day' && isYmd(arg)) return dayView(ctx, arg);
    if (view === 'week' && isYmd(arg)) return weekView(ctx, arg);
    if (view === 'year' && /^\d{4}$/.test(arg || '')) return yearView(ctx, arg);
    return monthView(ctx, view === 'month' && isMonthKey(arg) ? arg : todayStr().slice(0, 7));
  }
};

// ---------------- MONTH ----------------
async function monthView(ctx, mk) {
  const [txs, note] = await Promise.all([db.range('kaasuTx', 'date', monthStart(mk), monthEnd(mk)), db.get('kaasuNotes', mk)]);
  const byDate = groupBy(txs, 'date');
  const today = todayStr();
  const grid = monthGrid(mk).map((w) => w.map((d) => {
    if (!d) return '<span class="day blank"></span>';
    const list = byDate[d] || [];
    const has = (t) => list.some((x) => x.type === t);
    return `<a class="day ${d === today ? 'today' : ''} ${list.length ? 'has' : ''}" href="#/kaasu/day/${d}" aria-label="${esc(longDate(d))}${list.length ? ', ' + list.length + ' entries' : ''}">
      <span class="dn">${Number(d.slice(8))}</span>
      <span class="dots">${has('income') ? '<i class="in"></i>' : ''}${has('outgoing') ? '<i class="out"></i>' : ''}${has('savings') ? '<i class="sav"></i>' : ''}</span></a>`;
  }).join('')).join('');

  ctx.render({
    title: 'Kaasu', back: '#/', nav: nav(), navActive: 'month',
    right: mk !== today.slice(0, 7) ? `<a class="pill-btn" href="#/kaasu/month/${today.slice(0, 7)}">Today</a>` : '',
    body: `${stepper(`#/kaasu/month/${addMonths(mk, -1)}`, `#/kaasu/month/${addMonths(mk, 1)}`, monthLabel(mk))}
      <section class="card summary"><h3>${monthName(mk)} Summary</h3>${sumRow(totals(txs))}</section>
      <section class="card cal" aria-label="Calendar">
        <div class="cal-head">${dowHeaders().map((d) => `<span>${d.slice(0, 3)}</span>`).join('')}</div>
        <div class="cal-grid">${grid}</div>
        <div class="legend"><span><i class="in"></i>income</span><span><i class="out"></i>outgoing</span><span><i class="sav"></i>savings</span></div>
      </section>
      <section class="sticky" aria-label="${monthName(mk)} plan">
        <span class="sticky-pin" aria-hidden="true">📌</span>
        <h3>${monthName(mk)} Plan</h3>
        <textarea id="planText" rows="5" placeholder="What do you want to do with your money this month?" aria-label="${monthName(mk)} plan">${esc(note ? note.text : '')}</textarea>
        <small id="planState" class="muted">Saves as you write</small>
      </section>`,
    bind(main) {
      const ta = $('#planText', main), state = $('#planState', main);
      const persist = async () => {
        const text = ta.value;
        if (text.trim()) await db.put('kaasuNotes', { month: mk, text, updatedAt: Date.now() });
        else await db.del('kaasuNotes', mk);
        state.textContent = 'Saved ✓';
      };
      const save = debounce(persist, 600);
      ta.addEventListener('input', () => { state.textContent = 'Saving…'; save(); });
      ta.addEventListener('blur', () => save.flush());
      ctx.onLeave(() => save.flush());
    }
  });
}

// ---------------- WEEK ----------------
async function weekView(ctx, any) {
  const ws = weekStartOf(any), days = weekDays(ws), we = days[6];
  const txs = await db.range('kaasuTx', 'date', ws, we);
  const byDate = groupBy(txs, 'date');
  const today = todayStr();
  const rows = days.map((d) => {
    const list = byDate[d] || [];
    const t = totals(list);
    const chips = ['income', 'outgoing', 'savings'].filter((k) => t[k] > 0).map((k) => `<span class="chip ${TYPES[k].cls}">${TYPES[k].emoji} ${inr(t[k])}</span>`).join('');
    return `<a class="week-row ${d === today ? 'today' : ''}" href="#/kaasu/day/${d}">
      <div class="wr-date"><b>${weekdayOf(d).slice(0, 3)}</b><span>${shortDate(d)}</span></div>
      <div class="wr-body">${chips || '<span class="muted">Nothing noted</span>'}</div><span class="wr-go">${chevronRight}</span></a>`;
  }).join('');
  ctx.render({
    title: 'Kaasu', back: '#/', nav: nav(), navActive: 'week',
    right: weekStartOf(today) !== ws ? `<a class="pill-btn" href="#/kaasu/week/${today}">Today</a>` : '',
    body: `${stepper(`#/kaasu/week/${addDays(ws, -7)}`, `#/kaasu/week/${addDays(ws, 7)}`, esc(weekRangeLabel(ws)))}
      <section class="card summary"><h3>This week</h3>${sumRow(totals(txs))}</section>
      <section class="card list">${rows}</section>`
  });
}

// ---------------- YEAR ----------------
async function yearView(ctx, y) {
  const txs = await db.range('kaasuTx', 'date', `${y}-01-01`, `${y}-12-31`);
  const byMonth = groupBy(txs.map((x) => ({ ...x, m: x.date.slice(0, 7) })), 'm');
  const nowM = todayStr().slice(0, 7);
  const cards = Array.from({ length: 12 }, (_, i) => {
    const mk = `${y}-${String(i + 1).padStart(2, '0')}`;
    const t = totals(byMonth[mk] || []);
    const empty = !(byMonth[mk] || []).length;
    return `<a class="year-card ${mk === nowM ? 'today' : ''} ${empty ? 'empty' : ''}" href="#/kaasu/month/${mk}">
      <h4>${monthName(mk)}</h4>
      <p class="in"><small>Income</small>${inr(t.income)}</p><p class="out"><small>Expenses</small>${inr(t.outgoing)}</p><p class="sav"><small>Savings</small>${inr(t.savings)}</p></a>`;
  }).join('');
  ctx.render({
    title: 'Kaasu', back: '#/', nav: nav(), navActive: 'year',
    right: y !== todayStr().slice(0, 4) ? `<a class="pill-btn" href="#/kaasu/year/${todayStr().slice(0, 4)}">Today</a>` : '',
    body: `${stepper(`#/kaasu/year/${Number(y) - 1}`, `#/kaasu/year/${Number(y) + 1}`, y)}
      <section class="card summary"><h3>${y} Summary</h3>${sumRow(totals(txs))}</section>
      <div class="year-grid">${cards}</div>`
  });
}

// ---------------- DAY ----------------
async function dayView(ctx, date) {
  const txs = (await db.byIndex('kaasuTx', 'date', date)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const t = totals(txs);
  const section = (type) => {
    const list = txs.filter((x) => x.type === type), meta = TYPES[type];
    return `<section class="card tx-sec ${meta.cls}">
      <div class="sec-head"><h3>${meta.emoji} ${meta.label}</h3><b>${inr(t[type])}</b></div>
      ${list.length ? list.map((x) => `<div class="tx"><button class="tx-main" data-edit="${x.id}"><span class="tx-amt">${inr(x.amount)}</span><span class="tx-note">${esc(x.note) || '<i class="muted">no note</i>'}</span></button>
        <button class="icon-btn small" data-del="${x.id}" aria-label="Delete this entry">${iconTrash}</button></div>`).join('') : '<p class="muted small">Nothing here yet.</p>'}
      <button class="btn soft add" data-add="${type}">+ ${meta.add}</button></section>`;
  };
  const back = `#/kaasu/month/${monthOf(date)}`;
  ctx.render({
    title: 'Kaasu', back, nav: nav(), navActive: 'month',
    body: `${stepper(`#/kaasu/day/${addDays(date, -1)}`, `#/kaasu/day/${addDays(date, 1)}`, esc(longDate(date)), esc(weekdayOf(date)))}
      ${sumRow(t, 'flat')}
      ${section('income')}${section('outgoing')}${section('savings')}`,
    bind(main) {
      const again = () => dayView(ctx, date);
      on(main, 'click', '[data-add]', (e, b) => entrySheet({ type: b.dataset.add, date, done: again }));
      on(main, 'click', '[data-edit]', (e, b) => entrySheet({ type: txs.find((x) => x.id === b.dataset.edit).type, date, entry: txs.find((x) => x.id === b.dataset.edit), done: again }));
      on(main, 'click', '[data-del]', async (e, b) => {
        const x = txs.find((q) => q.id === b.dataset.del);
        if (await confirmSheet({ title: 'Delete this entry?', message: `${TYPES[x.type].label}: ${inr(x.amount)}${x.note ? ' — ' + x.note : ''}`, okText: 'Delete', danger: true })) {
          await db.del('kaasuTx', x.id); toast('Deleted'); again();
        }
      });
    }
  });
}

function entrySheet({ type, date, entry, done }) {
  const meta = TYPES[type];
  sheet({
    title: entry ? `Edit ${meta.label.toLowerCase()}` : meta.add,
    html: `<label class="field"><span>Amount</span><div class="money-in"><i>₹</i><input id="amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${entry ? entry.amount : ''}"></div></label>
      <label class="field"><span>Reason / note</span><textarea id="note" rows="2" placeholder="What was it for?">${esc(entry ? entry.note : '')}</textarea></label>
      <label class="field"><span>Date</span><input id="dt" type="date" value="${entry ? entry.date : date}"></label>
      <p class="bad small" id="err" hidden></p>
      <div class="btn-row">${entry ? '<button class="btn danger-ghost" data-a="del">Delete</button>' : ''}<button class="btn primary" data-a="save">Save</button></div>`,
    onMount(api) {
      const amt = $('#amt', api.el);
      setTimeout(() => { try { amt.focus(); } catch {} }, 60);
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'del') {
          if (await confirmSheet({ title: 'Delete this entry?', okText: 'Delete', danger: true })) { await db.del('kaasuTx', entry.id); api.close(); toast('Deleted'); done(); }
          return;
        }
        const v = readAmount(amt), err = $('#err', api.el), d = $('#dt', api.el).value;
        if (!(v > 0)) { err.textContent = 'Enter an amount greater than zero.'; err.hidden = false; return; }
        if (!isYmd(d)) { err.textContent = 'Pick a date.'; err.hidden = false; return; }
        const now = Date.now();
        await db.put('kaasuTx', { id: entry ? entry.id : uid(), type, amount: v, note: $('#note', api.el).value.trim(), date: d, createdAt: entry ? entry.createdAt : now, updatedAt: now });
        api.close(); toast('Saved 🎀'); done();
      });
    }
  });
}
