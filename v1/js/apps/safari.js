// Safari — iOS-style browser: tabs, start page, address capsule, iframe pages + offline reader fallback.
import { App } from './app.js';
import { h, icon, svg, store, clamp } from '../util.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';

const WIKI = 'https://en.wikipedia.org/w/index.php?search=';
const BG = 'assets/img/p1062.jpg';
const GL = {
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M19.8 3.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M12 6.5c-2-1.6-5-2-8.5-1.6v13c3.5-.4 6.5 0 8.5 1.6 2-1.6 5-2 8.5-1.6V4.9C17 4.5 14 4.9 12 6.5ZM12 6.5v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  tabs: '<rect x="3.5" y="7.5" width="13.5" height="13" rx="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4h10.5A2.5 2.5 0 0 1 21 6.5V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  shareUp: '<path d="M12 15V3.5M8 7l4-4 4 4M8 10H6.500a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  shield: '<path d="M12 2.8 4.5 5.8v5.7c0 4.6 3 8 7.5 9.7 4.5-1.700 7.500-5.100 7.500-9.700V5.800L12 2.800Z"/><path d="m8.700 12 2.400 2.400 4.300-4.700" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ext: '<path d="M13 4h7v7M20 4l-9 9M18 14v4.500a1.500 1.500 0 0 1-1.500 1.500h-11A1.500 1.500 0 0 1 4 18.500v-11A1.500 1.500 0 0 1 5.500 6H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  glass: '<rect x="4" y="5" width="16" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>',
};
const gl = (name, size) => { const s = svg(GL[name], '0 0 24 24', 'fill="currentColor"'); if (size) s.style.width = s.style.height = size + 'px'; return s; };

