// Daily Dumplings — four gentle questions, once a day.
import { db } from './core-db.js';
import { esc, $, on, todayStr, isYmd, addDays, longDate, weekdayOf, timeLabel, dateOfTs, MONTHS } from './core-util.js';
import { toast, confirmSheet, chevronLeft, chevronRight } from './core-ui.js';

const FIELDS = [
  { key: 'learned', label: 'What I learned', emoji: '📖', hint: 'Something new, big or tiny.' },
  { key: 'challenge', label: 'Challenge', emoji: '⛰️', hint: 'What felt hard today?' },
  { key: 'improvement', label: 'One improvement', emoji: '🌱', hint: 'One thing I’ll do a little better.' },
  { key: 'mistake', label: 'What mistake', emoji: '🫧', hint: 'What went wrong, and what it taught me.' }
];
const nav = () => [
  { id: 'day', label: 'Today', icon: '🥟', href: '#/dumplings' },
  { id: 'past', label: 'Past days', icon: '🗒️', href: '#/dumplings/past' }
];

export default {
  id: 'dumplings', name: 'Daily Dumplings', emoji: '🥟', theme: 'dumplings',
  async mount(ctx) {
    const [sub, arg] = ctx.parts;
    if (sub === 'past') return pastView(ctx);
    if (sub === 'day' && isYmd(arg)) return dayView(ctx, arg);
    return dayView(ctx, todayStr());
  }
};

async function dayView(ctx, date) {
  const rec = await db.get('dumplings', date);
  const today = todayStr();
  const vals = Object.fromEntries(FIELDS.map((f) => [f.key, rec ? rec[f.key] || '' : '']));
  let dirty = false;
  const isToday = date === today;
  const dayHref = (d) => (d === today ? '#/dumplings' : `#/dumplings/day/${d}`);

  const readForm = (main) => { FIELDS.forEach((f) => { vals[f.key] = $(`#f_${f.key}`, main).value; }); };
  const hasText = () => FIELDS.some((f) => vals[f.key].trim());
  const persist = async () => {
    const now = Date.now();
    await db.put('dumplings', { date, ...vals, createdAt: rec ? rec.createdAt : now, updatedAt: now });
    dirty = false;
  };

  ctx.render({
    title: 'Daily Dumplings', back: '#/', nav: nav(), navActive: isToday ? 'day' : 'past',
    body: `<div class="stepper">
        <a class="icon-btn" href="${dayHref(addDays(date, -1))}" aria-label="Previous day">${chevronLeft}</a>
        <div class="st-mid"><h2>${isToday ? 'Today' : esc(weekdayOf(date))}</h2><p>${esc(longDate(date))}</p></div>
        ${date < today ? `<a class="icon-btn" href="${dayHref(addDays(date, 1))}" aria-label="Next day">${chevronRight}</a>` : '<span class="icon-btn ghosted"></span>'}
      </div>
      ${FIELDS.map((f) => `<section class="card dump">
        <label for="f_${f.key}"><span class="dump-emoji" aria-hidden="true">${f.emoji}</span><b>${f.label}</b></label>
        <textarea id="f_${f.key}" rows="3" placeholder="${esc(f.hint)}">${esc(vals[f.key])}</textarea></section>`).join('')}
      <button class="btn primary wide-btn" id="dSave">Save Dumpling 🥟</button>
      <p class="muted small center" id="dState">${rec ? `Saved ${esc(longDate(dateOfTs(rec.updatedAt)))} at ${esc(timeLabel(rec.updatedAt))}` : 'Not saved yet'}</p>
      ${rec ? '<button class="btn danger-ghost wide-btn" id="dDel">Delete this day’s dumpling</button>' : ''}`,
    bind(main) {
      main.addEventListener('input', () => { dirty = true; });
      $('#dSave', main).addEventListener('click', async () => {
        readForm(main);
        if (!hasText()) { toast('Write something in at least one box first.'); return; }
        await persist(); toast('Dumpling saved 🥟'); dayView(ctx, date);
      });
      const del = $('#dDel', main);
      if (del) del.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: 'Delete this dumpling?', message: `${longDate(date)} will be cleared.`, okText: 'Delete', danger: true }))) return;
        dirty = false; await db.del('dumplings', date); toast('Deleted'); dayView(ctx, date);
      });
      // Don't lose words if she leaves without pressing save.
      ctx.onLeave(() => { if (dirty && document.contains(main)) { readForm(main); if (hasText()) persist(); } });
    }
  });
}

async function pastView(ctx) {
  const all = (await db.all('dumplings')).sort((a, b) => (a.date < b.date ? 1 : -1));
  const groups = [];
  all.forEach((r) => {
    const k = r.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.k !== k) { g = { k, rows: [] }; groups.push(g); }
    g.rows.push(r);
  });
  const snippet = (r) => {
    const f = FIELDS.find((x) => (r[x.key] || '').trim());
    return f ? `<i>${f.label}:</i> ${esc(r[f.key].trim().replace(/\s+/g, ' ').slice(0, 110))}` : '';
  };
  const filled = (r) => FIELDS.filter((f) => (r[f.key] || '').trim()).length;
  ctx.render({
    title: 'Daily Dumplings', back: '#/', nav: nav(), navActive: 'past',
    body: `<section class="card jump"><label class="field"><span>Open a day</span><input id="dJump" type="date" max="${todayStr()}" value="${todayStr()}"></label>
      <button class="btn soft" id="dGo">Open</button></section>
      ${groups.length ? groups.map((g) => `<h3 class="grp">${MONTHS[Number(g.k.slice(5)) - 1]} ${g.k.slice(0, 4)}</h3>
        ${g.rows.map((r) => `<a class="d-card" href="${r.date === todayStr() ? '#/dumplings' : '#/dumplings/day/' + r.date}">
          <div class="d-date"><b>${esc(weekdayOf(r.date).slice(0, 3))}</b><span>${Number(r.date.slice(8))}</span></div>
          <div class="d-body"><p>${snippet(r)}</p><small>${filled(r)} of 4 answered</small></div></a>`).join('')}`).join('')
        : '<div class="empty"><p>No dumplings yet.</p><p class="muted">Fill in today’s and it will show up here.</p></div>'}`,
    bind(main) {
      $('#dGo', main).addEventListener('click', () => {
        const v = $('#dJump', main).value;
        if (isYmd(v)) ctx.go(v === todayStr() ? '#/dumplings' : `#/dumplings/day/${v}`);
      });
    }
  });
}
