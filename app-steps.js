// Small Steps — Growth Area → Goal → Small Steps. Every area, goal and step is created by Anu.
import { db } from './core-db.js';
import { esc, $, on, uid, pct } from './core-util.js';
import { sheet, confirmSheet, toast, iconPencil, iconCheck } from './core-ui.js';

// Only shown as tap-to-start suggestions when adding an area. Nothing is created until she saves.
const TEMPLATES = [['🧠', 'Mind'], ['💪', 'Physical'], ['🎨', 'Creativity'], ['📚', 'Learning'], ['💰', 'Financial'], ['💼', 'Career'], ['🌷', 'Personal']];

export default {
  id: 'steps', name: 'Small Steps', emoji: '🌱', theme: 'steps',
  async mount(ctx) {
    const [sub, id] = ctx.parts;
    if (sub === 'area' && id) return areaView(ctx, id);
    if (sub === 'goal' && id) return goalView(ctx, id);
    return areasView(ctx);
  }
};

const bar = (p) => `<div class="bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>`;
const stat = (goals) => {
  const steps = goals.flatMap((g) => g.steps);
  const done = steps.filter((s) => s.done).length;
  return { total: steps.length, done, p: pct(done, steps.length) };
};

// ---------- growth areas ----------
async function areasView(ctx) {
  const [areas, goals] = await Promise.all([db.all('areas'), db.all('goals')]);
  areas.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const cards = areas.map((a) => {
    const gs = goals.filter((g) => g.areaId === a.id), s = stat(gs);
    return `<a class="area-card" href="#/steps/area/${a.id}">
      <span class="area-emoji">${esc(a.emoji || '🌸')}</span>
      <div class="area-mid"><b>${esc(a.name)}</b><small>${gs.length} ${gs.length === 1 ? 'goal' : 'goals'}${s.total ? ` · ${s.done}/${s.total} steps` : ''}</small>${s.total ? bar(s.p) : ''}</div></a>`;
  }).join('');
  ctx.render({
    title: 'Small Steps', back: '#/',
    body: `${areas.length ? cards : `<div class="empty"><p>No growth areas yet.</p><p class="muted">A growth area is a part of your life you want to grow. Start with your own, or tap one of these:</p>
        <div class="chips">${TEMPLATES.map(([e, n]) => `<button class="chip-btn" data-tpl="${esc(n)}" data-emoji="${e}">${e} ${n}</button>`).join('')}</div></div>`}
      <button class="btn primary wide-btn" id="addArea">+ New growth area</button>`,
    bind(main) {
      $('#addArea', main).addEventListener('click', () => areaSheet(ctx, null));
      on(main, 'click', '[data-tpl]', (e, b) => areaSheet(ctx, null, { name: b.dataset.tpl, emoji: b.dataset.emoji }));
    }
  });
}

function areaSheet(ctx, area, preset) {
  const v = area || preset || { name: '', emoji: '' };
  sheet({
    title: area ? 'Edit growth area' : 'New growth area',
    html: `<div class="row2"><label class="field emoji-f"><span>Icon</span><input id="aEmoji" maxlength="4" value="${esc(v.emoji)}" placeholder="🌸" aria-label="Icon"></label>
        <label class="field grow"><span>Name</span><input id="aName" value="${esc(v.name)}" placeholder="What do you want to grow?" autocomplete="off"></label></div>
      ${!area ? `<p class="muted small">Ideas: ${TEMPLATES.map(([e, n]) => `<button class="chip-btn tiny" data-tpl="${esc(n)}" data-emoji="${e}">${e} ${n}</button>`).join(' ')}</p>` : ''}
      <p class="bad small" id="err" hidden>Give it a name.</p>
      <div class="btn-row">${area ? '<button class="btn danger-ghost" data-a="del">Delete</button>' : ''}<button class="btn primary" data-a="save">Save</button></div>`,
    onMount(api) {
      setTimeout(() => { try { $('#aName', api.el).focus(); } catch {} }, 60);
      api.el.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-tpl]');
        if (t) { $('#aName', api.el).value = t.dataset.tpl; $('#aEmoji', api.el).value = t.dataset.emoji; return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'del') {
          const goals = (await db.byIndex('goals', 'areaId', area.id));
          const ok = await confirmSheet({ title: `Delete “${area.name}”?`, message: goals.length ? `Its ${goals.length} goal${goals.length > 1 ? 's' : ''} and all their small steps will be deleted too.` : 'This growth area will be deleted.', okText: 'Delete', danger: true });
          if (!ok) return;
          await db.delMany('goals', goals.map((g) => g.id)); await db.del('areas', area.id);
          api.close(); toast('Deleted'); ctx.go('#/steps'); return;
        }
        const name = $('#aName', api.el).value.trim();
        if (!name) { $('#err', api.el).hidden = false; return; }
        const now = Date.now();
        const rec = { ...(area || { id: uid(), createdAt: now }), name, emoji: $('#aEmoji', api.el).value.trim() || '🌸', updatedAt: now };
        await db.put('areas', rec); api.close(); toast('Saved 🎀');
        if (area) areaView(ctx, area.id); else areasView(ctx);
      });
    }
  });
}

