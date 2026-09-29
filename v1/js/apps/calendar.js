// Calendar: Month / Week / Day, day agenda, new-event sheet, persisted user events.
import { App } from './app.js';
import { h, icon, store, pad, clamp, DAYS, MONTHS } from '../util.js';
import { dragScroll, dragGesture } from '../scroll.js';
import { sfx } from '../audio.js';
import { todaysEvents } from '../data.js';

const WS = 1;            // week starts on Monday
const HOUR = 52;         // px per hour in the time grid
const COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a'];
const DS = DAYS.map(d => d.slice(0, 3));
const MS = MONTHS.map(m => m.slice(0, 3));

const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dkey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const weekStart = d => addDays(d, -((d.getDay() - WS + 7) % 7));
const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const uid = () => Math.random().toString(36).slice(2, 10);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- deterministic demo events ---------- */
const POOL = [
  ['Team standup', 'Zoom', '#0a84ff', 9, 30, 30], ['Design review', 'Studio B', '#ff9f0a', 10, 0, 60], ['Coffee with Maya', 'Blue Bottle', '#30d158', 8, 15, 45],
  ['Dentist', 'Dr. Nowak', '#ff375f', 15, 0, 60], ['Piano lesson', 'Music school', '#bf5af2', 17, 0, 60], ['Gym', 'FitClub', '#30d158', 18, 30, 60],
  ['Lunch with Leo', 'Bar Mleczny', '#ff9f0a', 12, 30, 60], ['Project sync', 'Meet', '#0a84ff', 14, 0, 45], ['Rocket build', 'Workshop', '#ff375f', 16, 0, 120],
  ['Movie night', 'Kinoteka', '#bf5af2', 20, 0, 120], ['Call with Mom', 'FaceTime', '#64d2ff', 19, 0, 30], ['Math homework', 'Home', '#ffd60a', 16, 30, 60],
  ['Football', 'Pole Mokotowskie', '#30d158', 17, 30, 90], ['Guitar', 'Home', '#bf5af2', 11, 0, 45],
];
const ALLDAY = [['Maya’s birthday', '#ff375f'], ['Trip to Gzowo', '#30d158'], ['School day off', '#ff9f0a'], ['Launch day', '#0a84ff']];
const demoCache = new Map();
function demoFor(day) {
  if (sameDay(day, new Date())) {
    return todaysEvents().map((e, i) => ({ id: `t:${dkey(day)}:${i}`, title: e.title, place: e.place, color: e.color, start: +e.start, end: +e.end, allDay: false, demo: true }));
  }
  const k = dkey(day);
  if (demoCache.has(k)) return demoCache.get(k);
  const r = rng(day.getFullYear() * 10000 + day.getMonth() * 100 + day.getDate() + 7);
  const dow = day.getDay(), weekend = dow === 0 || dow === 6, out = [];
  const n = r() < (weekend ? .5 : .28) ? 0 : (r() < .5 ? 1 : r() < .65 ? 2 : 3);
  const used = new Set();
  for (let i = 0; i < n; i++) {
    let j; do { j = Math.floor(r() * POOL.length); } while (used.has(j));
    used.add(j);
    const [title, place, color, hh, mm, len] = POOL[j];
    const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime();
    out.push({ id: `d:${k}:${j}`, title, place, color, start: s, end: s + len * 60000, allDay: false, demo: true });
  }
  if (r() < .09) {
    const [title, color] = ALLDAY[Math.floor(r() * ALLDAY.length)], s = +sod(day);
    out.push({ id: `d:${k}:ad`, title, place: '', color, start: s, end: s + 864e5, allDay: true, demo: true });
  }
  demoCache.set(k, out);
  return out;
}

/** Side-by-side column layout for overlapping events of one day. */
function layoutDay(list) {
  list.sort((a, b) => a.s - b.s || b.e - a.e);
  const out = []; let cluster = [], cols = [], end = 0;
  const flush = () => { cluster.forEach(c => { c.n = cols.length; }); out.push(...cluster); cluster = []; cols = []; };
  for (const it of list) {
    if (cluster.length && it.s >= end) flush();
    let ci = cols.findIndex(e => e <= it.s);
    if (ci < 0) { ci = cols.length; cols.push(it.e); } else cols[ci] = it.e;
    it.col = ci; cluster.push(it); end = Math.max(end, it.e);
  }
  flush();
  return out;
}

