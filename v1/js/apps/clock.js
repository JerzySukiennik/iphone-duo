// Clock: World Clock, Alarm, Stopwatch, Timer. Dark iOS look, tab bar (compact) / sidebar (regular width).
import { App } from './app.js';
import { h, icon, svg, store, pad, clamp } from '../util.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';

/* ------------------------------------------------------------------ time zones */
const CATALOG = [
  ['Warsaw', 'Europe/Warsaw', 'Poland'], ['London', 'Europe/London', 'United Kingdom'], ['New York', 'America/New_York', 'United States'],
  ['Los Angeles', 'America/Los_Angeles', 'United States'], ['Tokyo', 'Asia/Tokyo', 'Japan'], ['Sydney', 'Australia/Sydney', 'Australia'],
  ['Dubai', 'Asia/Dubai', 'United Arab Emirates'], ['Singapore', 'Asia/Singapore', 'Singapore'], ['Paris', 'Europe/Paris', 'France'],
  ['Berlin', 'Europe/Berlin', 'Germany'], ['Rome', 'Europe/Rome', 'Italy'], ['Lisbon', 'Europe/Lisbon', 'Portugal'],
  ['Helsinki', 'Europe/Helsinki', 'Finland'], ['Istanbul', 'Europe/Istanbul', 'Turkey'], ['Moscow', 'Europe/Moscow', 'Russia'],
  ['Cairo', 'Africa/Cairo', 'Egypt'], ['Cape Town', 'Africa/Johannesburg', 'South Africa'], ['Reykjavik', 'Atlantic/Reykjavik', 'Iceland'],
  ['Mumbai', 'Asia/Kolkata', 'India'], ['Bangkok', 'Asia/Bangkok', 'Thailand'], ['Beijing', 'Asia/Shanghai', 'China'],
  ['Seoul', 'Asia/Seoul', 'South Korea'], ['Auckland', 'Pacific/Auckland', 'New Zealand'], ['Honolulu', 'Pacific/Honolulu', 'United States'],
  ['Chicago', 'America/Chicago', 'United States'], ['Denver', 'America/Denver', 'United States'], ['Toronto', 'America/Toronto', 'Canada'],
  ['Mexico City', 'America/Mexico_City', 'Mexico'], ['São Paulo', 'America/Sao_Paulo', 'Brazil'], ['Buenos Aires', 'America/Argentina/Buenos_Aires', 'Argentina'],
];
const CITY = {};
for (const [name, tz, country] of CATALOG) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); CITY[name] = { name, tz, country }; } catch { /* tz not supported here */ }
}
const DEFAULT_CITIES = ['Warsaw', 'London', 'New York', 'Los Angeles', 'Tokyo', 'Sydney', 'Dubai', 'Singapore'];

const fmtCache = {};
/** Wall-clock parts of `d` in time zone `tz`. */
function tzParts(tz, d) {
  let f = fmtCache[tz];
  if (!f) f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const o = {};
  for (const p of f.formatToParts(d)) if (p.type !== 'literal') o[p.type] = +p.value;
  if (o.hour === 24) o.hour = 0;
  return o;
}
const offsetMin = (o, d) => Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(d / 1000) * 1000) / 60000);

const hm = (hh, mm, h24) => h24 ? { t: pad(hh) + ':' + pad(mm), ap: '' } : { t: (hh % 12 || 12) + ':' + pad(mm), ap: hh < 12 ? 'AM' : 'PM' };
const uid = () => Math.random().toString(36).slice(2, 9);
const range = (n, f = pad) => Array.from({ length: n }, (_, i) => f(i));
const fmtSW = ms => {
  const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, hh = Math.floor(ms / 3600000);
  return (hh ? hh + ':' + pad(m) : pad(m)) + ':' + pad(s) + '.' + pad(cs);
};
const fmtLeft = ms => {
  const t = Math.ceil(ms / 1000), hh = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return hh ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const DORD = [1, 2, 3, 4, 5, 6, 0];
const DSHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SOUNDS = ['Radar', 'Reflection', 'Chimes', 'Beacon', 'Bulletin', 'Circuit', 'Constellation'];
function repeatText(days) {
  const s = [...days].sort((a, b) => a - b).join(',');
  if (!days.length) return 'Never';
  if (days.length === 7) return 'Every day';
  if (s === '1,2,3,4,5') return 'Weekdays';
  if (s === '0,6') return 'Weekends';
  return DORD.filter(d => days.includes(d)).map(d => DSHORT[d]).join(' ');
}
const DEFAULT_ALARMS = [
  { id: 'a1', h: 7, m: 0, label: 'Wake up', days: [1, 2, 3, 4, 5], on: true, sound: 'Radar', snooze: true },
  { id: 'a2', h: 9, m: 30, label: 'Weekend', days: [0, 6], on: false, sound: 'Reflection', snooze: true },
];

/* ------------------------------------------------------------------ analog face */
const FACE = (() => {
  let t = '';
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, big = i % 3 === 0, r1 = big ? 37 : 40, r2 = 44.5;
    t += `<line class="tk" x1="${(50 + Math.sin(a) * r1).toFixed(2)}" y1="${(50 - Math.cos(a) * r1).toFixed(2)}" x2="${(50 + Math.sin(a) * r2).toFixed(2)}" y2="${(50 - Math.cos(a) * r2).toFixed(2)}" stroke-width="${big ? 2.6 : 1.4}" stroke-linecap="round"/>`;
  }
  return `<svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="49"/>${t}<line class="hd hh" x1="50" y1="53" x2="50" y2="29" stroke-width="4.4" stroke-linecap="round"/><line class="hd mh" x1="50" y1="53" x2="50" y2="15" stroke-width="3" stroke-linecap="round"/><line class="sh" x1="50" y1="59" x2="50" y2="11" stroke="#ff9f0a" stroke-width="1.6" stroke-linecap="round"/><circle cx="50" cy="50" r="3.2" fill="#ff9f0a"/><circle class="bg" cx="50" cy="50" r="1.3"/></svg>`;
})();

