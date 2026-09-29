// Weather: immersive animated sky, hourly strip, 10-day forecast, detail tiles, city list.
import { App } from './app.js';
import { h, icon, svg, store, pad, clamp, rand, DAYS } from '../util.js';
import { dragScroll, dragGesture } from '../scroll.js';
import { WEATHER, refreshWeather, wxKind } from '../data.js';
import { wxIcon } from '../widgets.js';
import { sfx } from '../audio.js';

/* ------------------------------------------------------------------ cities (all derived from WEATHER with offsets) */
const CITIES = [
  { id: 'waw', name: 'Warsaw', tz: 'Europe/Warsaw', lat: 52.23, lon: 21.01, dt: 0, main: true },
  { id: 'lon', name: 'London', tz: 'Europe/London', lat: 51.51, lon: -0.13, dt: -2, code: 61, hum: 16, wind: 6, p: -7 },
  { id: 'nyc', name: 'New York', tz: 'America/New_York', lat: 40.71, lon: -74.0, dt: 3, code: 2, hum: 2, wind: 2, p: 3 },
  { id: 'sfo', name: 'San Francisco', tz: 'America/Los_Angeles', lat: 37.77, lon: -122.42, dt: -1, code: 3, hum: 12, wind: 8, p: 4 },
  { id: 'tok', name: 'Tokyo', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.69, dt: 4, code: 0, hum: 4, wind: -3, p: 2 },
  { id: 'syd', name: 'Sydney', tz: 'Australia/Sydney', lat: -33.87, lon: 151.21, dt: -2, code: 1, hum: -6, wind: 9, p: 5 },
  { id: 'dxb', name: 'Dubai', tz: 'Asia/Dubai', lat: 25.2, lon: 55.27, dt: 17, code: 0, hum: -22, wind: -2, p: -6, vis: -6 },
  { id: 'sin', name: 'Singapore', tz: 'Asia/Singapore', lat: 1.35, lon: 103.82, dt: 12, code: 95, hum: 30, wind: -4, p: -8 },
  { id: 'rey', name: 'Reykjavik', tz: 'Atlantic/Reykjavik', lat: 64.15, lon: -21.94, dt: -11, code: 71, hum: 12, wind: 14, p: -18 },
];
const KIND_NAME = { sun: 'Clear', partly: 'Partly Cloudy', cloud: 'Cloudy', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorm', fog: 'Fog' };
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/* ------------------------------------------------------------------ sky palettes: [top, middle, bottom] */
const SKY = {
  day: { sun: ['#1a6ad4', '#4c9ae8', '#8dc6f6'], partly: ['#3c76c4', '#6b9fd6', '#a4c5e2'], cloud: ['#5b6d85', '#7b8da3', '#a0aebe'], rain: ['#38445a', '#566579', '#7a8898'], snow: ['#6b7f99', '#97abc1', '#c6d2df'], storm: ['#1c2029', '#38404e', '#59606e'], fog: ['#7d8892', '#9fa8b1', '#c1c8ce'] },
  dusk: { sun: ['#2a3c86', '#b0587e', '#f5a05d'], partly: ['#33447f', '#9c6a86', '#eaaa7c'], cloud: ['#3e4762', '#7c6a80', '#c29080'], rain: ['#30384b', '#5b566a', '#8b7580'], snow: ['#4a5a7c', '#8a86a3', '#d4b3a7'], storm: ['#1a1c27', '#3a3547', '#5e4f57'], fog: ['#5b5f6f', '#8d8590', '#b8a49f'] },
  night: { sun: ['#040a22', '#0e1c48', '#21357a'], partly: ['#0a1230', '#18285a', '#2d4079'], cloud: ['#151b2a', '#242c41', '#39435a'], rain: ['#0e131c', '#1b2330', '#2b3544'], snow: ['#19233a', '#2a3856', '#45577a'], storm: ['#090b10', '#151921', '#252a35'], fog: ['#19202a', '#2a323e', '#404a57'] },
};
const CLOUD_RGB = {
  day: { sun: '255,255,255', partly: '255,255,255', cloud: '232,238,246', rain: '128,140,158', snow: '228,235,244', storm: '80,86,100', fog: '214,220,226' },
  dusk: { sun: '255,208,180', partly: '255,205,175', cloud: '214,190,190', rain: '150,140,155', snow: '232,214,214', storm: '96,88,104', fog: '200,180,178' },
  night: { sun: '110,125,170', partly: '110,125,170', cloud: '86,98,130', rain: '52,62,82', snow: '110,124,158', storm: '40,46,62', fog: '96,108,124' },
};
const skyCss = (kind, phase) => { const [a, b, c] = SKY[phase][kind] || SKY.day.cloud; return `linear-gradient(180deg, ${a} 0%, ${b} 52%, ${c} 100%)`; };

/* ------------------------------------------------------------------ time zone + sun maths */
const fmtCache = {};
function tzNow(tz) {
  try {
    let f = fmtCache[tz];
    if (!f) f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const o = {};
    for (const p of f.formatToParts(new Date())) if (p.type !== 'literal') o[p.type] = +p.value;
    if (o.hour === 24) o.hour = 0;
    return o;
  } catch { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() }; }
}
const offMin = o => Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second) - Math.floor(Date.now() / 1000) * 1000) / 60000);
function sunTimes(c, o) {
  const rad = Math.PI / 180;
  const N = Math.round((Date.UTC(o.year, o.month - 1, o.day) - Date.UTC(o.year, 0, 0)) / 864e5);
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365) * rad;
  const cs = -Math.tan(c.lat * rad) * Math.tan(decl);
  const half = Math.acos(clamp(cs, -1, 1)) / rad / 15;
  const B = 2 * Math.PI * (N - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const noon = 12 - c.lon / 15 + offMin(o) / 60 - eot / 60;
  return { rise: noon - half, set: noon + half, polar: cs > 1 ? 'night' : cs < -1 ? 'day' : null };
}
function phaseOf(hf, s) {
  if (s.polar) return s.polar;
  if (hf >= s.rise + .7 && hf < s.set - .7) return 'day';
  if ((hf >= s.rise - .5 && hf < s.rise + .7) || (hf >= s.set - .7 && hf < s.set + .5)) return 'dusk';
  return 'night';
}
const nightAt = (hf, s) => s.polar ? s.polar === 'night' : (hf < s.rise || hf >= s.set);
const tempColor = t => `hsl(${(200 - clamp((t + 5) / 35, 0, 1) * 175).toFixed(0)} 85% 58%)`;
const hash = s => { let a = 7; for (const ch of s) a = (a * 31 + ch.charCodeAt(0)) | 0; return Math.abs(a); };