export default class Calendar extends App {
  constructor(os, win) {
    super(os, win);
    const v = store.get('calendar.view', 'month');
    this.view = ['month', 'week', 'day'].includes(v) ? v : 'month';
    this.sel = sod(new Date());
    const u = store.get('calendar.events', []); this.user = Array.isArray(u) ? u : [];
    const dl = store.get('calendar.deleted', []); this.deleted = new Set(Array.isArray(dl) ? dl : []);
    this.sheet = null; this.dir = 0; this.todayKey = dkey(new Date()); this.cells = new Map(); this.nowEl = null; this.opened = false;
  }
  statusTone() { const st = document.getElementById('stage'); return st && st.dataset.ui === 'dark' ? 'light' : 'dark'; }

  /* ------------------------------------------------------------- data */
  eventsOn(day) {
    const ds = +sod(day), de = ds + 864e5;
    const list = [...demoFor(day), ...this.user.filter(e => e.start < de && e.end > ds)].filter(e => !this.deleted.has(e.id));
    return list.sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
  }
  timeStr(d) { d = d instanceof Date ? d : new Date(d); return this.os.sys.h24 ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : (d.getHours() % 12 || 12) + ':' + pad(d.getMinutes()) + ' ' + (d.getHours() < 12 ? 'AM' : 'PM'); }
  saveUser() { store.set('calendar.events', this.user); }

  /* ------------------------------------------------------------- build */
  build() {
    this.title = h('h1.cal-title');
    this.segB = ['month', 'week', 'day'].map(v => h('button', { dataset: { v }, onclick: () => { this.view = v; store.set('calendar.view', v); sfx.play('tick'); this.renderAll(true); } }, v[0].toUpperCase() + v.slice(1)));
    const bar = h('div.cal-bar', {}, this.title, h('div.cal-seg', {}, ...this.segB),
      h('div.cal-nav', {}, h('button.cal-nb', { onclick: () => this.shift(-1) }, icon('chevronL', 17)), h('button.cal-nb', { onclick: () => this.shift(1) }, icon('chevronR', 17))),
      h('button.cal-todaybtn', { onclick: () => { sfx.play('tick'); this.dir = this.sel < sod(new Date()) ? 1 : -1; this.sel = sod(new Date()); this.renderAll(true); } }, 'Today'),
      h('button.cal-plus', { onclick: () => this.eventSheet() }, icon('plus', 19)));

    // month view
    this.wd = h('div.cal-wd', {}, ...Array.from({ length: 7 }, (_, i) => { const n = DS[(WS + i) % 7]; return h('span', {}, h('i.s', {}, n[0]), h('i.l', {}, n)); }));
    this.grid = h('div.cal-grid');
    this.monthEl = h('div.cal-month', {}, this.wd, this.grid);
    dragGesture(this.grid, { onStart: ({ dx, dy }) => Math.abs(dx) > Math.abs(dy) * 1.2, onEnd: ({ dx, dy }) => { if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.shift(dx < 0 ? 1 : -1); } });
    this.agHead = h('div.cal-aghead'); this.agList = h('div.cal-aglist');
    this.agScroll = dragScroll(h('div.cal-agscroll', {}, h('div.cal-agin', {}, this.agHead, this.agList)));
    this.monthv = h('div.cal-monthv', {}, this.monthEl, h('div.cal-agenda', {}, this.agScroll));

    // week / day view
    this.th = h('div.cal-th'); this.adRow = h('div.cal-adrow');
    this.tscroll = dragScroll(h('div.cal-tscroll', {}, h('div.cal-tgrid')));
    this.timev = h('div.cal-timev', {}, this.th, this.adRow, this.tscroll);

    const root = h('div.cal', {}, bar, h('div.cal-body', {}, this.monthv, this.timev));
    this.root = root;
    this.renderAll(true);
    this.timerId = setInterval(() => this.minuteTick(), 30000);
    this.offSys = this.os.on('sys', () => { const s = this.win.surface; if (s && s.updateTone) s.updateTone(); });
    return root;
  }
  onOpen() { this.minuteTick(); this.renderAll(!this.opened); this.opened = true; }
  destroy() { clearInterval(this.timerId); if (this.offSys) this.offSys(); this.closeSheet(true); }
  minuteTick() {
    const k = dkey(new Date());
    if (k !== this.todayKey) { this.todayKey = k; this.renderAll(false); }
    this.updateNow();
    const s = this.win.surface; if (s && s.updateTone) s.updateTone();
  }