const alarmGlyph = () => svg('<circle cx="12" cy="13" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4.500l3 1.800M4 6.500 7.500 3.500M20 6.500 16.500 3.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
const timerGlyph = () => svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12V5.500A6.500 6.500 0 0 1 18.500 12Z"/>');

/* ------------------------------------------------------------------ wheel picker (DOM, iOS-like) */
const ITEM = 40, ROWS = 5, HALF = 4;
function wheel(values, { index = 0, loop = false, unit = '', width = 84, onChange } = {}) {
  const n = values.length;
  const el = h('div.clk-wheel' + (unit ? '.unit' : ''), { dataset: { nodrag: '' }, style: { width: width + 'px', height: ITEM * ROWS + 'px' } });
  const pool = [];
  for (let i = -HALF; i <= HALF; i++) { const it = h('div.clk-wi'); pool.push(it); el.append(it); }
  if (unit) el.append(h('span.clk-wu', {}, unit));
  const mod = (a, m) => ((a % m) + m) % m;
  const cl = p => loop ? p : clamp(p, 0, n - 1);
  let pos = clamp(index, 0, n - 1), last = mod(Math.round(pos), n), raf = 0, wt = 0;
  const draw = () => {
    const base = Math.round(pos);
    for (let k = -HALF; k <= HALF; k++) {
      const it = pool[k + HALF], idx = base + k;
      if (!loop && (idx < 0 || idx >= n)) { it.style.display = 'none'; continue; }
      const d = idx - pos, a = clamp(d * .42, -1.25, 1.25);
      const v = values[mod(idx, n)];
      if (it._v !== v) { it.textContent = v; it._v = v; }
      it.style.display = '';
      it.style.transform = `translateY(${(Math.sin(a) * 96).toFixed(1)}px) rotateX(${(-a).toFixed(3)}rad)`;
      it.style.opacity = Math.max(0, Math.cos(a) ** 3).toFixed(2);
    }
  };
  const sync = quiet => {
    draw();
    const cur = mod(Math.round(pos), n);
    if (cur !== last) { last = cur; if (!quiet) sfx.play('tick'); onChange && onChange(cur); }
  };
  const settle = (target, ms = 360) => {
    cancelAnimationFrame(raf);
    target = cl(target);
    const from = pos, t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      pos = from + (target - from) * e; sync();
      raf = k < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  };
  let drag = null;
  const scaleOf = () => el.getBoundingClientRect().height / el.offsetHeight || 1;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(raf); raf = 0;
    drag = { id: e.pointerId, y: e.clientY, p: pos, ly: e.clientY, lt: performance.now(), v: 0, moved: false, k: scaleOf() };
    try { el.setPointerCapture(e.pointerId); } catch { /* */ }
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = (e.clientY - drag.y) / drag.k;
    if (Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const now = performance.now(), dt = Math.max(1, now - drag.lt);
    drag.v = drag.v * .6 + (-(e.clientY - drag.ly) / drag.k / ITEM / dt) * .4;
    drag.ly = e.clientY; drag.lt = now;
    pos = cl(drag.p - dy / ITEM); sync();
  });
  const up = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) { // tap on a neighbouring row scrolls to it
      const r = el.getBoundingClientRect(), off = Math.round((e.clientY - (r.top + r.height / 2)) / (ITEM * d.k));
      settle(Math.round(pos) + off, 260);
      return;
    }
    const target = Math.round(pos + d.v * 230);
    settle(target, Math.min(900, 260 + Math.abs(target - pos) * 42));
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    cancelAnimationFrame(raf); raf = 0;
    pos = cl(pos + e.deltaY / 60); sync();
    clearTimeout(wt); wt = setTimeout(() => settle(Math.round(pos), 200), 110);
  }, { passive: false });
  draw();
  return { el, get: () => clamp(mod(Math.round(pos), n), 0, n - 1), set(i, quiet = true) { cancelAnimationFrame(raf); pos = cl(i); sync(quiet); } };
}

/* ================================================================== app */
export default class Clock extends App {
  constructor(os, win) {
    super(os, win);
    const tab = store.get('clock.tab', 'world');
    this.tab = ['world', 'alarm', 'stopwatch', 'timer'].includes(tab) ? tab : 'world';
    const cs = store.get('clock.cities', null);
    this.cities = (Array.isArray(cs) ? cs : DEFAULT_CITIES).filter(n => CITY[n]);
    const al = store.get('clock.alarms', null);
    this.alarms = Array.isArray(al) ? al : DEFAULT_ALARMS.map(a => ({ ...a, days: [...a.days] }));
    this.edit = { world: false, alarm: false };
    this.sw = { base: 0, t0: 0, running: false, laps: [], lastTotal: 0 };
    this.tm = { state: 'idle', total: 0, endAt: 0, left: 0, h: 0, m: 5, s: 0 };
    this.cards = new Map();
    this.snoozes = []; this.fired = {}; this.ringing = null;
    this.raf = 0; this.vis = false; this.lastSec = -1; this.sheet = null;
    this.frame = this.frame.bind(this);
  }
  statusTone() { return 'light'; }

