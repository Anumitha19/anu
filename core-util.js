// Shared helpers: DOM, dates, money, encoding.
export const cfg = { weekStart: 1 }; // 1 = Monday, 0 = Sunday (changed in Backup & Settings)

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
export function on(root, evt, sel, fn) {
  root.addEventListener(evt, (e) => {
    const t = e.target.closest ? e.target.closest(sel) : null;
    if (t && root.contains(t)) fn(e, t);
  });
}
export function debounce(fn, ms = 500) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// ---------- dates (all dates are local "YYYY-MM-DD" strings) ----------
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON3 = MONTHS.map((m) => m.slice(0, 3));
export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW3 = DOW.map((d) => d.slice(0, 3));
const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayStr = () => ymd(new Date());
export const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const isMonthKey = (s) => /^\d{4}-\d{2}$/.test(s || '');
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function addMonths(mk, n) { const [y, m] = mk.split('-').map(Number); return ymd(new Date(y, m - 1 + n, 1)).slice(0, 7); }
export const monthOf = (s) => s.slice(0, 7);
export const monthStart = (mk) => `${mk}-01`;
export const daysInMonth = (mk) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthEnd = (mk) => `${mk}-${p2(daysInMonth(mk))}`;
export const monthName = (mk) => MONTHS[Number(mk.slice(5, 7)) - 1];
export const monthLabel = (mk) => `${monthName(mk)} ${mk.slice(0, 4)}`;
export function weekStartOf(s) { const d = parseYmd(s); return addDays(s, -((d.getDay() - cfg.weekStart + 7) % 7)); }
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export function longDate(s) { const d = parseYmd(s); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
export function shortDate(s) { const d = parseYmd(s); return `${MON3[d.getMonth()]} ${d.getDate()}`; }
export function dayTitle(s) { const d = parseYmd(s); const t = `${MONTHS[d.getMonth()]} ${d.getDate()}`; return d.getFullYear() === new Date().getFullYear() ? t : `${t}, ${d.getFullYear()}`; }
export const weekdayOf = (s) => DOW[parseYmd(s).getDay()];
export function weekRangeLabel(start) {
  const a = parseYmd(start), b = parseYmd(addDays(start, 6));
  if (a.getMonth() === b.getMonth()) return `${MON3[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`;
  return `${MON3[a.getMonth()]} ${a.getDate()} – ${MON3[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
}
export const timeLabel = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const dateOfTs = (ts) => ymd(new Date(ts));
export function dowHeaders() { return Array.from({ length: 7 }, (_, i) => DOW[(cfg.weekStart + i) % 7]); }
export function monthGrid(mk) {
  const [y, m] = mk.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() - cfg.weekStart + 7) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth(mk) }, (_, i) => `${mk}-${p2(i + 1)}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
// week-start dates of every week that touches the month
export function weeksOfMonth(mk) {
  const out = [];
  let w = weekStartOf(monthStart(mk));
  const end = monthEnd(mk);
  while (w <= end) { out.push(w); w = addDays(w, 7); }
  return out;
}

// ---------- money ----------
const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const inr = (n) => '₹' + nf.format(Math.round((Number(n) || 0) * 100) / 100);

// ---------- encoding ----------
export function bytesToB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToBytes(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
export const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);