// ---------- goals in an area ----------
async function areaView(ctx, id) {
  const area = await db.get('areas', id);
  if (!area) return ctx.go('#/steps');
  const goals = (await db.byIndex('goals', 'areaId', id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const s = stat(goals);
  ctx.render({
    title: `${area.emoji || ''} ${area.name}`.trim(), back: '#/steps',
    right: `<button class="icon-btn" id="aEdit" aria-label="Rename or delete this growth area">${iconPencil}</button>`,
    body: `${goals.length ? `<section class="card summary"><h3>Overall</h3><p class="muted small">${s.done} of ${s.total} small steps done · ${s.p}%</p>${bar(s.p)}</section>` : ''}
      ${goals.map((g) => { const gs = stat([g]); return `<a class="goal-card" href="#/steps/goal/${g.id}">
        <b>${esc(g.name)}</b>${g.why ? `<p class="why">“${esc(g.why)}”</p>` : ''}
        <div class="gc-foot"><small>${gs.total ? `${gs.done}/${gs.total} steps · ${gs.p}%` : 'No steps yet'}</small></div>${bar(gs.p)}</a>`; }).join('')}
      ${goals.length ? '' : '<div class="empty"><p>No goals in this area yet.</p><p class="muted">A goal is one thing you’d like to get better at.</p></div>'}
      <button class="btn primary wide-btn" id="addGoal">+ New Goal</button>`,
    bind(main, root) {
      $('#aEdit', root).addEventListener('click', () => areaSheet(ctx, area));
      $('#addGoal', main).addEventListener('click', () => goalSheet(ctx, area, null));
    }
  });
}

function goalSheet(ctx, area, goal) {
  sheet({
    title: goal ? 'Edit goal' : 'New Goal',
    html: `<label class="field"><span>Goal</span><input id="gName" value="${esc(goal ? goal.name : '')}" placeholder="What do you want to get better at?" autocomplete="off"></label>
      <label class="field"><span>Description</span><textarea id="gDesc" rows="2" placeholder="A few words about it (optional)">${esc(goal ? goal.description : '')}</textarea></label>
      <label class="field"><span>Why it matters</span><textarea id="gWhy" rows="2" placeholder="Why do you want this?">${esc(goal ? goal.why : '')}</textarea></label>
      <p class="bad small" id="err" hidden>Give the goal a name.</p>
      <div class="btn-row">${goal ? '<button class="btn danger-ghost" data-a="del">Delete</button>' : ''}<button class="btn primary" data-a="save">Save</button></div>`,
    onMount(api) {
      setTimeout(() => { try { $('#gName', api.el).focus(); } catch {} }, 60);
      api.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        if (b.dataset.a === 'del') {
          const ok = await confirmSheet({ title: `Delete “${goal.name}”?`, message: goal.steps.length ? 'Its small steps will be deleted too.' : '', okText: 'Delete', danger: true });
          if (!ok) return;
          await db.del('goals', goal.id); api.close(); toast('Deleted'); ctx.go(`#/steps/area/${goal.areaId}`); return;
        }
        const name = $('#gName', api.el).value.trim();
        if (!name) { $('#err', api.el).hidden = false; return; }
        const now = Date.now();
        const rec = { ...(goal || { id: uid(), areaId: area.id, steps: [], createdAt: now }), name, description: $('#gDesc', api.el).value.trim(), why: $('#gWhy', api.el).value.trim(), updatedAt: now };
        await db.put('goals', rec); api.close(); toast('Saved 🎀');
        if (goal) goalView(ctx, goal.id); else ctx.go(`#/steps/goal/${rec.id}`);
      });
    }
  });
}