/* ---------- sites ---------- */
const FAV_COLORS = { wikipedia: '#3a3a3c', apple: '#1d1d1f', google: '#4285f4', youtube: '#ff0033', github: '#24292f', reddit: '#ff4500', gzowo: '#34c759', example: '#5e5ce6', duckduckgo: '#de5833', bing: '#0c8484', x: '#111', twitter: '#1d9bf0', amazon: '#ff9900', netflix: '#e50914' };
const BLOCK = /(^|\.)(google|youtube|github|reddit|x|twitter|facebook|instagram|amazon|netflix|linkedin|tiktok|nytimes|bing|duckduckgo|stackoverflow|whatsapp|spotify|discord|paypal|openai|microsoft|live|yahoo|twitch|pinterest|cnn|bbc)\.[a-z.]+$/i;
const DEFAULT_BM = [
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' }, { title: 'Apple', url: 'https://www.apple.com/' },
  { title: 'Google', url: 'https://www.google.com/' }, { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'GitHub', url: 'https://github.com/' }, { title: 'Reddit', url: 'https://www.reddit.com/' },
  { title: 'Gzowo Labs', url: 'https://gzowo.fun/' }, { title: 'Example', url: 'https://example.com/' },
];
const SUGGEST = [
  { title: 'iPhone Duo', sub: 'apple.com', url: 'https://www.apple.com/iphone-duo/' },
  { title: 'Model rocket', sub: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Model_rocket' },
  { title: 'Foldable smartphone', sub: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Foldable_smartphone' },
  { title: 'Kevin MacLeod', sub: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kevin_MacLeod' },
  { title: 'Black hole', sub: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Black_hole' },
];
const DEFAULT_RL = [
  { title: 'Space Shuttle', url: 'https://en.wikipedia.org/wiki/Space_Shuttle' }, { title: '3D printing', url: 'https://en.wikipedia.org/wiki/3D_printing' },
];

/* ---------- offline reader pages (for sites that refuse framing, or keyword searches) ---------- */
const READER = [
  { id: 'duo', hosts: /(^|\.)apple\.com$/i, keys: /iphone\s*duo|\bduo\b|foldable iphone/i, title: 'iPhone Duo', site: 'apple.com', body: [
    ['p', 'iPhone Duo is Apple\'s first foldable: a passport-sized device that opens like a book into one continuous landscape display.'],
    ['h', 'Two displays, one canvas'],
    ['p', 'Closed, the outer display is a familiar portrait iPhone (435 × 632 points). Open it and the inner display becomes a single seamless 888 × 632 canvas, with no visible seam and a Dynamic Island that grows from the centre.'],
    ['h', 'iOS 27, made for the fold'],
    ['ul', ['Apps resize fluidly between compact and regular width', 'Split View puts two apps side by side on the inner display', 'Bent mode turns the two halves into a canvas and a control panel', 'System controls live on the right edge, in reach of your thumb']],
    ['p', 'This page is shown in Safari\'s offline reader because apple.com does not allow itself to be displayed inside another page.'],
  ] },
  { id: 'example', hosts: /(^|\.)example\.(com|org|net)$/i, keys: /^example domain$/i, title: 'Example Domain', site: 'example.com', body: [
    ['p', 'This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.'],
    ['a', 'More information...', 'https://www.iana.org/domains/example'],
  ] },
  { id: 'gzowo', hosts: /(^|\.)gzowo\.fun$/i, keys: /gzowo|gsp aerospace|gzowo space program/i, title: 'Gzowo Labs', site: 'gzowo.fun', body: [
    ['p', 'Gzowo Labs is a personal portfolio of games, model rockets, 3D printing and home-grown language models, built by Jurek.'],
    ['h', 'What lives here'],
    ['ul', ['GSP — the Gzowo Space Program (model rockets)', 'A shelf of browser games built with three.js', 'The G-family: language models trained from scratch']],
    ['p', 'Offline reader copy. Use “Open in new window” to visit the live site.'],
  ] },
  { id: 'rocket', hosts: null, keys: /model rocket|rocketry|estes/i, title: 'Model rocketry', site: 'reader', body: [
    ['p', 'Model rocketry is a hobby in which small, unmanned rockets that use commercially made, certified motors are flown and, usually, recovered by parachute.'],
    ['h', 'Anatomy of a rocket'],
    ['ul', ['Nose cone — reduces drag, holds the payload', 'Body tube and fins — keep the centre of pressure behind the centre of gravity', 'Motor — an ignited black-powder engine, classed A to G', 'Recovery system — a parachute or streamer']],
    ['p', 'Tip: a stable rocket always has its centre of gravity ahead of its centre of pressure by at least one body diameter.'],
  ] },
];
const readerFor = url => {
  let u; try { u = new URL(url); } catch { return null; }
  const isWiki = /(^|\.)wikipedia\.org$/i.test(u.hostname);
  const q = isWiki ? (u.searchParams.get('search') || '') : '';
  return READER.find(r => (!isWiki && r.hosts && r.hosts.test(u.hostname)) || (q && r.keys.test(q))) || null;
};

/* ---------- helpers ---------- */
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const brand = url => { const h0 = hostOf(url).split('.'); return h0.length > 1 ? h0[h0.length - 2] : h0[0]; };
const favColor = url => { const b = brand(url); if (FAV_COLORS[b]) return FAV_COLORS[b]; let x = 0; for (const c of hostOf(url)) x = (x * 31 + c.charCodeAt(0)) % 360; return `hsl(${x} 62% 46%)`; };
const letter = url => (brand(url)[0] || '?').toUpperCase();
const titleFor = url => {
  if (!url) return 'Start Page';
  try {
    const u = new URL(url), host = u.hostname.replace(/^www\./, '');
    if (/wikipedia\.org$/.test(host)) {
      const q = u.searchParams.get('search'); if (q) return q + ' – Wikipedia';
      const m = u.pathname.match(/^\/wiki\/(.+)$/); if (m) return decodeURIComponent(m[1]).replace(/_/g, ' ') + ' – Wikipedia';
      return 'Wikipedia';
    }
    const r = readerFor(url); if (r) return r.title;
    return host;
  } catch { return url; }
};
const grad = str => { let x = 0; for (const c of str) x = (x * 33 + c.charCodeAt(0)) % 360; return `linear-gradient(140deg, hsl(${x} 70% 58%), hsl(${(x + 50) % 360} 65% 40%))`; };
const uid = () => 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export default class Safari extends App {
  constructor(os, win) {
    super(os, win);
    const saved = store.get('sf-tabs', null);
    const okTab = t => t && typeof t.id === 'string' && Array.isArray(t.hist) && typeof t.hi === 'number';
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length && saved.tabs.every(okTab)) { this.tabs = saved.tabs; this.cur = saved.cur; }
    else { this.tabs = [this.mkTab()]; this.cur = this.tabs[0].id; }
    if (!this.tabs.some(t => t.id === this.cur)) this.cur = this.tabs[0].id;
    this.bm = store.get('sf-bm', DEFAULT_BM); this.rl = store.get('sf-rl', DEFAULT_RL); this.history = store.get('sf-hist', []);
    this.trk = store.get('sf-trk', 214); this.rs = store.get('sf-rs', 1);
    this.frames = new Map(); this.timers = new Set(); this.offs = []; this.reg = false; this.wasDark = null;
    this.sheetKind = null; this.bmSeg = 'bm'; this.switcherOpen = false;
  }
  get tab() { return this.tabs.find(t => t.id === this.cur) || this.tabs[0]; }
  isDark() { const st = document.getElementById('stage'); return !!st && st.dataset.ui === 'dark'; }
  statusTone() { return this.isDark() ? 'light' : 'dark'; }
  updateTone() { try { this.os.surfaces.forEach(s => s.updateTone()); } catch { /* */ } }
  mkTab() { return { id: uid(), url: '', title: 'Start Page', hist: [''], hi: 0 }; }
  later(fn, ms) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
  save() { store.set('sf-tabs', { tabs: this.tabs.map(({ id, url, title, hist, hi }) => ({ id, url, title, hist: hist.slice(-40), hi: Math.min(hi, 39) })), cur: this.cur }); }

  /* ================================================================ build */
  build() {
    const root = this.root = h('div.sf'); root.style.setProperty('--rs', this.rs);
    // address capsule (single instance, re-parented between regular and compact layouts)
    this.buildCap();
    this.capRow = h('div.sf-caprow', {}, this.cap);
    this.barMid = h('div.sf-barmid');
    const B = (act, node, fn, extra) => { const b = h('button.sf-tb', { dataset: { act }, onclick: fn }, node); if (extra) b.append(extra); return b; };
    const G = (n) => gl(n, 24);
    const tabsBtn = () => B('tabs', G('tabs'), () => this.openSwitcher(), h('em.sf-cnt', {}, String(this.tabs.length)));
    const plus = () => h('button.sf-tb', { dataset: { act: 'new' }, onclick: () => this.newTab() }, icon('plus', 22));
    // regular: iPad-style top bar + tab strip
    this.strip = dragScroll(h('div.sf-strip', {}, h('div.sf-strip-in')), { axis: 'x' });
    this.stripIn = this.strip.firstElementChild;
    const bar = h('div.sf-bar', {}, B('back', icon('chevronL', 22), () => this.back()), B('fwd', icon('chevronR', 22), () => this.fwd()), this.barMid, B('share', G('shareUp'), () => this.openSheet('share')), plus(), B('bm', G('book'), () => this.openSheet('bm')), tabsBtn());
    this.topReg = h('div.sf-top.gls', {}, bar, this.strip);
    // compact: title strip on top, capsule + toolbar at the bottom
    this.tstrip = h('div.sf-tstrip.gls', {}, h('span'));
    const tools = h('div.sf-tools', {}, B('back', icon('chevronL', 22), () => this.back()), B('fwd', icon('chevronR', 22), () => this.fwd()), B('share', G('shareUp'), () => this.openSheet('share')), B('bm', G('book'), () => this.openSheet('bm')), tabsBtn());
    this.bottom = h('div.sf-bottom.gls', {}, this.capRow, tools);
    // stage
    this.prog = h('div.sf-prog');
    this.banner = h('div.sf-banner', {}, h('span', {}, 'Some sites can’t be displayed here.'), this.bannerLink = h('a', { target: '_blank', rel: 'noopener noreferrer', href: '#' }, 'Open in new window ↗'), h('button', { onclick: () => { this.bannerOff = true; this.banner.classList.remove('on'); } }, icon('xmark', 12)));
    this.frameHost = h('div.sf-frames');
    this.pageEl = dragScroll(h('div.sf-page', {}, h('div.sf-page-in')), { axis: 'y' });
    this.startEl = h('div.sf-start', {}, dragScroll(h('div.sf-start-sc', {}, h('div.sf-start-in')), { axis: 'y' }));
    this.sugg = h('div.sf-sugg', { dataset: { keepkb: '1' } }, dragScroll(h('div.sf-sugg-sc', {}, h('div.sf-sugg-in')), { axis: 'y' }));
    this.sugg.addEventListener('mousedown', e => e.preventDefault());
    this.stage = h('div.sf-stage', {}, this.startEl, this.frameHost, this.pageEl, this.banner, this.prog, this.sugg);
    this.toast = h('div.sf-toast');
    // overlays
    this.swGrid = h('div.sf-grid');
    this.sw = h('div.sf-sw', {}, h('div.sf-sw-sc', {}, this.swGrid),
      h('div.sf-sw-bar', {}, h('button.sf-sw-b', { onclick: () => this.newTab(true) }, icon('plus', 22)), this.swCount = h('span'), h('button.sf-sw-done', { onclick: () => this.closeSwitcher() }, 'Done')));
    dragScroll(this.sw.firstElementChild, { axis: 'y' });
    this.scrim = h('div.sf-scrim', { onclick: () => this.closeSheet() });
    this.sheet = h('div.sf-sheet', { dataset: { keepkb: '1' } });
    root.append(this.topReg, this.tstrip, this.stage, this.bottom, this.sw, this.scrim, this.sheet, this.toast);

    this.offs.push(this.os.on('sys', () => { const d = this.isDark(); if (d !== this.wasDark) { this.wasDark = d; this.updateTone(); } }));
    this.ro = new ResizeObserver(() => this.measure()); this.ro.observe(root);
    this.measure(); this.showTab(); this.renderStrip();
    return root;
  }
  onOpen() { this.measure(); this.wasDark = this.isDark(); }
  destroy() {
    this.timers.forEach(clearTimeout); this.timers.clear(); this.offs.forEach(f => f && f()); this.offs = [];
    this.ro && this.ro.disconnect(); this.frames.forEach(f => { f.src = 'about:blank'; f.remove(); }); this.frames.clear();
  }
  measure() {
    const r = this.root; if (!r || !r.offsetWidth) return;
    const reg = r.offsetWidth >= 620;
    if (reg !== this.reg || !this.cap.parentNode) { this.reg = reg; r.classList.toggle('reg', reg); (reg ? this.barMid : this.capRow).append(this.cap); }
    r.classList.toggle('reg', reg);
  }

  buildCap() {
    const input = this.input = h('input.sf-in', { type: 'text', placeholder: 'Search or enter website name', enterkeyhint: 'go', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    this.capIcon = h('span.sf-capi'); this.reloadBtn = h('button.sf-rl', { onclick: () => (this.loading ? this.stop() : this.reload()) });
    this.aaBtn = h('button.sf-aa', { onclick: () => this.openSheet('aa') }, h('small', {}, 'A'), h('span', {}, 'A'));
    this.clearBtn = h('button.sf-cl', { onmousedown: e => e.preventDefault(), onclick: () => { input.value = ''; this.updateSugg(); input.focus(); } }, icon('xmark', 12));
    this.cap = h('div.sf-cap', {}, this.aaBtn, this.capIcon, input, this.clearBtn, this.reloadBtn);
    input.addEventListener('focus', () => { this.cap.classList.add('focus'); this.root.classList.add('typing'); input.value = this.tab.url; this.later(() => input.select(), 0); this.updateSugg(); });
    input.addEventListener('blur', () => { this.cap.classList.remove('focus'); this.root.classList.remove('typing'); this.refreshCap(); });
    input.addEventListener('input', () => this.updateSugg());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.blur(); if (v.trim()) this.go(v); }
      else if (e.key === 'Escape') input.blur();
    });
  }
  refreshCap() {
    const t = this.tab, focus = this.cap.classList.contains('focus');
    this.cap.classList.toggle('empty', !t.url);
    this.capIcon.replaceChildren(t.url && /^https:/.test(t.url) ? gl('lock', 12) : icon('search', 14));
    this.reloadBtn.replaceChildren(this.loading ? icon('xmark', 14) : gl('reload', 15));
    if (!focus) this.input.value = t.url ? hostOf(t.url) : '';
    const strip = this.tstrip.firstChild; if (strip) strip.textContent = t.url ? hostOf(t.url) : 'Start Page';
    this.root.querySelectorAll('[data-act=back]').forEach(b => { b.disabled = t.hi <= 0; });
    this.root.querySelectorAll('[data-act=fwd]').forEach(b => { b.disabled = t.hi >= t.hist.length - 1; });
    this.root.querySelectorAll('[data-act=share]').forEach(b => { b.disabled = !t.url; });
    this.root.querySelectorAll('.sf-cnt').forEach(e => { e.textContent = String(this.tabs.length); });
  }

  /* ================================================================ navigation */
  normalize(text) {
    const s = text.trim(); if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (!/\s/.test(s) && /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(s)) return 'https://' + s;
    return WIKI + encodeURIComponent(s);
  }
  go(text) {
    const url = this.normalize(text); if (!url) return;
    const t = this.tab;
    t.hist = t.hist.slice(0, t.hi + 1); if (t.hist[t.hi] !== url) t.hist.push(url);
    t.hi = t.hist.length - 1; t.url = url; t.title = titleFor(url);
    this.history = [{ title: t.title, url, ts: Date.now() }, ...this.history.filter(x => x.url !== url)].slice(0, 60); store.set('sf-hist', this.history);
    this.trk += 2 + Math.floor(Math.random() * 6); store.set('sf-trk', this.trk);
    this.save(); this.showTab(true); this.renderStrip();
  }
  step(d) {
    const t = this.tab, i = t.hi + d; if (i < 0 || i >= t.hist.length) return;
    t.hi = i; t.url = t.hist[i]; t.title = titleFor(t.url); sfx.play('tick'); this.save(); this.showTab(true); this.renderStrip();
  }
  back() { this.step(-1); } fwd() { this.step(1); }
  reload() { const t = this.tab; if (!t.url) return; this.showTab(true, true); }
  stop() { this.progDone(); }
  select(id) { if (this.cur === id) return; this.cur = id; this.save(); this.bannerOff = false; this.showTab(); this.renderStrip(); }
  newTab(fromSwitcher) {
    const t = this.mkTab(); this.tabs.push(t); this.cur = t.id; this.save(); this.bannerOff = false;
    sfx.play('tick'); this.showTab(); this.renderStrip();
    if (fromSwitcher) this.closeSwitcher();
  }
  closeTab(id) {
    const i = this.tabs.findIndex(t => t.id === id); if (i < 0) return;
    this.tabs.splice(i, 1); const f = this.frames.get(id); if (f) { f.src = 'about:blank'; f.remove(); this.frames.delete(id); }
    if (!this.tabs.length) this.tabs.push(this.mkTab());
    if (this.cur === id) { this.cur = this.tabs[Math.min(i, this.tabs.length - 1)].id; this.showTab(); }
    this.save(); this.renderStrip(); this.refreshCap();
  }

  /* ================================================================ page display */
  kindOf(url) {
    if (!url) return 'start';
    if (readerFor(url)) return 'reader';
    try { if (BLOCK.test(new URL(url).hostname)) return 'blocked'; } catch { /* */ }
    return 'frame';
  }
  showTab(loading, force) {
    const t = this.tab, kind = this.kindOf(t.url);
    this.frames.forEach(f => f.classList.remove('on'));
    this.startEl.classList.toggle('on', kind === 'start');
    this.pageEl.classList.toggle('on', kind === 'reader' || kind === 'blocked');
    this.banner.classList.remove('on');
    this.root.dataset.kind = kind;
    if (kind === 'start') { this.buildStart(); this.progDone(true); }
    else if (kind === 'reader' || kind === 'blocked') {
      this.pageEl.firstChild.replaceChildren(kind === 'reader' ? this.readerPage(readerFor(t.url), t) : this.blockedPage(t.url));
      this.pageEl.scrollTop = 0; this.progStart(); this.later(() => this.progDone(), 380);
    } else {
      let f = this.frames.get(t.id);
      if (!f) {
        f = h('iframe.sf-frame', { referrerpolicy: 'no-referrer', allow: 'fullscreen', title: 'Web page' });
        f.addEventListener('load', () => { if (f.dataset.url && this.tab.id === t.id) this.progDone(); });
        this.frames.set(t.id, f); this.frameHost.append(f);
      }
      f.classList.add('on');
      if (f.dataset.url !== t.url || force) { f.dataset.url = t.url; f.src = t.url; this.progStart(); }
      else if (!loading) this.progDone(true);
      this.bannerLink.href = t.url;
      this.banner.classList.toggle('on', !this.bannerOff);
    }
    this.refreshCap();
  }
  progStart() {
    clearTimeout(this._pt); const p = this.prog; this.loading = true;
    p.style.transition = 'none'; p.style.opacity = '1'; p.style.width = '0%'; void p.offsetWidth;
    p.style.transition = 'width 9s cubic-bezier(.1,.6,.25,1)'; p.style.width = '88%';
    clearTimeout(this._ft); this._ft = this.later(() => this.progDone(), 14000);
    if (this.reloadBtn) this.refreshCap();
  }
  progDone(instant) {
    const p = this.prog; this.loading = false; clearTimeout(this._pt); clearTimeout(this._ft);
    if (instant) { p.style.transition = 'none'; p.style.opacity = '0'; p.style.width = '0%'; }
    else { p.style.transition = 'width .22s ease-out'; p.style.width = '100%'; this._pt = this.later(() => { p.style.transition = 'opacity .3s'; p.style.opacity = '0'; this._pt = this.later(() => { p.style.transition = 'none'; p.style.width = '0%'; }, 320); }, 240); }
    this.refreshCap();
  }

  fav(url, size = 40) {
    const el = h('span.sf-fav', { style: { background: favColor(url), width: size + 'px', height: size + 'px', fontSize: Math.round(size * .5) + 'px', borderRadius: Math.round(size * .24) + 'px' } }, letter(url));
    return el;
  }

  /* ---------- start page ---------- */
  buildStart() {
    const inn = this.startEl.firstChild.firstChild;
    const favs = this.bm.slice(0, 16).map(b => h('div.sf-favt', { onclick: () => this.go(b.url) }, this.fav(b.url, 60), h('span', {}, b.title)));
    const privacy = h('div.sf-card-p', { onclick: () => this.openSheet('privacy') }, h('div.sf-card-h', {}, h('span.sf-shield', {}, gl('shield', 22)), h('b', {}, 'Privacy Report'), h('span.sf-chev', {}, icon('chevronR', 12))),
      h('p', {}, `In the last seven days, Safari has prevented ${this.trk} trackers from profiling you.`),
      h('div.sf-stats', {}, h('div', {}, h('b', {}, String(this.trk)), h('span', {}, 'Trackers prevented')), h('div', {}, h('b', {}, String(Math.round(this.trk * .37))), h('span', {}, 'Websites contacted'))));
    const rl = h('div.sf-card-p', {}, h('div.sf-card-h', {}, gl('book', 20), h('b', {}, 'Reading List')),
      this.rl.length ? h('div.sf-rl-list', {}, ...this.rl.slice(0, 5).map(r => h('div.sf-rl-row', { onclick: () => this.go(r.url) }, this.fav(r.url, 34), h('div', {}, h('b', {}, r.title), h('span', {}, hostOf(r.url)))))) : h('p.sf-dim', {}, 'Add pages from the Share menu to read them later.'));
    const sug = dragScroll(h('div.sf-sugs', {}, h('div.sf-sugs-in', {}, ...SUGGEST.map(s => h('div.sf-sug', { onclick: () => this.go(s.url) }, h('div.sf-sug-t', { style: { background: grad(s.title) } }, s.title[0]), h('b', {}, s.title), h('span', {}, s.sub))))), { axis: 'x' });
    inn.replaceChildren(h('h2.sf-sh', {}, 'Favorites'), h('div.sf-favs', {}, ...favs), h('div.sf-cols', {}, privacy, rl), h('h2.sf-sh', {}, 'Siri Suggestions'), sug);
  }

  /* ---------- reader + blocked pages ---------- */
  readerPage(r, t) {
    const body = r.body.map(b => b[0] === 'h' ? h('h2', {}, b[1]) : b[0] === 'p' ? h('p', {}, b[1]) : b[0] === 'a' ? h('p', {}, h('a', { href: b[2], target: '_blank', rel: 'noopener noreferrer' }, b[1])) : h('ul', {}, ...b[1].map(x => h('li', {}, x))));
    return h('article.sf-rd', {}, h('div.sf-rd-k', {}, r.site.toUpperCase() + ' · READER'), h('h1', {}, r.title), ...body,
      h('div.sf-rd-f', {}, h('a.sf-open', { href: t.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open in new window ↗')));
  }
  blockedPage(url) {
    const host = hostOf(url);
    return h('div.sf-blocked', {}, this.fav(url, 84), h('h1', {}, `${host} can’t be shown here`), h('p', {}, 'This site doesn’t allow itself to be displayed inside another page. You can still open it in a regular browser window.'),
      h('a.sf-open', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Open in new window ↗'),
      h('button.sf-alt', { onclick: () => this.go(WIKI + encodeURIComponent(host.split('.')[0])) }, `Search Wikipedia for “${host.split('.')[0]}”`));
  }

  /* ---------- suggestions while typing ---------- */
  updateSugg() {
    const q = this.input.value.trim(), ql = q.toLowerCase(), inn = this.sugg.firstChild.firstChild;
    const rows = [];
    const row = (lead, title, sub, fn) => h('div.sf-srow', { onclick: () => { this.input.blur(); fn(); } }, lead, h('div', {}, h('b', {}, title), sub ? h('span', {}, sub) : null));
    if (q && q !== this.tab.url) {
      const isUrl = this.normalize(q).indexOf(WIKI) !== 0;
      rows.push(row(h('span.sf-slead', {}, icon(isUrl ? 'globe' : 'search', 18)), isUrl ? 'Go to ' + this.normalize(q) : `Search Wikipedia for “${q}”`, isUrl ? '' : 'Wikipedia', () => this.go(q)));
      if (isUrl) rows.push(row(h('span.sf-slead', {}, icon('search', 18)), `Search Wikipedia for “${q}”`, 'Wikipedia', () => this.go(WIKI + encodeURIComponent(q))));
    }
    const pool = [...this.bm.map(b => ({ ...b, k: 'Bookmark' })), ...this.rl.map(b => ({ ...b, k: 'Reading List' })), ...this.history.map(b => ({ ...b, k: 'History' })), ...SUGGEST.map(b => ({ title: b.title, url: b.url, k: 'Suggestion' }))];
    const seen = new Set();
    pool.filter(p => !q || p.title.toLowerCase().includes(ql) || p.url.toLowerCase().includes(ql)).forEach(p => { if (seen.has(p.url) || rows.length > 7) return; seen.add(p.url); rows.push(row(this.fav(p.url, 30), p.title, `${p.k} · ${hostOf(p.url)}`, () => this.go(p.url))); });
    inn.replaceChildren(h('div.sf-sh2', {}, q ? 'Suggestions' : 'Favorites & History'), ...rows);
  }

  /* ================================================================ tab strip / switcher */
  renderStrip() {
    const chips = this.tabs.map(t => h('div.sf-chip' + (t.id === this.cur ? '.on' : ''), { onclick: () => this.select(t.id) }, this.fav(t.url || 'https://start.page', 16), h('span', {}, t.url ? t.title : 'Start Page'),
      h('button', { onclick: e => { e.stopPropagation(); this.closeTab(t.id); } }, icon('xmark', 10))));
    this.stripIn.replaceChildren(...chips);
    this.refreshCap();
    const on = this.stripIn.querySelector('.on'); if (on) { const s = this.strip, l = on.offsetLeft, r = l + on.offsetWidth; if (l < s.scrollLeft) s.scrollLeft = l - 8; else if (r > s.scrollLeft + s.clientWidth) s.scrollLeft = r - s.clientWidth + 8; }
  }
  preview(t) {
    const kind = this.kindOf(t.url), pv = h('div.sf-pv');
    if (kind === 'start') { pv.classList.add('start'); pv.style.backgroundImage = `url(${BG})`; pv.append(h('div.sf-pv-g', {}, ...Array.from({ length: 8 }, (_, i) => h('i', { style: { background: favColor(this.bm[i]?.url || 'https://x' + i + '.com') } })))); return pv; }
    pv.append(h('div.sf-pv-hd', { style: { background: favColor(t.url) } }, h('b', {}, letter(t.url)), h('span', {}, hostOf(t.url))), h('div.sf-pv-l', {}, h('i', { style: { width: '78%' } }), h('i'), h('i', { style: { width: '90%' } }), h('i', { style: { width: '60%' } }), h('i'), h('i', { style: { width: '84%' } })));
    return pv;
  }
  openSwitcher() {
    if (this.cap.classList.contains('focus')) this.input.blur();
    this.renderSwitcher(); this.switcherOpen = true; this.root.classList.add('sw-on'); this.updateTone();
  }
  closeSwitcher() { this.switcherOpen = false; this.root.classList.remove('sw-on'); this.updateTone(); }
  renderSwitcher() {
    this.swCount.textContent = this.tabs.length + (this.tabs.length === 1 ? ' Tab' : ' Tabs');
    this.swGrid.replaceChildren(...this.tabs.map(t => {
      const card = h('div.sf-tc' + (t.id === this.cur ? '.on' : ''), { onclick: () => { this.select(t.id); this.closeSwitcher(); } },
        h('div.sf-tc-h', {}, this.fav(t.url || 'https://start.page', 18), h('span', {}, t.url ? t.title : 'Start Page'),
          h('button', { onclick: e => { e.stopPropagation(); card.classList.add('gone'); this.later(() => { this.closeTab(t.id); this.renderSwitcher(); }, 230); } }, icon('xmark', 12))),
        this.preview(t));
      return card;
    }));
  }

  /* ================================================================ sheets / menus */
  toastMsg(msg) {
    this.toast.textContent = msg; this.toast.classList.add('on'); clearTimeout(this._tt);
    this._tt = this.later(() => this.toast.classList.remove('on'), 1600);
  }
  addBm(t = this.tab) { if (!t.url) return; if (!this.bm.some(b => b.url === t.url)) { this.bm.push({ title: t.title, url: t.url }); store.set('sf-bm', this.bm); } this.toastMsg('Bookmark Added'); }
  addRl(t = this.tab) { if (!t.url) return; if (!this.rl.some(b => b.url === t.url)) { this.rl.unshift({ title: t.title, url: t.url }); store.set('sf-rl', this.rl); } this.toastMsg('Added to Reading List'); }
  copyLink() {
    const u = this.tab.url; if (!u) return;
    const done = () => this.toastMsg('Link Copied');
    try { navigator.clipboard.writeText(u).then(done, () => { this.fallbackCopy(u); done(); }); } catch { this.fallbackCopy(u); done(); }
  }
  fallbackCopy(text) { try { const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } }); this.root.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch { /* */ } }
  openSheet(kind) {
    if (kind === 'share' && !this.tab.url) return;
    this.sheetKind = kind; this.renderSheet(); this.root.classList.add('sheet-on');
  }
  closeSheet() { this.root.classList.remove('sheet-on'); this.sheetKind = null; }
  renderSheet() {
    const k = this.sheetKind, t = this.tab, sh = this.sheet;
    const done = h('button.sf-sh-done', { onclick: () => this.closeSheet() }, 'Done');
    const g = n => (GL[n] ? gl(n, 20) : icon(n, 20));
    const act = (ic, label, fn, href) => (href ? h('a.sf-act', { href, target: '_blank', rel: 'noopener noreferrer', onclick: () => this.later(() => this.closeSheet(), 50) }, h('span', {}, label), g(ic))
      : h('button.sf-act', { onclick: () => { fn(); this.closeSheet(); } }, h('span', {}, label), g(ic)));
    let body;
    if (k === 'share') {
      body = h('div', {}, h('div.sf-sh-hd', {}, this.fav(t.url, 44), h('div', {}, h('b', {}, t.title), h('span', {}, hostOf(t.url))), done),
        h('div.sf-acts', {}, act('link', 'Copy Link', () => this.copyLink()), act('book', 'Add to Reading List', () => this.addRl()), act('star', 'Add to Bookmarks', () => this.addBm()), act('ext', 'Open in New Window', null, t.url)));
    } else if (k === 'aa') {
      body = h('div', {}, h('div.sf-sh-hd', {}, h('b.sf-sh-t', {}, 'Page Options'), done),
        h('div.sf-ts', {}, h('button', { onclick: () => this.setRs(this.rs - .1) }, h('small', {}, 'A')), h('span', {}, Math.round(this.rs * 100) + '%'), h('button', { onclick: () => this.setRs(this.rs + .1) }, h('big', {}, 'A'))),
        h('p.sf-hint', {}, 'Text size applies to the Start Page and Reader pages.'),
        h('div.sf-acts', {}, act('reload', 'Reload Page', () => this.reload()), act('star', 'Add to Bookmarks', () => this.addBm()), t.url ? act('ext', 'Open in New Window', null, t.url) : null));
    } else if (k === 'privacy') {
      const n = this.trk, hosts = [['doubleclick.example', .34], ['metrics-hub.example', .26], ['pixel-track.example', .2], ['adnexus.example', .13], ['beacon-cdn.example', .07]];
      body = h('div', {}, h('div.sf-sh-hd', {}, h('span.sf-shield.big', {}, gl('shield', 30)), h('div', {}, h('b', {}, 'Privacy Report'), h('span', {}, `${n} trackers prevented in 7 days`)), done),
        h('div.sf-acts', {}, ...hosts.map(([d, f]) => h('div.sf-act.static', {}, h('span', {}, d), h('em', {}, String(Math.round(n * f)))))));
    } else {
      const seg = h('div.sf-seg', {}, ...[['bm', 'Bookmarks'], ['rl', 'Reading List'], ['hi', 'History']].map(([id, l]) => h('button' + (this.bmSeg === id ? '.on' : ''), { onclick: () => { this.bmSeg = id; this.renderSheet(); } }, l)));
      const list = this.bmSeg === 'bm' ? this.bm : this.bmSeg === 'rl' ? this.rl : this.history;
      const key = { bm: 'sf-bm', rl: 'sf-rl', hi: 'sf-hist' }[this.bmSeg];
      const rows = list.map((b, i) => h('div.sf-lrow', { onclick: () => { this.closeSheet(); this.go(b.url); } }, this.fav(b.url, 34), h('div', {}, h('b', {}, b.title), h('span', {}, hostOf(b.url))),
        h('button', { onclick: e => { e.stopPropagation(); list.splice(i, 1); store.set(key, list); this.renderSheet(); } }, icon('trash', 16))));
      const addBtn = t.url && this.bmSeg !== 'hi' ? h('button.sf-add', { onclick: () => { this.bmSeg === 'bm' ? this.addBm() : this.addRl(); this.renderSheet(); } }, icon('plus', 14), this.bmSeg === 'bm' ? 'Add Bookmark for This Page' : 'Add This Page') : null;
      body = h('div.sf-lwrap', {}, h('div.sf-sh-hd', {}, seg, done), addBtn, dragScroll(h('div.sf-llist', {}, h('div', {}, ...(rows.length ? rows : [h('div.sf-empty', {}, this.bmSeg === 'hi' ? 'No history yet' : 'Nothing saved yet')]))), { axis: 'y' }));
    }
    sh.classList.toggle('tall', k === 'bm'); sh.replaceChildren(h('div.sf-grab'), body);
  }
  setRs(v) { this.rs = clamp(Math.round(v * 10) / 10, .8, 1.6); store.set('sf-rs', this.rs); this.root.style.setProperty('--rs', this.rs); if (this.sheetKind === 'aa') this.renderSheet(); }
}