  /* ------------------------------------------------------------- navigation */
  shift(dir) {
    const s = this.sel; sfx.play('tick'); this.dir = dir;
    if (this.view === 'month') {
      const d = new Date(s.getFullYear(), s.getMonth() + dir, 1), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      this.sel = new Date(d.getFullYear(), d.getMonth(), Math.min(s.getDate(), dim));
    } else this.sel = addDays(s, dir * (this.view === 'week' ? 7 : 1));
    this.renderAll(true);
  }
  selectDay(d) {
    sfx.play('tick');
    if (d.getMonth() !== this.sel.getMonth() || d.getFullYear() !== this.sel.getFullYear()) { this.dir = d > this.sel ? 1 : -1; this.sel = d; this.renderAll(true); return; }
    const old = this.cells.get(dkey(this.sel)); if (old) old.classList.remove('sel');
    this.sel = d;
    const c = this.cells.get(dkey(d)); if (c) c.classList.add('sel');
    this.renderAgenda(); this.renderTitle();
  }

  /* ------------------------------------------------------------- rendering */
  renderTitle() {
    const s = this.sel;
    if (this.view === 'month') this.title.replaceChildren(MONTHS[s.getMonth()], h('small', {}, ' ' + s.getFullYear()));
    else if (this.view === 'week') {
      const a = weekStart(s), b = addDays(a, 6);
      this.title.replaceChildren(a.getMonth() === b.getMonth() ? `${MS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}` : `${MS[a.getMonth()]} ${a.getDate()} – ${MS[b.getMonth()]} ${b.getDate()}`, h('small', {}, ' ' + b.getFullYear()));
    } else this.title.replaceChildren(`${DS[s.getDay()]}, ${MS[s.getMonth()]} ${s.getDate()}`, h('small', {}, ' ' + s.getFullYear()));
  }
  renderAll(reset) {
    if (!this.root) return;
    this.root.dataset.view = this.view;
    this.segB.forEach(b => b.classList.toggle('on', b.dataset.v === this.view));
    this.renderTitle();
    if (this.view === 'month') { this.renderMonth(); this.renderAgenda(); }
    else this.renderTime(reset);
    this.dir = 0;
  }
  renderMonth() {
    const s = this.sel, first = new Date(s.getFullYear(), s.getMonth(), 1), start = weekStart(first), today = sod(new Date());
    this.cells.clear();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), out = d.getMonth() !== s.getMonth(), evs = this.eventsOn(d);
      const cell = h('button.cal-cell' + (out ? '.out' : '') + (sameDay(d, today) ? '.today' : '') + (sameDay(d, s) ? '.sel' : ''), { onclick: () => this.selectDay(d) },
        h('span.cal-n', {}, d.getDate()),
        h('div.cal-dots', {}, ...evs.slice(0, 3).map(e => h('i', { style: { background: e.color } }))),
        h('div.cal-chips', {}, ...evs.slice(0, 2).map(e => h('span.cal-chip', { style: { background: tint(e.color, .22), borderLeft: '2.5px solid ' + e.color } }, e.title)), evs.length > 2 ? h('span.cal-more', {}, `+${evs.length - 2} more`) : null));
      this.cells.set(dkey(d), cell); cells.push(cell);
    }
    this.grid.replaceChildren(...cells);
    if (this.dir && this.grid.animate) this.grid.animate([{ opacity: 0, transform: `translateX(${this.dir * 26}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.25,1)' });
  }
  renderAgenda() {
    const d = this.sel, evs = this.eventsOn(d);
    this.agHead.replaceChildren(h('b', {}, sameDay(d, new Date()) ? 'Today' : DAYS[d.getDay()]), h('span', {}, `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`));
    this.agList.replaceChildren(...(evs.length ? evs.map(e => this.agRow(e)) : [h('div.cal-none', {}, 'No Events')]));
  }
  agRow(e) {
    const t = e.allDay ? h('div.cal-agt', {}, h('span', {}, 'all-day')) : h('div.cal-agt', {}, h('b', {}, this.timeStr(e.start)), h('span', {}, this.timeStr(e.end)));
    return h('button.cal-ag', { onclick: () => this.detail(e) }, t, h('i.cal-agbar', { style: { background: e.color } }),
      h('div.cal-agm', {}, h('b', {}, e.title), e.place ? h('span', {}, e.place) : null));
  }

  renderTime(reset) {
    const days = this.view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(this.sel), i)) : [this.sel];
    const today = sod(new Date()), h24 = this.os.sys.h24;
    const prev = this.tscroll.scrollTop;
    this.th.replaceChildren(h('div.cal-gut'), ...days.map(d => h('button.cal-dh' + (sameDay(d, today) ? '.today' : '') + (sameDay(d, this.sel) ? '.sel' : ''),
      { onclick: () => { if (this.view === 'week') { this.sel = d; this.view = 'day'; store.set('calendar.view', 'day'); sfx.play('tick'); this.renderAll(true); } } },
      h('span.w', {}, this.view === 'day' ? DAYS[d.getDay()] : DS[d.getDay()]), h('span.n', {}, d.getDate()))));
    const ad = days.map(d => this.eventsOn(d).filter(e => e.allDay));
    this.adRow.style.display = ad.some(a => a.length) ? '' : 'none';
    this.adRow.replaceChildren(h('div.cal-gut', {}, h('small', {}, 'all-day')), ...ad.map(list => h('div.cal-adc', {}, ...list.map(e => h('button.cal-adchip', { style: { background: tint(e.color, .26), borderLeft: '3px solid ' + e.color }, onclick: () => this.detail(e) }, e.title)))));

    const grid = h('div.cal-tgrid', { style: { height: 24 * HOUR + 'px' } });
    for (let i = 0; i < 24; i++) {
      grid.append(h('div.cal-hl', { style: { top: i * HOUR + 'px' } }));
      if (i) grid.append(h('span.cal-hlab', { style: { top: i * HOUR - 7 + 'px' } }, h24 ? pad(i) + ':00' : (i % 12 || 12) + (i < 12 ? ' AM' : ' PM')));
    }
    const cols = h('div.cal-cols');
    this.nowEl = null; this.nowLab = null;
    for (const d of days) {
      const col = h('div.cal-col' + (sameDay(d, today) ? '.today' : ''), { onclick: e => { if (e.target === col) this.eventSheet(null, { day: d, hour: clamp(Math.floor(e.offsetY / HOUR), 0, 23) }); } });
      const ds = +sod(d), de = ds + 864e5;
      const timed = this.eventsOn(d).filter(e => !e.allDay).map(e => ({ ev: e, s: Math.max(e.start, ds), e: Math.min(e.end, de) }));
      for (const it of layoutDay(timed)) {
        const ht = Math.max(18, (it.e - it.s) / 36e5 * HOUR - 1), e = it.ev;
        col.append(h('button.cal-ev', { style: { top: (it.s - ds) / 36e5 * HOUR + 'px', height: ht + 'px', left: it.col / it.n * 100 + '%', width: 100 / it.n + '%', background: tint(e.color, .25), borderLeft: '3px solid ' + e.color }, onclick: () => this.detail(e) },
          h('b', {}, e.title), ht > 36 ? h('span', {}, this.timeStr(e.start)) : null));
      }
      if (sameDay(d, today)) { this.nowEl = h('div.cal-now', {}, h('i')); col.append(this.nowEl); this.nowLab = h('span.cal-nowlab'); grid.append(this.nowLab); }
      cols.append(col);
    }
    grid.append(cols);
    this.tscroll.replaceChildren(grid);
    this.updateNow();
    const n = new Date(), inView = days.some(d => sameDay(d, today));
    const target = reset ? (inView ? (n.getHours() + n.getMinutes() / 60 - 1.5) * HOUR : 7.5 * HOUR) : prev;
    this.tscroll.scrollTop = target;
    requestAnimationFrame(() => { this.tscroll.scrollTop = target; });
  }
  updateNow() {
    if (!this.nowEl || !this.nowEl.isConnected) return;
    const n = new Date(), y = (n - sod(n)) / 36e5 * HOUR;
    this.nowEl.style.top = y + 'px';
    if (this.nowLab) { this.nowLab.style.top = y - 8 + 'px'; this.nowLab.textContent = this.timeStr(n).replace(/ (AM|PM)$/, ''); }
  }

  /* ------------------------------------------------------------- sheets */
  openSheet({ title, left = 'Cancel', right, onRight, body }) {
    this.closeSheet(true);
    const panel = h('div.cal-sheet', {},
      h('div.cal-sh-nav', {}, h('button.cal-sh-btn', { onclick: () => this.closeSheet() }, left), h('div.cal-sh-title', {}, title),
        right ? h('button.cal-sh-btn.b', { onclick: () => onRight && onRight() }, right) : h('span.cal-sh-btn')), body);
    const wrap = h('div.cal-sheetwrap', {}, h('div.cal-scrim', { onclick: () => this.closeSheet() }), panel);
    this.root.append(wrap); void wrap.offsetWidth; wrap.classList.add('on');
    this.sheet = wrap; return wrap;
  }
  closeSheet(instant) {
    const w = this.sheet; if (!w) return;
    this.sheet = null;
    const a = document.activeElement; if (a && w.contains(a) && a.blur) a.blur();
    if (instant) { w.remove(); return; }
    w.classList.remove('on'); setTimeout(() => w.remove(), 340);
  }
  toggle(on, fn) {
    const t = h('button.cal-tg' + (on ? '.on' : ''), { onclick: () => { on = !on; t.classList.toggle('on', on); sfx.play('tick'); fn(on); } }, h('i'));
    return t;
  }

  detail(ev) {
    const s = new Date(ev.start), e = new Date(ev.end - (ev.allDay ? 1 : 0));
    const dstr = d => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    let when;
    if (ev.allDay) when = sameDay(s, e) ? [dstr(s), 'all-day'] : [dstr(s) + ' – ' + dstr(e), 'all-day'];
    else if (sameDay(s, e)) when = [dstr(s), `${this.timeStr(s)} – ${this.timeStr(e)}`];
    else when = [dstr(s) + ', ' + this.timeStr(s), '→ ' + dstr(e) + ', ' + this.timeStr(e)];
    const body = dragScroll(h('div.cal-sh-body', {}, h('div.cal-inner', {},
      h('div.cal-grp', {}, h('div.cal-dt', {}, h('i.cal-dc', { style: { background: ev.color } }),
        h('div.cal-dm', {}, h('h2', {}, ev.title), h('div.cal-dwhen', {}, when[0]), h('div.cal-dwhen.b', {}, when[1]),
          ev.place ? h('div.cal-dwhere', {}, icon('pin', 14), ev.place) : null))),
      h('div.cal-grp', {}, h('button.cal-row.danger', { onclick: () => this.deleteEvent(ev) }, 'Delete Event')))));
    this.openSheet({ title: 'Event', left: 'Close', body });
  }
  deleteEvent(ev) {
    if (ev.demo) { this.deleted.add(ev.id); store.set('calendar.deleted', [...this.deleted]); }
    else { this.user = this.user.filter(e => e.id !== ev.id); this.saveUser(); }
    sfx.play('pop'); this.closeSheet(); this.renderAll(false);
  }

  eventSheet(_ev, opts = {}) {
    const base = sod(opts.day || this.sel), now = new Date();
    const hour = opts.hour != null ? opts.hour : (sameDay(base, now) ? Math.min(now.getHours() + 1, 22) : 9);
    const d = { title: '', place: '', allDay: false, color: COLORS[0], start: +base + hour * 36e5, end: +base + (hour + 1) * 36e5 };
    let ts = d.start, te = d.end;
    const shiftDay = (ms, n) => { const x = new Date(ms); return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n, x.getHours(), x.getMinutes()).getTime(); };
    const setStart = v => { const dur = d.end - d.start; d.start = v; d.end = d.allDay ? +addDays(sod(new Date(v)), 1) : v + dur; };
    const setEnd = v => { d.end = Math.max(v, d.start + 15 * 60000); };
    const sync = () => { refs.forEach(f => f()); };
    const refs = [];
    const grp = (fn, get) => {
      const val = h('span.cal-sv'); refs.push(() => { val.textContent = get(); });
      return h('div.cal-stp', {}, h('button', { onclick: () => { fn(-1); sfx.play('tick'); sync(); } }, icon('chevronL', 13)), val, h('button', { onclick: () => { fn(1); sfx.play('tick'); sync(); } }, icon('chevronR', 13)));
    };
    const fdate = ms => { const x = new Date(ms); return `${DS[x.getDay()]}, ${MS[x.getMonth()]} ${x.getDate()}`; };
    const startLbl = h('span.cal-rl', {}, 'Starts');
    refs.push(() => { startLbl.textContent = d.allDay ? 'Date' : 'Starts'; });
    const startRow = h('div.cal-row.step', {}, startLbl,
      grp(n => setStart(shiftDay(d.start, n)), () => fdate(d.start)),
      h('div.cal-tm', {}, grp(n => setStart(d.start + n * 15 * 60000), () => this.timeStr(d.start))));
    const endRow = h('div.cal-row.step.cal-endrow', {}, h('span.cal-rl', {}, 'Ends'),
      grp(n => setEnd(shiftDay(d.end, n)), () => fdate(d.end)),
      h('div.cal-tm', {}, grp(n => setEnd(d.end + n * 15 * 60000), () => this.timeStr(d.end))));
    const title = h('input.cal-in', { type: 'text', placeholder: 'Title', enterkeyhint: 'done', maxlength: 60, oninput: e => { d.title = e.target.value; },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } });
    const place = h('input.cal-in', { type: 'text', placeholder: 'Location', enterkeyhint: 'done', maxlength: 60, oninput: e => { d.place = e.target.value; },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } });
    const dots = COLORS.map(c => { const b = h('button.cal-cdot' + (c === d.color ? '.on' : ''), { style: { background: c }, onclick: () => { d.color = c; dots.forEach(x => x.classList.toggle('on', x === b)); sfx.play('tick'); } }); return b; });
    let panel;
    const adRow = h('div.cal-row', {}, h('span.cal-rl', {}, 'All-day'), this.toggle(false, on => {
      if (on) { ts = d.start; te = d.end; d.allDay = true; d.start = +sod(new Date(d.start)); d.end = +addDays(new Date(d.start), 1); }
      else { d.allDay = false; d.start = ts; d.end = te; }
      panel.classList.toggle('allday', on); sync();
    }));
    const body = dragScroll(h('div.cal-sh-body', {}, h('div.cal-inner', {},
      h('div.cal-grp', {}, h('div.cal-row.static', {}, title), h('div.cal-row.static', {}, place)),
      h('div.cal-grp', {}, adRow, startRow, endRow),
      h('div.cal-grp', {}, h('div.cal-row.static.dots', {}, ...dots)))));
    const wrap = this.openSheet({ title: 'New Event', right: 'Add', body, onRight: () => {
      const ev = { id: 'u:' + uid(), title: d.title.trim() || 'New Event', place: d.place.trim(), allDay: d.allDay, start: d.start, end: d.end, color: d.color };
      this.user.push(ev); this.saveUser(); sfx.play('pop');
      this.sel = sod(new Date(ev.start)); this.closeSheet(); this.renderAll(false);
    } });
    panel = wrap.querySelector('.cal-sheet');
    sync();
  }
}