  /* ------------------------------------------------------------- build */
  build() {
    const root = h('div.clk');
    this.root = root;
    this.pages = { world: this.buildWorld(), alarm: this.buildAlarm(), stopwatch: this.buildStopwatch(), timer: this.buildTimer() };
    const defs = [
      ['world', 'World Clock', () => icon('globe')], ['alarm', 'Alarms', alarmGlyph],
      ['stopwatch', 'Stopwatch', () => icon('timer')], ['timer', 'Timer', timerGlyph],
    ];
    const tabBtn = ([id, name, ic]) => h('button.clk-tab', { dataset: { tab: id }, onclick: () => { sfx.play('tick'); this.setTab(id); } }, ic(), h('span', {}, name));
    this.side = h('nav.clk-side', {}, h('div.clk-side-t', {}, 'Clock'), ...defs.map(tabBtn));
    this.bar = h('nav.clk-bar', {}, ...defs.map(tabBtn));
    this.main = h('div.clk-main', {}, h('div.clk-pages', {}, ...Object.values(this.pages).map(p => p.el)), this.bar);
    root.append(this.side, this.main);
    this.renderWorld(); this.renderAlarms(); this.updateSW(true); this.syncTimer();
    this.setTab(this.tab, true);
    this.timerId = setInterval(() => this.tick(), 250);
    return root;
  }
  setTab(id, silent) {
    this.tab = id;
    if (!silent) store.set('clock.tab', id);
    this.root.querySelectorAll('.clk-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
    for (const k in this.pages) this.pages[k].el.classList.toggle('on', k === id);
    if (id === 'world') this.updateWorld(true);
    if (id === 'alarm') this.updateNext();
    if (id === 'stopwatch') this.updateSW(true);
    if (id === 'timer') this.updateTimerText();
    this.kick();
  }
  onOpen() { this.tick(); this.kick(); }
  onAttach() { this.tick(); }
  onNotification(n) { if (n && n.kind === 'timer') this.setTab('timer'); else this.setTab('alarm'); if (this.ringing) this.showRing(); }
  destroy() {
    clearInterval(this.timerId); cancelAnimationFrame(this.raf); this.raf = 0;
    if (this.ringing) sfx.ringtone(false);
    this.os.clearActivity('alarm'); this.os.clearActivity('timer');
    this.closeSheet(true);
  }

  /* ------------------------------------------------------------- shared bits */
  toggle(on, fn) {
    const t = h('button.clk-tg' + (on ? '.on' : ''), { onclick: e => { e.stopPropagation(); on = !on; t.classList.toggle('on', on); sfx.play('tick'); fn(on); } }, h('i'));
    return t;
  }
  page(cls, title, left, right, extra) {
    const inner = h('div.clk-inner', {}, title ? h('h1.clk-title', {}, title) : null, extra);
    const scroll = dragScroll(h('div.clk-scroll', {}, inner));
    const head = h('div.clk-head', {}, left || h('span'), right || h('span'));
    const el = h('section.clk-page.' + cls, {}, head, scroll);
    return { el, inner, scroll, head };
  }
  openSheet({ title, left = 'Cancel', right, onRight, body }) {
    this.closeSheet(true);
    const panel = h('div.clk-sheet', {},
      h('div.clk-sh-nav', {}, h('button.clk-sh-btn', { onclick: () => this.closeSheet() }, left), h('div.clk-sh-title', {}, title),
        right ? h('button.clk-sh-btn.b', { onclick: () => onRight && onRight() }, right) : h('span.clk-sh-btn')),
      body);
    const wrap = h('div.clk-sheetwrap', {}, h('div.clk-scrim', { onclick: () => this.closeSheet() }), panel);
    this.root.append(wrap);
    void wrap.offsetWidth; wrap.classList.add('on');
    this.sheet = wrap;
    return wrap;
  }
  closeSheet(instant) {
    const w = this.sheet; if (!w) return;
    this.sheet = null;
    const a = document.activeElement; if (a && w.contains(a) && a.blur) a.blur();
    if (instant) { w.remove(); return; }
    w.classList.remove('on'); setTimeout(() => w.remove(), 340);
  }
  isVisible() { return this.root.isConnected && getComputedStyle(this.win.el).visibility !== 'hidden'; }

  /* ------------------------------------------------------------- world clock */
  buildWorld() {
    const edit = h('button.clk-hbtn', { onclick: () => { this.edit.world = !this.edit.world; sfx.play('tick'); this.renderWorld(); } }, 'Edit');
    const add = h('button.clk-hbtn.ic', { onclick: () => this.addCitySheet() }, icon('plus', 22));
    const grid = h('div.clk-grid');
    const p = this.page('clk-world', 'World Clock', edit, add, grid);
    p.edit = edit; p.grid = grid;
    return p;
  }
  renderWorld() {
    const p = this.pages.world;
    p.el.classList.toggle('editing', this.edit.world);
    p.edit.textContent = this.edit.world ? 'Done' : 'Edit';
    p.edit.style.visibility = this.cities.length || this.edit.world ? '' : 'hidden';
    this.cards.clear();
    p.grid.replaceChildren(...(this.cities.length ? this.cities.map(n => this.cityCard(n)) : [h('div.clk-empty', {}, 'No cities. Tap + to add one.')]));
    this.updateWorld(true);
  }
  cityCard(name) {
    const c = CITY[name];
    const face = h('div.clk-face', { html: FACE });
    const r = { name, tz: c.tz, face, hh: face.querySelector('.hh'), mh: face.querySelector('.mh'), sh: face.querySelector('.sh'), time: h('span.clk-ct'), ap: h('small.clk-ap'), sub: h('div.clk-sub'), mn: -1, night: null };
    const el = h('div.clk-card', {},
      h('button.clk-minus', { onclick: e => { e.stopPropagation(); this.removeCity(name, el); } }, h('i')),
      face,
      h('div.clk-ctime', {}, r.time, r.ap),
      h('div.clk-city', {}, name),
      r.sub);
    r.el = el; this.cards.set(name, r);
    return el;
  }
  removeCity(name, el) {
    this.cities = this.cities.filter(n => n !== name);
    store.set('clock.cities', this.cities);
    sfx.play('pop');
    if (el) el.classList.add('out');
    setTimeout(() => this.renderWorld(), 200);
  }
  updateWorld(force) {
    if (!this.cards.size) return;
    const now = new Date(), h24 = this.os.sys.h24;
    const ly = now.getFullYear(), lm = now.getMonth(), ld = now.getDate(), lo = -now.getTimezoneOffset();
    for (const r of this.cards.values()) {
      const p = tzParts(r.tz, now);
      r.hh.setAttribute('transform', `rotate(${((p.hour % 12) + p.minute / 60) * 30} 50 50)`);
      r.mh.setAttribute('transform', `rotate(${(p.minute + p.second / 60) * 6} 50 50)`);
      r.sh.setAttribute('transform', `rotate(${p.second * 6} 50 50)`);
      const night = p.hour < 6 || p.hour >= 18;
      if (night !== r.night) { r.night = night; r.face.classList.toggle('night', night); }
      if (force || p.minute !== r.mn || r.h24 !== h24) {
        r.mn = p.minute; r.h24 = h24;
        const t = hm(p.hour, p.minute, h24);
        r.time.textContent = t.t; r.ap.textContent = t.ap ? ' ' + t.ap : '';
        const dd = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(ly, lm, ld)) / 864e5);
        const diff = (offsetMin(p, now) - lo) / 60, ad = Math.abs(diff), whole = Math.floor(ad), frac = Math.round((ad - whole) * 60);
        const off = (diff < 0 ? '-' : '+') + whole + (frac ? ':' + pad(frac) : '') + 'HRS';
        r.sub.textContent = (dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : (dd > 0 ? '+' : '') + dd + ' days') + ', ' + off;
      }
    }
  }
  addCitySheet() {
    const list = h('div.clk-results');
    const q = h('input.clk-search', { type: 'text', placeholder: 'Search', enterkeyhint: 'search', oninput: () => fill() });
    const body = dragScroll(h('div.clk-sh-body', {}, h('div.clk-inner', {}, h('div.clk-search-w', {}, icon('search', 15), q), list)));
    const fill = () => {
      const s = q.value.trim().toLowerCase(), now = new Date(), h24 = this.os.sys.h24;
      const rows = Object.values(CITY).filter(c => !this.cities.includes(c.name) && (!s || c.name.toLowerCase().includes(s) || c.country.toLowerCase().includes(s)))
        .map(c => { const p = tzParts(c.tz, now), t = hm(p.hour, p.minute, h24);
          return h('button.clk-row.pick', { onclick: () => { this.cities.push(c.name); store.set('clock.cities', this.cities); sfx.play('pop'); this.closeSheet(); this.renderWorld(); } },
            h('div.clk-rl', {}, h('b', {}, c.name), h('small', {}, c.country)), h('span.clk-rv', {}, t.t + (t.ap ? ' ' + t.ap : ''))); });
      list.replaceChildren(rows.length ? h('div.clk-grp', {}, ...rows) : h('div.clk-empty', {}, 'No results'));
    };
    this.openSheet({ title: 'Choose a City', body });
    fill();
  }

  /* ------------------------------------------------------------- alarms */
  buildAlarm() {
    const edit = h('button.clk-hbtn', { onclick: () => { this.edit.alarm = !this.edit.alarm; sfx.play('tick'); this.renderAlarms(); } }, 'Edit');
    const add = h('button.clk-hbtn.ic', { onclick: () => this.alarmSheet() }, icon('plus', 22));
    const next = h('div.clk-next');
    const list = h('div.clk-alist');
    const p = this.page('clk-alarm', 'Alarms', edit, add, [next, list]);
    p.edit = edit; p.next = next; p.list = list;
    return p;
  }
  renderAlarms() {
    const p = this.pages.alarm;
    p.el.classList.toggle('editing', this.edit.alarm);
    p.edit.textContent = this.edit.alarm ? 'Done' : 'Edit';
    p.edit.style.visibility = this.alarms.length || this.edit.alarm ? '' : 'hidden';
    const sorted = [...this.alarms].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
    p.list.replaceChildren(sorted.length ? h('div.clk-grp', {}, ...sorted.map(a => this.alarmRow(a))) : h('div.clk-empty', {}, 'No Alarms'));
    this.updateNext();
  }
  alarmRow(a) {
    const t = hm(a.h, a.m, this.os.sys.h24);
    const tg = this.toggle(a.on, on => { a.on = on; this.saveAlarms(); row.classList.toggle('off', !on); this.updateNext(); });
    const row = h('div.clk-arow' + (a.on ? '' : '.off'), { onclick: () => this.alarmSheet(a) },
      h('button.clk-minus', { onclick: e => { e.stopPropagation(); this.deleteAlarm(a.id); } }, h('i')),
      h('div.clk-amain', {}, h('div.clk-atime', {}, h('span', {}, t.t), t.ap ? h('small', {}, t.ap) : null),
        h('div.clk-asub', {}, (a.label || 'Alarm') + ', ' + repeatText(a.days))),
      h('div.clk-aright', {}, tg, h('span.clk-chev', {}, icon('chevronR', 14))));
    return row;
  }
  saveAlarms() { store.set('clock.alarms', this.alarms); }
  deleteAlarm(id) { this.alarms = this.alarms.filter(a => a.id !== id); this.saveAlarms(); sfx.play('pop'); this.renderAlarms(); }
  nextAlarm() {
    const now = new Date(); let best = null;
    for (const a of this.alarms) {
      if (!a.on) continue;
      for (let d = 0; d < 8; d++) {
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, a.h, a.m, 0, 0);
        if (t <= now) continue;
        if (a.days.length && !a.days.includes(t.getDay())) continue;
        if (!best || t < best) best = t;
        break;
      }
    }
    return best;
  }
  updateNext() {
    const n = this.nextAlarm(), el = this.pages.alarm.next;
    if (!n) { el.textContent = this.alarms.some(a => a.on) ? '' : 'No alarms are turned on'; return; }
    const mins = Math.max(1, Math.round((n - new Date()) / 60000)), d = Math.floor(mins / 1440), hh = Math.floor(mins / 60) % 24, m = mins % 60;
    el.textContent = 'Next alarm in ' + [d ? d + ' day' + (d > 1 ? 's' : '') : '', hh ? hh + ' hr' : '', !d && m ? m + ' min' : ''].filter(Boolean).join(' ');
  }

  alarmSheet(a) {
    const isNew = !a, h24 = this.os.sys.h24, now = new Date();
    const d = a ? { ...a, days: [...a.days] } : { id: uid(), h: (now.getHours() + 1) % 24, m: 0, label: 'Alarm', days: [], on: true, sound: 'Radar', snooze: true };
    const wH = wheel(h24 ? range(24) : range(12, i => String(i + 1)), { index: h24 ? d.h : (d.h % 12 || 12) - 1, loop: true, width: 96, onChange: () => sync() });
    const wM = wheel(range(60), { index: d.m, loop: true, width: 96, onChange: () => sync() });
    const wA = h24 ? null : wheel(['AM', 'PM'], { index: d.h >= 12 ? 1 : 0, width: 80, onChange: () => sync() });
    const sync = () => {
      const hv = wH.get();
      d.h = h24 ? hv : ((hv + 1) % 12) + (wA && wA.get() === 1 ? 12 : 0);
      d.m = wM.get();
    };
    const wg = h('div.clk-wgrp', {}, h('div.clk-band'), wH.el, h('div.clk-colon', {}, ':'), wM.el, wA ? wA.el : null);

    // repeat (expandable day chips)
    const repVal = h('span.clk-rv', {}, repeatText(d.days));
    const chips = DORD.map(dw => {
      const c = h('button.clk-day' + (d.days.includes(dw) ? '.on' : ''), { onclick: () => {
        d.days = d.days.includes(dw) ? d.days.filter(x => x !== dw) : [...d.days, dw];
        c.classList.toggle('on', d.days.includes(dw)); repVal.textContent = repeatText(d.days); sfx.play('tick');
      } }, DSHORT[dw]);
      return c;
    });
    const repRow = h('div.clk-xrow', {}, h('button.clk-row', { onclick: e => e.currentTarget.parentNode.classList.toggle('open') }, h('span.clk-rl', {}, 'Repeat'), repVal, h('span.clk-chev', {}, icon('chevronR', 14))), h('div.clk-xbody.days', {}, ...chips));
    // label
    const input = h('input.clk-in', { type: 'text', value: d.label, placeholder: 'Alarm', enterkeyhint: 'done', maxlength: 40,
      oninput: e => { d.label = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } } });
    const labRow = h('div.clk-row.static', {}, h('span.clk-rl', {}, 'Label'), input);
    // sound
    const sndVal = h('span.clk-rv', {}, d.sound);
    const sndList = SOUNDS.map(s => { const r = h('button.clk-snd' + (s === d.sound ? '.on' : ''), { onclick: () => {
      d.sound = s; sndVal.textContent = s; sndList.forEach(x => x.classList.toggle('on', x === r)); sfx.play('recv');
    } }, h('span.ck', {}, icon('check', 15)), s); return r; });
    const sndRow = h('div.clk-xrow', {}, h('button.clk-row', { onclick: e => e.currentTarget.parentNode.classList.toggle('open') }, h('span.clk-rl', {}, 'Sound'), sndVal, h('span.clk-chev', {}, icon('chevronR', 14))), h('div.clk-xbody', {}, ...sndList));
    const snzRow = h('div.clk-row.static', {}, h('span.clk-rl', {}, 'Snooze'), this.toggle(d.snooze, v => { d.snooze = v; }));
    const del = isNew ? null : h('div.clk-grp.solo', {}, h('button.clk-row.danger', { onclick: () => { this.closeSheet(); this.deleteAlarm(a.id); } }, 'Delete Alarm'));

    const body = dragScroll(h('div.clk-sh-body', {}, h('div.clk-inner', {}, wg, h('div.clk-grp', {}, repRow, labRow, sndRow, snzRow), del)));
    this.openSheet({ title: isNew ? 'Add Alarm' : 'Edit Alarm', right: 'Save', body, onRight: () => {
      sync(); d.on = true;
      if (isNew) this.alarms.push(d); else Object.assign(a, d);
      this.saveAlarms(); sfx.play('pop'); this.closeSheet(); this.renderAlarms();
    } });
  }

  checkAlarms(now) {
    const hh = now.getHours(), mm = now.getMinutes(), dow = now.getDay();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()} ${hh}:${mm}`;
    for (const a of this.alarms) {
      if (!a.on || a.h !== hh || a.m !== mm || this.fired[a.id] === key) continue;
      if (a.days.length && !a.days.includes(dow)) continue;
      this.fired[a.id] = key; this.fire(a);
    }
    const t = Date.now();
    for (const s of this.snoozes.slice()) {
      if (t >= s.at && !this.ringing) { this.snoozes.splice(this.snoozes.indexOf(s), 1); this.fire(s.a); }
    }
  }
  alarmText(a) { const t = hm(a.h, a.m, this.os.sys.h24); return t.t + (t.ap ? ' ' + t.ap : ''); }
  fire(a) {
    if (this.ringing) return;
    this.ringing = { kind: 'alarm', a, since: Date.now() };
    sfx.ringtone(true);
    const txt = this.alarmText(a);
    this.os.notify({ app: 'clock', title: a.label || 'Alarm', body: txt, sound: 'tick', kind: 'alarm' });
    this.os.setActivity('alarm', {
      priority: 9, height: 150,
      mount: (id, mode) => {
        const bell = h('span.clk-i-bell', {}, icon('bell', mode === 'compact' ? 20 : 30));
        if (mode === 'compact') return h('div.isl-c.clk-i-c', {}, bell, h('b', {}, txt));
        return h('div.clk-i-x', {},
          h('div.clk-i-top', {}, bell, h('div.clk-i-meta', {}, h('b', {}, a.label || 'Alarm'), h('span', {}, txt))),
          h('div.clk-i-btns.isl-ctl', {},
            a.snooze !== false ? h('button.snz', { onclick: e => { e.stopPropagation(); this.snooze(); } }, 'Snooze') : null,
            h('button.stp', { onclick: e => { e.stopPropagation(); this.stopRing(); } }, 'Stop')));
      },
    });
    this.showRing();
  }
  showRing() {
    const r = this.ringing; if (!r) return;
    let ov = this.ringEl;
    if (!ov) { ov = this.ringEl = h('div.clk-ringov'); this.root.append(ov); }
    if (r.kind === 'alarm') {
      ov.replaceChildren(h('div.clk-r-in', {},
        h('div.clk-r-bell', {}, icon('bell', 46)), h('div.clk-r-time', {}, this.alarmText(r.a)), h('div.clk-r-lab', {}, r.a.label || 'Alarm'),
        h('div.clk-r-btns', {}, r.a.snooze !== false ? h('button.clk-r-b.snz', { onclick: () => this.snooze() }, 'Snooze') : null, h('button.clk-r-b.stp', { onclick: () => this.stopRing() }, 'Stop'))));
    } else {
      ov.replaceChildren(h('div.clk-r-in', {},
        h('div.clk-r-bell', {}, timerGlyph()), h('div.clk-r-time', {}, 'Time’s up'), h('div.clk-r-lab', {}, 'Timer'),
        h('div.clk-r-btns', {}, h('button.clk-r-b.stp', { onclick: () => this.stopRing() }, 'Stop'))));
    }
    void ov.offsetWidth; ov.classList.add('on');
  }
  hideRing() { if (this.ringEl) this.ringEl.classList.remove('on'); }
  stopRing() {
    const r = this.ringing; if (!r) return;
    this.ringing = null; sfx.ringtone(false); this.hideRing();
    if (r.kind === 'alarm') {
      this.os.clearActivity('alarm');
      if (!r.a.days.length) { r.a.on = false; this.saveAlarms(); this.renderAlarms(); }
    }
  }
  snooze() {
    const r = this.ringing; if (!r || r.kind !== 'alarm') return;
    this.ringing = null; sfx.ringtone(false); this.hideRing(); this.os.clearActivity('alarm');
    this.snoozes.push({ a: r.a, at: Date.now() + 9 * 60000 });
    const s = this.win.surface; if (s && s.island) s.island.flash(h('div.isl-toast', {}, 'Snoozed · 9 min'), 1600);
  }
  serviceRing() {
    const r = this.ringing, now = Date.now();
    if (r.kind === 'timer') {
      if (now - r.last > 2700) { r.last = now; sfx.play('timer'); }
      if (now - r.since > 45000) this.stopRing();
    } else if (now - r.since > 120000) this.stopRing(); // unanswered alarm gives up after 2 minutes
  }

  /* ------------------------------------------------------------- stopwatch */
  buildStopwatch() {
    this.swDigits = h('div.clk-swd', {}, '00:00.00');
    this.swL = h('button.clk-rb.gray', { onclick: () => this.swLeft() }, h('span', {}, 'Lap'));
    this.swR = h('button.clk-rb.green', { onclick: () => this.swRight() }, h('span', {}, 'Start'));
    this.swList = h('div.clk-laps');
    const list = dragScroll(h('div.clk-scroll.laps', {}, this.swList));
    const el = h('section.clk-page.clk-sw', {}, h('div.clk-swtop', {}, this.swDigits, h('div.clk-rbs', {}, this.swL, this.swR)), list);
    return { el };
  }
  swElapsed() { const s = this.sw; return s.base + (s.running ? performance.now() - s.t0 : 0); }
  swLeft() {
    const s = this.sw; sfx.play('tick');
    if (s.running) { const tot = this.swElapsed(); s.laps.unshift({ n: s.laps.length + 1, time: tot - s.lastTotal }); s.lastTotal = tot; this.renderLaps(); }
    else if (this.swElapsed() > 0) { s.base = 0; s.laps = []; s.lastTotal = 0; this.renderLaps(); }
    this.updateSW(true);
  }
  swRight() {
    const s = this.sw; sfx.play('tick');
    if (s.running) { s.base += performance.now() - s.t0; s.running = false; }
    else { s.t0 = performance.now(); s.running = true; }
    this.updateSW(true); this.kick();
  }
  renderLaps() {
    const s = this.sw, laps = s.laps;
    let best = -1, worst = -1;
    if (laps.length >= 2) {
      best = laps.reduce((b, l, i) => l.time < laps[b].time ? i : b, 0);
      worst = laps.reduce((b, l, i) => l.time > laps[b].time ? i : b, 0);
    }
    this.swCur = h('div.clk-lap.cur', {}, h('span', {}, 'Lap ' + (laps.length + 1)), h('span.t', {}, '00:00.00'));
    this.swList.replaceChildren(...(this.swElapsed() > 0 ? [this.swCur] : []), ...laps.map((l, i) => h('div.clk-lap' + (i === best ? '.best' : i === worst ? '.worst' : ''), {}, h('span', {}, 'Lap ' + l.n), h('span.t', {}, fmtSW(l.time)))));
    this.swCurT = this.swCur.querySelector('.t');
  }
  updateSW(full) {
    const s = this.sw, e = this.swElapsed();
    const str = fmtSW(e);
    if (this.swDigits.textContent !== str) { this.swDigits.textContent = str; this.swDigits.classList.toggle('long', e >= 3600000); }
    if (full) {
      const started = e > 0;
      this.swR.className = 'clk-rb ' + (s.running ? 'red' : 'green'); this.swR.firstChild.textContent = s.running ? 'Stop' : 'Start';
      this.swL.firstChild.textContent = !s.running && started ? 'Reset' : 'Lap';
      this.swL.classList.toggle('dis', !started);
      this.renderLaps();
    }
    if (this.swCurT) { const cur = fmtSW(e - s.lastTotal); if (this.swCurT.textContent !== cur) this.swCurT.textContent = cur; }
  }

  /* ------------------------------------------------------------- timer */
  buildTimer() {
    const tm = this.tm;
    const onc = () => { this.syncTimer(); };
    this.wTH = wheel(range(24, i => String(i)), { unit: 'hours', index: tm.h, loop: true, width: 116, onChange: i => { tm.h = i; onc(); } });
    this.wTM = wheel(range(60, i => String(i)), { unit: 'min', index: tm.m, loop: true, width: 116, onChange: i => { tm.m = i; onc(); } });
    this.wTS = wheel(range(60, i => String(i)), { unit: 'sec', index: tm.s, loop: true, width: 116, onChange: i => { tm.s = i; onc(); } });
    const wg = h('div.clk-wgrp.tm', {}, h('div.clk-band'), this.wTH.el, this.wTM.el, this.wTS.el);
    const chips = h('div.clk-chips', {}, ...[1, 3, 5, 10, 15, 30].map(m => h('button.clk-chip', { onclick: () => {
      sfx.play('tick'); tm.h = 0; tm.m = m; tm.s = 0; this.wTH.set(0); this.wTM.set(m); this.wTS.set(0); this.syncTimer();
    } }, m + ' min')));
    const C = 2 * Math.PI * 138;
    this.tmC = C;
    const ring = h('div.clk-tring', { html: `<svg viewBox="0 0 300 300"><circle class="trk" cx="150" cy="150" r="138"/><circle class="prg" cx="150" cy="150" r="138" transform="rotate(-90 150 150)" stroke-dasharray="${C} ${C}"/></svg>` });
    this.tmPrg = ring.querySelector('.prg');
    this.tmDigits = h('div.clk-rd', {}, '0:00'); this.tmEnd = h('div.clk-re');
    ring.append(h('div.clk-rc', {}, this.tmDigits, this.tmEnd));
    this.tmL = h('button.clk-rb.gray', { onclick: () => this.cancelTimer() }, h('span', {}, 'Cancel'));
    this.tmR = h('button.clk-rb.green', { onclick: () => this.timerRight() }, h('span', {}, 'Start'));
    const inner = h('div.clk-inner.tmi', {}, h('div.clk-tidle', {}, wg, chips), h('div.clk-trun', {}, ring), h('div.clk-rbs', {}, this.tmL, this.tmR));
    const el = h('section.clk-page.clk-tm', {}, dragScroll(h('div.clk-scroll', {}, inner)));
    return { el };
  }
  timerLeft() { const tm = this.tm; return tm.state === 'running' ? Math.max(0, tm.endAt - Date.now()) : tm.left; }
  syncTimer() {
    const tm = this.tm, idle = tm.state === 'idle', pg = this.pages.timer.el;
    pg.classList.toggle('running', !idle);
    this.tmR.className = 'clk-rb ' + (idle ? 'green' : tm.state === 'running' ? 'orange' : 'green');
    this.tmR.firstChild.textContent = idle ? 'Start' : tm.state === 'running' ? 'Pause' : 'Resume';
    this.tmR.classList.toggle('dis', idle && !(tm.h || tm.m || tm.s));
    this.tmL.classList.toggle('dis', idle);
    if (!idle) this.updateTimerText();
  }
  updateTimerText() {
    const tm = this.tm; if (tm.state === 'idle') return;
    const left = this.timerLeft(), s = fmtLeft(left);
    if (this.tmDigits.textContent !== s) this.tmDigits.textContent = s;
    this.tmDigits.classList.toggle('long', s.length > 5);
    const end = tm.state === 'running' ? new Date(tm.endAt) : null;
    const t = end ? hm(end.getHours(), end.getMinutes(), this.os.sys.h24) : null;
    const txt = t ? '⏰ ' + t.t + (t.ap ? ' ' + t.ap : '') : 'Paused';
    if (this.tmEnd.textContent !== txt) this.tmEnd.textContent = txt;
  }
  updateTimerRing() {
    const tm = this.tm; if (tm.state === 'idle' || !tm.total) return;
    const frac = clamp(this.timerLeft() / tm.total, 0, 1);
    this.tmPrg.setAttribute('stroke-dasharray', `${(frac * this.tmC).toFixed(2)} ${this.tmC.toFixed(2)}`);
    this.updateTimerText();
  }
  timerRight() {
    const tm = this.tm; sfx.play('tick');
    if (tm.state === 'idle') {
      tm.total = (tm.h * 3600 + tm.m * 60 + tm.s) * 1000; if (!tm.total) return;
      tm.left = tm.total; tm.endAt = Date.now() + tm.left; tm.state = 'running';
      this.timerActivity();
    } else if (tm.state === 'running') { tm.left = Math.max(0, tm.endAt - Date.now()); tm.state = 'paused'; }
    else { tm.endAt = Date.now() + tm.left; tm.state = 'running'; }
    this.syncTimer(); this.updateTimerRing(); this.kick();
  }
  cancelTimer() {
    const tm = this.tm; if (tm.state === 'idle') return;
    sfx.play('tick'); tm.state = 'idle'; this.os.clearActivity('timer'); this.syncTimer();
  }
  finishTimer() {
    const tm = this.tm; tm.state = 'idle';
    this.os.clearActivity('timer');
    sfx.play('timer');
    this.os.notify({ app: 'clock', title: 'Timer', body: 'Time’s up', sound: 'tick', kind: 'timer' });
    if (!this.ringing) { this.ringing = { kind: 'timer', since: Date.now(), last: Date.now() }; this.showRing(); }
    this.syncTimer();
  }
  timerActivity() {
    const glyph = size => { const s = timerGlyph(); s.style.fontSize = size + 'px'; s.classList.add('clk-i-tg'); return s; };
    this.os.setActivity('timer', {
      priority: 6, height: 150,
      mount: (id, mode) => {
        const txt = fmtLeft(this.timerLeft());
        if (mode === 'compact') {
          const t = h('b.clk-i-t', {}, txt); t.classList.toggle('long', txt.length > 5);
          return Object.assign(h('div.isl-c.clk-i-c.tm', {}, glyph(20), t), { _t: t });
        }
        const t = h('div.clk-i-big', {}, txt), bar = h('i'), pb = h('button.snz', { onclick: e => { e.stopPropagation(); this.timerRight(); } }, this.tm.state === 'running' ? 'Pause' : 'Resume');
        const el = h('div.clk-i-x', {},
          h('div.clk-i-top', {}, glyph(30), h('div.clk-i-meta', {}, h('b', {}, 'Timer'), h('span', {}, 'Ends ' + (this.tmEnd.textContent || ''))), t),
          h('div.clk-i-bar', {}, bar),
          h('div.clk-i-btns.isl-ctl', {}, pb, h('button.stp', { onclick: e => { e.stopPropagation(); this.cancelTimer(); } }, 'Cancel')));
        return Object.assign(el, { _t: t, _bar: bar, _pb: pb });
      },
      update: node => {
        const left = this.timerLeft(), txt = fmtLeft(left);
        if (node._t) { node._t.textContent = txt; node._t.classList.toggle('long', txt.length > 5); }
        if (node._bar && this.tm.total) node._bar.style.width = (left / this.tm.total * 100) + '%';
        if (node._pb) node._pb.textContent = this.tm.state === 'running' ? 'Pause' : 'Resume';
      },
    });
  }

  /* ------------------------------------------------------------- loops */
  needsFrame() { return (this.tab === 'stopwatch' && this.sw.running) || (this.tab === 'timer' && this.tm.state === 'running'); }
  kick() { if (!this.raf && this.vis && this.needsFrame()) this.raf = requestAnimationFrame(this.frame); }
  frame() {
    this.raf = 0;
    if (!this.vis || !this.needsFrame()) return;
    if (this.tab === 'stopwatch') this.updateSW(false); else this.updateTimerRing();
    this.raf = requestAnimationFrame(this.frame);
  }
  tick() {
    const now = new Date();
    this.vis = this.isVisible();
    const sec = now.getSeconds(), changed = sec !== this.lastSec;
    this.lastSec = sec;
    if (changed) this.checkAlarms(now);
    if (this.tm.state === 'running' && Date.now() >= this.tm.endAt) this.finishTimer();
    if (this.ringing) this.serviceRing();
    if (this.vis && changed) {
      if (this.tab === 'world') this.updateWorld();
      else if (this.tab === 'alarm' && sec < 1) this.updateNext();
      else if (this.tab === 'timer') this.updateTimerText();
    }
    this.kick();
  }
}