// ---------- one goal and its small steps ----------
async function goalView(ctx, id) {
  const goal = await db.get('goals', id);
  if (!goal) return ctx.go('#/steps');
  const area = await db.get('areas', goal.areaId);
  const s = stat([goal]);
  const active = goal.steps.filter((x) => !x.done);
  const done = goal.steps.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const row = (x) => `<div class="step ${x.done ? 'done' : ''}">
    <button class="check ${x.done ? 'on' : ''}" data-toggle="${x.id}" role="checkbox" aria-checked="${x.done}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}">${x.done ? iconCheck : ''}</button>
    <button class="step-text" data-edit="${x.id}">${esc(x.text)}</button></div>`;
  ctx.render({
    title: 'Goal', back: `#/steps/area/${goal.areaId}`, subtitle: area ? `${area.emoji || ''} ${area.name}` : '',
    right: `<button class="icon-btn" id="gEdit" aria-label="Edit goal">${iconPencil}</button>`,
    body: `<section class="card goal-head">
        <h2>${esc(goal.name)}</h2>
        ${goal.why ? `<p class="why">“${esc(goal.why)}”</p>` : ''}
        ${goal.description ? `<p class="muted">${esc(goal.description)}</p>` : ''}
        <div class="prog-line"><b>${s.p}%</b><span>${s.total ? `${s.done} of ${s.total} steps done` : 'No steps yet'}</span></div>${bar(s.p)}
      </section>
      <section class="card">
        <h3>Active steps <span class="count">${active.length}</span></h3>
        ${active.length ? active.map(row).join('') : `<p class="muted small">${goal.steps.length ? 'All steps are done. Add another when you’re ready.' : 'Add the first small step below.'}</p>`}
        <div class="add-step"><input id="newStep" placeholder="Add a small step…" autocomplete="off" enterkeyhint="done" aria-label="New small step"><button class="btn primary" id="addStep">Add</button></div>
      </section>
      ${done.length ? `<section class="card"><h3>Completed <span class="count">${done.length}</span></h3>${done.map(row).join('')}</section>` : ''}`,
    bind(main, root) {
      const again = () => goalView(ctx, id);
      const save = async (steps) => { goal.steps = steps; goal.updatedAt = Date.now(); await db.put('goals', goal); again(); };
      $('#gEdit', root).addEventListener('click', () => goalSheet(ctx, area, goal));
      const add = async () => {
        const inp = $('#newStep', main), t = inp.value.trim();
        if (!t) return;
        await save([...goal.steps, { id: uid(), text: t, done: false, createdAt: Date.now() }]);
        const n = $('#newStep'); if (n) n.focus();
      };
      $('#addStep', main).addEventListener('click', add);
      $('#newStep', main).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      on(main, 'click', '[data-toggle]', (e, b) => save(goal.steps.map((x) => (x.id === b.dataset.toggle ? { ...x, done: !x.done, doneAt: x.done ? null : Date.now() } : x))));
      on(main, 'click', '[data-edit]', (e, b) => {
        const st = goal.steps.find((x) => x.id === b.dataset.edit);
        sheet({
          title: 'Edit small step',
          html: `<label class="field"><span>Small step</span><textarea id="sText" rows="2">${esc(st.text)}</textarea></label>
            <p class="bad small" id="err" hidden>A step needs some words.</p>
            <div class="btn-row"><button class="btn danger-ghost" data-a="del">Delete</button><button class="btn primary" data-a="save">Save</button></div>`,
          onMount(api) {
            api.el.addEventListener('click', async (ev) => {
              const a = ev.target.closest('[data-a]'); if (!a) return;
              if (a.dataset.a === 'del') { api.close(); await save(goal.steps.filter((x) => x.id !== st.id)); toast('Deleted'); return; }
              const t = $('#sText', api.el).value.trim();
              if (!t) { $('#err', api.el).hidden = false; return; }
              api.close(); await save(goal.steps.map((x) => (x.id === st.id ? { ...x, text: t } : x)));
            });
          }
        });
      });
    }
  });
}