/* ------------------------------------------------------------------ canvas effects */
class Fx {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.w = 0; this.h = 0; this.scene = null; this.sprites = {}; this.t = 0; this.clouds = []; this.stars = []; this.drops = []; this.flakes = []; this.flash = 0; this.nextFlash = 5; }
  resize(w, hh) { if (w === this.w && hh === this.h) return; this.w = w; this.h = hh; this.c.width = w; this.c.height = hh; this.build(); }
  set(scene) { this.scene = scene; this.build(); }
  sprite(rgb) {
    if (this.sprites[rgb]) return this.sprites[rgb];
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 170;
    const g = cv.getContext('2d');
    for (const [x, y, r] of [[70, 112, 56], [128, 84, 68], [195, 72, 78], [255, 92, 68], [306, 116, 50], [180, 116, 78], [112, 124, 54], [252, 124, 54]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},.85)`); gr.addColorStop(.6, `rgba(${rgb},.34)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }
    return (this.sprites[rgb] = cv);
  }
  build() {
    const { w, h: hh } = this, s = this.scene; if (!w || !hh || !s) return;
    const k = w / 440, kind = s.kind, night = s.phase === 'night', area = clamp(w * hh / (440 * 700), .5, 2.2);
    const count = { sun: 0, partly: 5, cloud: 8, rain: 8, snow: 6, storm: 9, fog: 6 }[kind] || 0;
    const rgb = (CLOUD_RGB[s.phase] || CLOUD_RGB.day)[kind];
    const light = kind === 'partly' || kind === 'sun';
    this.clouds = Array.from({ length: count }, () => ({
      x: rand(-.3, 1.1) * w, y: (kind === 'fog' ? rand(.3, .85) : rand(0, .42)) * hh, s: (kind === 'fog' ? rand(1.6, 2.6) : rand(.7, 1.45)) * k,
      v: rand(5, 16) * k * (kind === 'fog' ? .6 : 1), a: kind === 'fog' ? rand(.22, .4) : light ? rand(.45, .75) : rand(.5, .85), sp: this.sprite(rgb),
    }));
    this.stars = night && light ? Array.from({ length: 70 }, () => ({ x: rand(0, w), y: rand(0, hh * .6), r: rand(.6, 1.7), f: rand(.6, 2.2), p: rand(0, 6.28) })) : [];
    const nd = kind === 'storm' ? 150 : kind === 'rain' ? 110 : 0;
    this.drops = Array.from({ length: Math.round(nd * area) }, () => ({ x: rand(0, w + hh * .22), y: rand(0, hh), l: rand(10, 22) * Math.max(.8, k), v: rand(650, 950) * (hh / 700) }));
    this.flakes = kind === 'snow' ? Array.from({ length: Math.round(90 * area) }, () => ({ x: rand(0, w), y: rand(0, hh), r: rand(1, 3.2), v: rand(30, 70), f: rand(.6, 1.6), p: rand(0, 6.28) })) : [];
    this.flash = 0; this.nextFlash = rand(2, 6);
  }
  step(dt) {
    const { g, w, h: hh } = this, s = this.scene; if (!w || !s) return;
    this.t += dt; g.clearRect(0, 0, w, hh);
    const kind = s.kind, night = s.phase === 'night';
    g.fillStyle = '#fff';
    for (const st of this.stars) { g.globalAlpha = .25 + .75 * Math.abs(Math.sin(this.t * st.f + st.p)); g.fillRect(st.x, st.y, st.r, st.r); }
    g.globalAlpha = 1;
    if (kind === 'sun' || kind === 'partly') {
      const cx = w * (.8 + Math.sin(this.t * .05) * .02), cy = hh * .1, r = Math.max(w, hh) * .55;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      if (night) { gr.addColorStop(0, 'rgba(190,205,255,.28)'); gr.addColorStop(1, 'rgba(190,205,255,0)'); }
      else if (s.phase === 'dusk') { gr.addColorStop(0, 'rgba(255,170,90,.5)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); }
      else { gr.addColorStop(0, 'rgba(255,246,205,.6)'); gr.addColorStop(.35, 'rgba(255,240,190,.2)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      if (night) { g.fillStyle = 'rgba(244,247,255,.92)'; g.beginPath(); g.arc(w * .76, hh * .13, 15, 0, 6.2832); g.fill(); }
    }
    for (const c of this.clouds) {
      c.x += c.v * dt;
      const cw = 360 * c.s;
      if (c.x > w + 10) c.x = -cw;
      g.globalAlpha = c.a; g.drawImage(c.sp, c.x, c.y, cw, 170 * c.s);
    }
    g.globalAlpha = 1;
    if (this.drops.length) {
      g.strokeStyle = night ? 'rgba(170,190,225,.42)' : 'rgba(215,228,250,.5)'; g.lineWidth = 1.1; g.beginPath();
      for (const d of this.drops) {
        d.y += d.v * dt; d.x -= d.v * dt * .22;
        if (d.y > hh) { d.y = -d.l; d.x = rand(0, w + hh * .22); }
        g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * .22, d.y - d.l);
      }
      g.stroke();
    }
    if (this.flakes.length) {
      g.fillStyle = 'rgba(255,255,255,.86)'; g.beginPath();
      for (const f of this.flakes) {
        f.y += f.v * dt; f.x += Math.sin(this.t * f.f + f.p) * 14 * dt;
        if (f.y > hh + 4) { f.y = -4; f.x = rand(0, w); }
        g.moveTo(f.x + f.r, f.y); g.arc(f.x, f.y, f.r, 0, 6.2832);
      }
      g.fill();
    }
    if (kind === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) { this.flash = 1; this.nextFlash = rand(4, 9); this.dbl = Math.random() < .5; }
      if (this.flash > 0) {
        g.fillStyle = `rgba(230,236,255,${(this.flash * .5).toFixed(3)})`; g.fillRect(0, 0, w, hh);
        this.flash -= dt * 3.2;
        if (this.flash <= 0 && this.dbl) { this.dbl = false; this.flash = .7; }
      }
    }
  }
}

/* ------------------------------------------------------------------ small glyphs */
const G = {
  drop: '<path d="M12 3c3.500 4.500 6 7.500 6 11a6 6 0 0 1-12 0c0-3.500 2.500-6.500 6-11Z"/>',
  wind: '<path d="M3 9h10a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  thermo: '<path d="M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0V4Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m12 17 4-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const gl = (k, s = 13) => { const e = svg(G[k]); e.style.width = e.style.height = s + 'px'; return e; };
const dayLabel = (i, d) => i === 0 ? 'Today' : DAYS[d].slice(0, 3);

/* ================================================================== app */
export default class Weather extends App {
  constructor(os, win) {
    super(os, win);
    const id = store.get('weather.city', 'waw');
    this.cityId = CITIES.some(c => c.id === id) ? id : 'waw';
    this.vis = false; this.raf = 0; this.last = 0; this.lastFetch = 0; this.lastRender = 0; this.z = 1; this.dead = false;
    this.frame = this.frame.bind(this);
  }
  statusTone() { return 'light'; }

  /* ------------------------------------------------------------- data */
  base(c) {
    const W = WEATHER, o = tzNow(c.tz), hf = o.hour + o.minute / 60, sun = sunTimes(c, o);
    const code = c.main ? W.code : c.code, kind = wxKind(code), phase = phaseOf(hf, sun);
    return { c, o, hf, sun, code, kind, phase, temp: W.temp + c.dt, hi: W.hi + c.dt, lo: W.lo + c.dt, cond: c.main ? W.cond : KIND_NAME[kind], sky: skyCss(kind, phase), timeStr: this.fmtHM(o.hour, o.minute) };
  }
  fmtHM(hh, mm) { return this.os.sys.h24 ? pad(hh) + ':' + pad(mm) : (hh % 12 || 12) + ':' + pad(mm) + ' ' + (hh < 12 ? 'AM' : 'PM'); }
  fmtF(hf) { const m = Math.round(hf * 60); return this.fmtHM(((Math.floor(m / 60) % 24) + 24) % 24, ((m % 60) + 60) % 60); }
  hourLabel(hh) { return this.os.sys.h24 ? pad(hh) : (hh % 12 || 12) + (hh < 12 ? ' AM' : ' PM'); }
  full(c) {
    const W = WEATHER, b = this.base(c), idx = CITIES.indexOf(c);
    const src = W.hourly && W.hourly.length ? W.hourly : Array.from({ length: 24 }, (_, i) => ({ h: i, t: W.temp, code: W.code }));
    b.hourly = src.slice(0, 24).map((x, i) => ({ hour: (b.o.hour + i) % 24, t: x.t + c.dt, code: c.main ? x.code : (i % 8 === 5 && c.code < 51 ? 3 : c.code) }));
    b.hourly[0].t = b.temp;
    const dn = W.daily && W.daily.length ? W.daily : [{ d: new Date().getDay(), hi: W.hi, lo: W.lo, code: W.code }];
    b.daily = dn.slice(0, 10).map((x, i) => ({ d: x.d, hi: x.hi + c.dt, lo: x.lo + c.dt, code: c.main || i < 2 ? (c.main ? x.code : c.code) : dn[(i + idx * 3) % dn.length].code }));
    b.feels = W.feels + c.dt;
    b.uv = nightAt(b.hf, b.sun) ? 0 : clamp(Math.round(W.uv * (1.5 - Math.abs(c.lat) / 60)), 0, 11);
    b.wind = clamp(W.wind + (c.wind || 0), 2, 90); b.gust = Math.round(b.wind * 1.6); b.dir = (hash(c.id) * 37 + 230) % 360;
    b.hum = clamp(W.humidity + (c.hum || 0), 15, 98); b.dew = Math.round(b.temp - (100 - b.hum) / 5);
    b.vis = b.kind === 'fog' ? 1.8 : b.kind === 'rain' || b.kind === 'snow' ? 7 : b.kind === 'storm' ? 5 : clamp(W.vis + (c.vis || 0), 4, 40);
    b.pressure = W.pressure + (c.p || 0);
    b.precip = { rain: 3.2, storm: 9, snow: 4 }[b.kind] || 0;
    return b;
  }

  /* ------------------------------------------------------------- build */
  build() {
    this.skyA = h('div.wx-sky'); this.skyB = h('div.wx-sky'); this.skyFront = null;
    this.canvas = h('canvas.wx-fx'); this.fx = new Fx(this.canvas);
    this.heroLoc = h('div.wx-loc'); this.heroCity = h('div.wx-city'); this.heroTemp = h('div.wx-temp'); this.heroCond = h('div.wx-cond'); this.heroHL = h('div.wx-hl');
    this.hero = h('div.wx-hero', {}, this.heroLoc, this.heroCity, this.heroTemp, this.heroCond, this.heroHL);
    dragGesture(this.hero, { onStart: ({ dx, dy }) => Math.abs(dx) > Math.abs(dy) * 1.2, onEnd: ({ dx, dy }) => { if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1); } });
    this.cards = h('div.wx-cards');
    this.scroll = dragScroll(h('div.wx-scroll', {}, h('div.wx-content', {}, this.hero, this.cards)));
    this.scroll.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.miniCity = h('b'); this.miniSub = h('span');
    this.mini = h('div.wx-mini', {}, this.miniCity, this.miniSub);
    this.dots = h('div.wx-dots');
    this.bottom = h('div.wx-bottom', {}, this.dots, h('button.wx-listbtn', { onclick: () => this.openList() }, icon('list', 21)));
    this.buildList();
    const root = h('div.wx', {}, h('div.wx-skies', {}, this.skyA, this.skyB), this.canvas, this.scroll, this.mini, this.bottom, this.listEl);
    this.root = root;
    this.ro = new ResizeObserver(es => { const r = es[0].contentRect; if (r.width > 0 && r.height > 0) this.fx.resize(Math.round(r.width), Math.round(r.height)); });
    this.ro.observe(root);
    this.render(true);
    this.timerId = setInterval(() => this.tick(), 1000);
    return root;
  }
  onOpen() {
    this.check();
    if (Date.now() - this.lastRender > 60000) this.render(false);
    if (Date.now() - this.lastFetch > 300000) {
      this.lastFetch = Date.now();
      refreshWeather().then(ok => { if (ok && !this.dead) this.render(false); }).catch(() => { });
    }
  }
  onAttach() { this.check(); }
  destroy() { this.dead = true; clearInterval(this.timerId); cancelAnimationFrame(this.raf); this.raf = 0; if (this.ro) this.ro.disconnect(); }

  /* ------------------------------------------------------------- visibility-gated animation loop */
  check() {
    const v = this.root.isConnected && getComputedStyle(this.win.el).visibility !== 'hidden';
    if (v !== this.vis) { this.vis = v; if (v) { this.last = performance.now(); this.start(); } }
    else if (v) this.start();
  }
  start() { if (!this.raf && this.vis && !this.dead) this.raf = requestAnimationFrame(this.frame); }
  frame(ts) {
    this.raf = 0;
    if (!this.vis || this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = ts - this.last;
    if (dt < 32) return; // ~30 fps is plenty for slow weather
    this.last = ts;
    this.fx.step(Math.min(dt, 100) / 1000);
  }
  tick() {
    this.check();
    const d = this.cur; if (!d) return;
    const b = this.base(d.c);
    if (b.phase !== d.phase || b.kind !== d.kind) this.render(false);
  }

  /* ------------------------------------------------------------- selection */
  select(id, dir) {
    if (id === this.cityId) return;
    this.cityId = id; store.set('weather.city', id);
    this.render(true);
    if (this.hero.animate) this.hero.animate([{ opacity: 0, transform: `translateX(${(dir || 1) * 30}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.25,1)' });
  }
  step(dir) { const i = CITIES.findIndex(c => c.id === this.cityId); this.select(CITIES[(i + dir + CITIES.length) % CITIES.length].id, dir); sfx.play('tick'); }
  setSky(css) {
    const nx = this.skyFront === this.skyA ? this.skyB : this.skyA;
    nx.style.background = css;
    if (!this.skyFront) { nx.style.opacity = 1; this.skyFront = nx; return; }
    nx.style.transition = 'none'; nx.style.opacity = 0; nx.style.zIndex = ++this.z; void nx.offsetWidth;
    nx.style.transition = ''; nx.style.opacity = 1; this.skyFront = nx;
  }
  onScroll() {
    const st = this.scroll.scrollTop;
    this.hero.style.opacity = String(1 - clamp(st / 150, 0, 1));
    this.mini.style.opacity = String(clamp((st - 110) / 50, 0, 1));
  }

  /* ------------------------------------------------------------- render */
  render(reset) {
    const c = CITIES.find(x => x.id === this.cityId) || CITIES[0], d = this.full(c);
    this.cur = d; this.lastRender = Date.now();
    this.heroLoc.textContent = c.main ? 'MY LOCATION' : ''; this.heroLoc.style.display = c.main ? '' : 'none';
    this.heroCity.textContent = c.name; this.heroTemp.textContent = d.temp + '°'; this.heroCond.textContent = d.cond; this.heroHL.textContent = `H:${d.hi}°  L:${d.lo}°`;
    this.miniCity.textContent = c.name; this.miniSub.textContent = `${d.temp}° | ${d.cond}`;
    this.dots.replaceChildren(...CITIES.map(x => h('button.wx-dot' + (x.id === c.id ? '.on' : ''), { onclick: () => this.select(x.id, CITIES.indexOf(x) > CITIES.indexOf(c) ? 1 : -1) })));
    this.setSky(d.sky);
    const sc = this.fx.scene;
    if (!sc || sc.kind !== d.kind || sc.phase !== d.phase) this.fx.set({ kind: d.kind, phase: d.phase });
    this.cards.replaceChildren(...this.buildCards(d));
    if (reset) this.scroll.scrollTop = 0;
    this.onScroll();
    if (this.listEl.classList.contains('on')) this.renderList();
  }

  card(cls, head, ...kids) { return h('section.wx-card' + cls, {}, head, ...kids); }
  head(ic, text) { return h('div.wx-ch', {}, ic, h('span', {}, text)); }
  tile(cls, ic, label, value, sub, extra) {
    return this.card('.wx-tile' + cls, this.head(ic, label), h('div.wx-val', {}, value), extra || null, sub ? h('div.wx-sub', {}, sub) : null);
  }
  buildCards(d) {
    // ---- hourly
    const items = d.hourly.map((x, i) => h('div.wx-h', {}, h('span', {}, i === 0 ? 'Now' : this.hourLabel(x.hour)), wxIcon(wxKind(x.code), 28, nightAt(x.hour + (i === 0 ? d.o.minute / 60 : 0), d.sun)), h('b', {}, x.t + '°')));
    const strip = dragScroll(h('div.wx-hours', {}, h('div.wx-hrs', {}, ...items)), { axis: 'x' });
    const change = d.hourly.findIndex((x, i) => i > 0 && wxKind(x.code) !== d.kind);
    const summary = change > 0 ? `${KIND_NAME[wxKind(d.hourly[change].code)]} expected from ${this.hourLabel(d.hourly[change].hour)}.` : `${d.cond} conditions expected for the next 24 hours.`;
    const hourly = this.card('.wx-hourly', this.head(icon('clockic', 13), 'HOURLY FORECAST'), h('div.wx-summary', {}, summary + ` Wind up to ${d.gust} km/h.`), strip);

    // ---- 10 day
    const mn = Math.min(...d.daily.map(x => x.lo)), mx = Math.max(...d.daily.map(x => x.hi)), span = Math.max(1, mx - mn);
    const rows = d.daily.map((x, i) => {
      const l = (x.lo - mn) / span * 100, w = Math.max(9, (x.hi - x.lo) / span * 100);
      const bar = h('div.wx-bar', {}, h('i', { style: { left: Math.min(l, 100 - w) + '%', width: w + '%', background: `linear-gradient(90deg, ${tempColor(x.lo)}, ${tempColor(x.hi)})` } }));
      if (i === 0) bar.append(h('u', { style: { left: clamp((d.temp - mn) / span * 100, 2, 98) + '%' } }));
      return h('div.wx-drow', {}, h('span.wx-dn', {}, dayLabel(i, x.d)), wxIcon(wxKind(x.code), 26, false), h('span.wx-lo', {}, x.lo + '°'), bar, h('span.wx-hi', {}, x.hi + '°'));
    });
    const daily = this.card('.wx-daily', this.head(icon('list', 13), `${d.daily.length}-DAY FORECAST`), ...rows);

    // ---- tiles
    const uvLvl = d.uv <= 2 ? 'Low' : d.uv <= 5 ? 'Moderate' : d.uv <= 7 ? 'High' : d.uv <= 10 ? 'Very High' : 'Extreme';
    const uv = this.tile('', icon('sun', 13), 'UV INDEX', h('span', {}, String(d.uv)), uvLvl === 'Low' ? 'Low for the rest of the day.' : `${uvLvl} for the rest of the day.`,
      h('div.wx-uv', {}, h('i', { style: { left: clamp(d.uv / 11 * 100, 3, 97) + '%' } })));
    uv.querySelector('.wx-val').append(h('small', {}, uvLvl));

    const compass = svg(`<circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/><text x="30" y="11" text-anchor="middle" font-size="7" font-weight="700" fill="#fff">N</text><g transform="translate(30 30) rotate(${d.dir})"><path d="M0 -17 L5 7 L0 3 L-5 7Z" fill="#fff"/></g>`, '0 0 60 60');
    compass.className = 'svgi wx-compass';
    const wind = this.tile('', gl('wind'), 'WIND', h('span', {}, String(d.wind), h('small', {}, ' km/h')), `Gusts up to ${d.gust} km/h · ${CARD[Math.round(d.dir / 22.5) % 16]}`, compass);

    const nextRise = d.hf < d.sun.rise || d.hf >= d.sun.set, arcT = clamp((d.hf - d.sun.rise) / Math.max(.1, d.sun.set - d.sun.rise), -.06, 1.06);
    const ax = 80 - 70 * Math.cos(Math.PI * arcT), ay = 66 - 62 * Math.sin(Math.PI * clamp(arcT, 0, 1));
    const arc = svg(`<path d="M10 66 A70 62 0 0 1 150 66" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/><line x1="0" y1="66" x2="160" y2="66" stroke="rgba(255,255,255,.4)" stroke-width="1"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="7" fill="${nextRise ? '#cfd8ff' : '#ffd60a'}" opacity="${nextRise ? .7 : 1}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="12" fill="${nextRise ? '#cfd8ff' : '#ffd60a'}" opacity=".18"/>`, '0 0 160 72');
    arc.className = 'svgi wx-arc';
    const sunT = this.tile('', icon('sun', 13), nextRise ? 'SUNRISE' : 'SUNSET', h('span', {}, this.fmtF(nextRise ? d.sun.rise : d.sun.set)), (nextRise ? 'Sunset: ' + this.fmtF(d.sun.set) : 'Sunrise: ' + this.fmtF(d.sun.rise)), arc);

    const hum = this.tile('', gl('drop'), 'HUMIDITY', h('span', {}, d.hum + '%'), `The dew point is ${d.dew}° right now.`);
    const diff = d.feels - d.temp;
    const feels = this.tile('', gl('thermo'), 'FEELS LIKE', h('span', {}, d.feels + '°'), diff <= -2 ? 'Wind is making it feel colder.' : diff >= 2 ? 'Humidity is making it feel warmer.' : 'Similar to the actual temperature.');
    const vis = this.tile('', gl('eye'), 'VISIBILITY', h('span', {}, Math.round(d.vis * 10) / 10 + '', h('small', {}, ' km')), d.vis >= 10 ? 'It’s perfectly clear right now.' : d.vis >= 5 ? 'Slightly hazy right now.' : 'Visibility is reduced right now.');
    const pt = clamp((d.pressure - 980) / 60, 0, 1), pa = Math.PI * (1 - pt);
    const gauge = svg(`<path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="6" stroke-linecap="round"/><line x1="50" y1="50" x2="${(50 + Math.cos(pa) * 32).toFixed(1)}" y2="${(50 - Math.sin(pa) * 32).toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="#fff"/>`, '0 0 100 56');
    gauge.className = 'svgi wx-gauge';
    const pres = this.tile('', gl('gauge'), 'PRESSURE', h('span', {}, String(d.pressure), h('small', {}, ' hPa')), d.pressure >= 1020 ? 'High and steady.' : d.pressure < 1005 ? 'Low, likely unsettled.' : 'Steady.', gauge);
    const prec = this.tile('', gl('drop'), 'PRECIPITATION', h('span', {}, d.precip + '', h('small', {}, ' mm')), d.precip ? `About ${d.precip} mm expected in the next 24 h.` : 'None expected in the next 24 h.');
    return [hourly, daily, uv, wind, sunT, hum, feels, vis, pres, prec];
  }

  /* ------------------------------------------------------------- city list */
  buildList() {
    this.q = h('input.wx-q', { type: 'text', placeholder: 'Search for a city', enterkeyhint: 'search', oninput: () => this.renderList() });
    this.listGrid = h('div.wx-lgrid');
    const body = dragScroll(h('div.wx-lscroll', {}, h('div.wx-lin', {}, this.listGrid)));
    this.listEl = h('div.wx-list', {},
      h('div.wx-lhead', {}, h('h1', {}, 'Weather'), h('button.wx-lclose', { onclick: () => this.closeList() }, icon('xmark', 18))),
      h('div.wx-search', {}, icon('search', 15), this.q), body);
  }
  renderList() {
    const q = this.q.value.trim().toLowerCase();
    const rows = CITIES.filter(c => !q || c.name.toLowerCase().includes(q)).map(c => {
      const d = this.base(c);
      return h('button.wx-lc' + (c.id === this.cityId ? '.sel' : ''), { style: { background: d.sky }, onclick: () => { this.select(c.id, 1); this.closeList(); } },
        h('div.wx-lc-l', {}, h('b', {}, c.name), h('span', {}, c.main ? 'My Location · ' + d.timeStr : d.timeStr), h('span.c', {}, d.cond)),
        h('div.wx-lc-r', {}, h('div.t', {}, d.temp + '°'), h('div.hl', {}, `H:${d.hi}° L:${d.lo}°`)));
    });
    this.listGrid.replaceChildren(...(rows.length ? rows : [h('div.wx-none', {}, 'No results')]));
  }
  openList() { sfx.play('tick'); this.q.value = ''; this.renderList(); void this.listEl.offsetWidth; this.listEl.classList.add('on'); }
  closeList() { this.listEl.classList.remove('on'); const a = document.activeElement; if (a && this.listEl.contains(a) && a.blur) a.blur(); }
}
