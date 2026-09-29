// Settings — iOS-style: sidebar + detail split in regular width, navigation stack in compact width.
// Everything that looks like a control is wired to the OS (os.sys / sfx) or to persisted local prefs.
import { App } from './app.js';
import { h, icon, svg, store, clamp, fmtTime, pad } from '../util.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';
import { WALLPAPERS, wallpaperCSS, isLightWallpaper } from '../wallpaper.js';
import { appIcon } from '../icons.js';
import { avatarBg } from '../data.js';

const DEF_NAME = "Jurek's iPhone Duo";
const gl = inner => svg(inner, '0 0 24 24', 'fill="currentColor"');
const GL = {
  gear: () => gl('<circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="3"/>' + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${12 + Math.cos(a) * 7.6}" y1="${12 + Math.sin(a) * 7.6}" x2="${12 + Math.cos(a) * 10}" y2="${12 + Math.sin(a) * 10}" stroke="currentColor" stroke-width="3.2"/>`; }).join('')),
  battery: () => gl('<rect x="2" y="7" width="17.500" height="10" rx="2.800" fill="none" stroke="currentColor" stroke-width="1.800"/><rect x="4" y="9" width="10" height="6" rx="1.200"/><path d="M21.500 10.500v3" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'),
  finger: () => gl('<g fill="none" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"><path d="M9 16v-4.500a3 3 0 0 1 6 0V15M5.500 15V11a6.500 6.500 0 0 1 13 0v2.500M12 11.500V17M8.500 19.500c1-1.500 1.500-3 1.500-5M15.500 19c.7-1.500 1-3 1-5"/></g>'),
  shield: () => gl('<path d="M12 2.800 4.500 5.600v5.900c0 4.600 3.100 8.200 7.500 9.700 4.400-1.500 7.500-5.100 7.500-9.700V5.600L12 2.800Z"/><path d="m8.700 11.800 2.500 2.500 4.200-4.800" fill="none" stroke="#0a84ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  lock: () => gl('<rect x="5" y="10.500" width="14" height="10" rx="2.400"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500" fill="none" stroke="currentColor" stroke-width="2"/>'),
  moon: () => icon('moon'),
};

const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const NETS = [['Duo-Home', true], ['Studio B', true], ['Blue Bottle Guest', false], ['Leo’s Place', true], ['Warsaw Free WiFi', false]];
const BT_DEVICES = [['AirPods Pro', 'earbuds'], ['Magic Keyboard', 'keyboard'], ['Apple Watch', 'watch']];
const NOTIF_APPS = ['messages', 'phone', 'calendar', 'clock', 'music', 'photos', 'reels', 'safari', 'weather', 'notes'];
const APP_NAMES = { messages: 'Messages', phone: 'Phone', calendar: 'Calendar', clock: 'Clock', music: 'Music', photos: 'Photos', reels: 'Reels', safari: 'Safari', weather: 'Weather', notes: 'Notes', camera: 'Camera', settings: 'Settings' };
const USAGE = {
  day: [['safari', 26], ['reels', 19], ['messages', 15], ['camera', 12], ['music', 10], ['photos', 8], ['weather', 4], ['notes', 3], ['clock', 3]],
  week: [['reels', 24], ['safari', 22], ['messages', 16], ['music', 13], ['camera', 9], ['photos', 7], ['notes', 4], ['weather', 3], ['clock', 2]],
};
const STORAGE = [['iOS 27.1', 14.6, '#8e8e93'], ['Apps', 41.2, '#ff9f0a'], ['Photos', 88.5, '#30d158'], ['Media', 36.3, '#ff375f'], ['System Data', 12.4, '#5e5ce6']];
const STORAGE_TOTAL = 512;
const APP_SIZES = [['photos', 88.5], ['music', 24.1], ['reels', 21.7], ['camera', 12.9], ['safari', 6.4], ['messages', 5.2], ['weather', 0.9], ['notes', 0.4]];

export default class Settings extends App {
  constructor(os, win) {
    super(os, win);
    this.binds = []; this.offs = []; this.stack = []; this.timers = []; this.cur = null; this.building = null;
    this.prefs = store.get('set:prefs', {});
    this.q = '';
    this.mode = { batt: 'day' };
    this._tone = null;
  }
  statusTone() { const t = document.getElementById('stage'); return t && t.dataset.ui === 'dark' ? 'light' : 'dark'; }

  /* ---------------------------------------------------------- prefs / os */
  pref(k, d) { return k in this.prefs ? this.prefs[k] : d; }
  setPref(k, v) { this.prefs[k] = v; store.set('set:prefs', this.prefs); }
  radio(k) { return !!this.os.sys[k] && !this.os.sys.airplane; }
  setRadio(k, v) { if (v && this.os.sys.airplane) this.os.toggle('airplane'); this.os.setSys(k, v); }
  wide() { return this.root.offsetWidth >= 620; }
  wifiNet() { return this.pref('wifiNet', NETS[0][0]); }
  patchNotify() {
    const os = this.os; if (os.__notifPatched) return; os.__notifPatched = true;
    const orig = os.notify.bind(os);
    os.notify = n => { if (n && (store.get('set:notifOff', {}) || {})[n.app]) return; return orig(n); };
  }

  /* -------------------------------------------------------------- bindings */
  bind(node, upd, o = {}) { this.binds.push({ node, upd, tick: !!o.tick, pane: this.building, seen: false }); try { upd(); } catch { /* */ } return node; }
  refresh(tick) {
    this.binds = this.binds.filter(b => {
      if (b.pane && !b.pane.alive) return false;
      if (b.node.isConnected) b.seen = true; else if (b.seen) return false;   // node was replaced by a re-render
      return true;
    });
    const keep = this.building;
    for (const b of this.binds.slice()) { if (tick && !b.tick) continue; this.building = b.pane; try { b.upd(); } catch (e) { console.error(e); } }
    this.building = keep;
  }

  /* ---------------------------------------------------------------- widgets */
  sw(get, set) {
    const b = h('button.set-sw', { role: 'switch', onclick: () => set(!get()) }, h('i'));
    return this.bind(b, () => { const v = !!get(); b.classList.toggle('on', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); });
  }
  prefSw(k, d = false, after) { return this.sw(() => this.pref(k, d), v => { this.setPref(k, v); if (after) after(v); this.refresh(); }); }
  slider(get, set) {
    const fill = h('div.set-sl-f'), thumb = h('div.set-sl-t'), el = h('div.set-sl.slider', {}, fill, thumb);
    const apply = v => { const p = `calc(14px + (100% - 28px) * ${v})`; fill.style.width = p; thumb.style.left = p; };
    const fromEv = e => { const r = el.getBoundingClientRect(), k = r.width / (el.offsetWidth || 1) || 1; return clamp((e.clientX - r.left - 14 * k) / (r.width - 28 * k), 0, 1); };
    let down = false;
    el.addEventListener('pointerdown', e => { down = true; el.setPointerCapture(e.pointerId); const v = fromEv(e); apply(v); set(v); });
    el.addEventListener('pointermove', e => { if (!down) return; const v = fromEv(e); apply(v); set(v); });
    const up = () => { down = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return this.bind(el, () => { if (!down) apply(clamp(get(), 0, 1)); });
  }
  seg(opts, get, set) {
    const btns = opts.map(([v, l]) => h('button', { onclick: () => set(v) }, l));
    const el = h('div.set-seg', {}, ...btns);
    return this.bind(el, () => btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === get())));
  }
  row(o) {
    const kids = [];
    if (o.ic) kids.push(h('span.set-ic', { style: { background: o.bg || '#8e8e93' } }, typeof o.ic === 'function' ? o.ic() : o.ic));
    if (o.lead) kids.push(o.lead);
    kids.push(h('span.set-rt', {}, h('span.set-rl', {}, o.label), o.sub ? h('span.set-rs', {}, o.sub) : null));
    if (o.val != null) kids.push(h('span.set-rv', {}, o.val));
    if (o.valEl) kids.push(o.valEl);
    if (o.right) kids.push(o.right);
    if (o.chev) kids.push(h('span.set-chev', {}, icon('chevronR')));
    const cls = 'set-row' + (o.ic || o.lead ? '.hasic' : '') + (o.cls ? '.' + o.cls : '');
    return o.on ? h('button.' + cls, { onclick: o.on }, ...kids) : h('div.' + cls, {}, ...kids);
  }
  /** value cell that stays in sync */
  val(fn, o) { const s = h('span.set-rv'); return this.bind(s, () => { s.textContent = fn(); }, o); }
  sec(head, rows, foot) {
    const fEl = foot == null ? null : h('div.set-sf', {}, ...[].concat(typeof foot === 'function' ? this.dyn(foot) : foot));
    return h('div.set-sec', {}, head ? h('div.set-sh', {}, head) : null, h('div.set-grp', {}, ...[].concat(rows)), fEl);
  }
  dyn(fn) { return [this.txt(fn)]; }
  txt(fn, o) { const s = h('span'); return this.bind(s, () => { s.textContent = fn(); }, o); }
  card(...kids) { return h('div.set-sec', {}, h('div.set-grp', {}, ...kids)); }

  /* ------------------------------------------------------------------ build */
  build() {
    const os = this.os;
    this.patchNotify();
    this.sideBody = h('div.set-body');
    this.sideScroll = h('div.set-scroll.set-sidescroll', {}, this.sideBody);
    this.side = h('div.set-side', {}, this.sideScroll);
    this.detail = h('div.set-detail');
    this.dim = h('div.set-dim');
    const root = h('div.set', { dataset: { view: 'list' } }, this.side, this.dim, this.detail);
    this.root = root;
    this.buildSide();
    dragScroll(this.sideScroll);
    this.offs.push(os.on('sys', () => { this.refresh(); this.checkTone(); }));
    this.offs.push(os.on('tick', () => { this.refresh(true); this.checkTone(); }));
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { if (this.root.offsetWidth >= 620 && !this.stack.length) this.select(this.cur || 'wifi'); });
      this.ro.observe(root);
    }
    return root;
  }
  checkTone() { const t = this.statusTone(); if (t !== this._tone) { this._tone = t; const s = this.surface; if (s && s.updateTone) s.updateTone(); } }
  onOpen() { this._tone = this.statusTone(); if (this.wide() && !this.stack.length) this.select(this.cur || 'wifi'); }
  destroy() { this.offs.forEach(f => f()); if (this.ro) this.ro.disconnect(); this.timers.forEach(clearTimeout); sfx.ringtone(false); }

  /* ---------------------------------------------------------------- sidebar */
  buildSide() {
    const os = this.os;
    this.rows = {}; this.items = []; this.groups = [];
    const NAV = [
      [
        { id: 'airplane', t: 'Airplane Mode', ic: () => icon('plane'), bg: '#ff9f0a', tog: 'airplane', kw: 'flight offline radios' },
        { id: 'wifi', t: 'Wi-Fi', ic: () => icon('wifi'), bg: '#0a84ff', val: () => this.radio('wifi') ? this.wifiNet() : 'Off', kw: 'wireless network internet' },
        { id: 'bt', t: 'Bluetooth', ic: () => icon('bt'), bg: '#0a84ff', val: () => this.radio('bt') ? 'On' : 'Off', kw: 'airpods devices' },
        { id: 'cell', t: 'Cellular', ic: () => icon('cell'), bg: '#30d158', val: () => this.radio('cell') ? 'On' : 'Off', kw: 'mobile data roaming carrier' },
        { id: 'battery', t: 'Battery', ic: GL.battery, bg: '#30d158', val: () => Math.round(os.sys.battery) + '%', tick: true, kw: 'low power mode usage charge' },
      ],
      [
        { id: 'general', t: 'General', ic: GL.gear, bg: '#8e8e93', kw: 'about storage software update version name date time 24-hour' },
        { id: 'display', t: 'Display & Brightness', ic: () => icon('sun'), bg: '#0a84ff', kw: 'appearance light dark automatic 24-hour time' },
        { id: 'wallpaper', t: 'Wallpaper', ic: () => icon('photo'), bg: '#32ade6', kw: 'background home lock screen' },
      ],
      [
        { id: 'sounds', t: 'Sounds & Haptics', ic: () => icon('speaker'), bg: '#ff375f', kw: 'volume silent ringtone ringer' },
        { id: 'focus', t: 'Focus', ic: GL.moon, bg: '#5e5ce6', kw: 'do not disturb dnd' },
        { id: 'notifications', t: 'Notifications', ic: () => icon('bell'), bg: '#ff3b30', kw: 'alerts banners apps' },
      ],
      [
        { id: 'passcode', t: 'Touch ID & Passcode', ic: GL.finger, bg: '#ff453a', kw: 'fingerprint unlock side button security 1234' },
        { id: 'privacy', t: 'Privacy & Security', ic: GL.shield, bg: '#0a84ff', kw: 'location tracking camera microphone photos permissions' },
      ],
    ];
    const prof = h('button.set-prof', { onclick: () => this.select('account') },
      h('div.set-av', { style: { background: avatarBg({ hue: 215 }) } }, 'J'),
      h('span.set-pt', {}, h('b', {}, 'Jurek'), h('small', {}, 'Apple Account, iCloud+ and more')),
      h('span.set-chev', {}, icon('chevronR')));
    this.rows.account = prof;
    const profGrp = h('div.set-sec', {}, h('div.set-grp', {}, prof));
    this.items.push({ el: prof, text: 'jurek apple account icloud', id: 'account' });
    this.groups.push({ el: profGrp, items: [this.items[0]] });

    const grpEls = NAV.map(g => {
      const items = [];
      const grp = h('div.set-grp', {}, ...g.map(p => {
        let el;
        const right = [];
        if (p.tog) right.push(this.sw(() => !!os.sys.airplane, () => os.toggle('airplane')));
        if (p.val) right.push(this.val(p.val, { tick: !!p.tick }));
        if (!p.tog) right.push(h('span.set-chev', {}, icon('chevronR')));
        const kids = [h('span.set-ic', { style: { background: p.bg } }, p.ic()), h('span.set-rl', {}, p.t), ...right];
        el = p.tog ? h('div.set-row.hasic', {}, ...kids) : h('button.set-row.hasic', { onclick: () => this.select(p.id) }, ...kids);
        if (!p.tog) this.rows[p.id] = el;
        const it = { el, text: (p.t + ' ' + (p.kw || '')).toLowerCase(), id: p.id, nav: !p.tog };
        items.push(it); this.items.push(it);
        return el;
      }));
      const sec = h('div.set-sec', {}, grp);
      this.groups.push({ el: sec, items });
      return sec;
    });

    this.searchIn = h('input', { type: 'text', placeholder: 'Search', enterkeyhint: 'search', 'data-autocap': 'off', autocomplete: 'off', spellcheck: 'false' });
    this.clearBtn = h('button.set-sclear', { hidden: true, 'data-keepkb': '', onclick: () => { this.searchIn.value = ''; this.q = ''; this.clearBtn.hidden = true; this.filter(); this.searchIn.focus(); } }, icon('xmark'));
    this.searchIn.addEventListener('input', () => { this.q = this.searchIn.value; this.clearBtn.hidden = !this.q; this.filter(); });
    this.searchIn.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const it = this.items.find(i => i.nav !== false && !i.el.hidden); if (it) { this.searchIn.blur(); this.select(it.id); }
    });
    this.empty = h('div.set-none', { hidden: true }, 'No Results');
    this.sideBody.append(
      h('h1.set-title', {}, 'Settings'),
      h('label.set-search', {}, icon('search'), this.searchIn, this.clearBtn),
      profGrp, ...grpEls, this.empty);
  }
  filter() {
    const q = this.q.trim().toLowerCase(); let any = false;
    this.groups.forEach(g => { let n = 0; g.items.forEach(it => { const m = !q || it.text.includes(q); it.el.hidden = !m; if (m) n++; }); g.el.hidden = !n; if (n) any = true; });
    this.empty.hidden = any;
  }

  /* -------------------------------------------------------------- navigation */
  select(id) {
    const def = this.pageDef(id); if (!def) return;
    this.cur = id;
    for (const k in this.rows) this.rows[k].classList.toggle('sel', k === id);
    this.clearStack();
    this.pushPage(id, def[0], def[1], true, 'Settings');
    if (!this.wide()) this.root.dataset.view = 'detail';
  }
  clearStack() { this.stack.forEach(p => { p.alive = false; p.el.remove(); }); this.stack = []; }
  push(id) {
    const def = this.pageDef(id); if (!def) return;
    const prev = this.stack[this.stack.length - 1];
    this.pushPage(id, def[0], def[1], false, prev ? prev.title : 'Back');
  }
  pushPage(id, title, fn, top, backLabel) {
    const pane = { id, title, alive: true };
    const nav = h('div.set-nav', {},
      h('button.set-back' + (top ? '.top' : ''), { onclick: () => this.back() }, icon('chevronL'), h('span', {}, backLabel)),
      h('div.set-nav-t', {}, title));
    const body = h('div.set-body'), sc = h('div.set-scroll.set-pgs', {}, body);
    pane.el = h('div.set-pg', { dataset: { id } }, sc, nav);
    this.building = pane;
    let nodes = [];
    try { nodes = fn.call(this); } catch (e) { console.error(e); }
    this.building = null;
    body.append(h('h1.set-title', {}, title), ...nodes);
    dragScroll(sc);
    sc.addEventListener('scroll', () => nav.classList.toggle('sc', sc.scrollTop > 34), { passive: true });
    const prev = this.stack[this.stack.length - 1];
    this.stack.push(pane);
    this.detail.append(pane.el);
    if (top) pane.el.classList.add('fade');
    else { pane.el.classList.add('enter'); void pane.el.offsetWidth; pane.el.classList.remove('enter'); if (prev) prev.el.classList.add('under'); }
  }
  back() {
    if (this.stack.length > 1) {
      const p = this.stack.pop(), prev = this.stack[this.stack.length - 1];
      p.alive = false; p.el.classList.add('enter'); if (prev) prev.el.classList.remove('under');
      this.timers.push(setTimeout(() => p.el.remove(), 440));
    } else if (!this.wide()) { this.root.dataset.view = 'list'; }
  }

  pageDef(id) {
    if (id.startsWith('perm-')) { const k = id.slice(5); return [({ camera: 'Camera', mic: 'Microphone', photos: 'Photos', loc: 'Location Services' })[k] || 'Access', () => this.pPerm(k)]; }
    const m = {
      account: ['Apple Account', this.pAccount], wifi: ['Wi-Fi', this.pWifi], bt: ['Bluetooth', this.pBt], cell: ['Cellular', this.pCell],
      battery: ['Battery', this.pBattery], general: ['General', this.pGeneral], about: ['About', this.pAbout], storage: ['iPhone Storage', this.pStorage],
      update: ['Software Update', this.pUpdate], datetime: ['Date & Time', this.pDate], display: ['Display & Brightness', this.pDisplay],
      wallpaper: ['Wallpaper', this.pWallpaper], sounds: ['Sounds & Haptics', this.pSounds], focus: ['Focus', this.pFocus],
      notifications: ['Notifications', this.pNotifs], passcode: ['Touch ID & Passcode', this.pPass], privacy: ['Privacy & Security', this.pPrivacy],
    }[id];
    return m || null;
  }

  /* ------------------------------------------------------------------ pages */
  pAccount() {
    const os = this.os, used = 23.1;
    return [
      h('div.set-hero', {}, h('div.set-av.big', { style: { background: avatarBg({ hue: 215 }) } }, 'J'), h('b', {}, 'Jurek'), h('small', {}, 'jurek@icloud.com')),
      this.sec(null, [
        this.row({ label: 'Name', val: 'Jurek' }),
        this.row({ label: 'Apple Account', val: 'jurek@icloud.com' }),
        this.row({ label: 'Subscription', val: 'iCloud+ 50 GB' }),
      ]),
      this.sec('iCloud Storage', [
        h('div.set-pad', {}, h('div.set-stor', {}, h('i', { style: { width: (used / 50 * 100) + '%', background: '#0a84ff' } })), h('div.set-storcap', {}, h('span', {}, used + ' GB of 50 GB used'), h('span', {}, (50 - used).toFixed(1) + ' GB free'))),
      ]),
      this.sec('Devices', [
        this.row({ label: this.txt(() => os.sys.name || DEF_NAME), sub: 'This iPhone Duo', lead: h('span.set-ic', { style: { background: '#5e5ce6' } }, icon('phone')) }),
        this.row({ label: 'Jurek’s MacBook Air', sub: 'MacBook Air 13″', lead: h('span.set-ic', { style: { background: '#8e8e93' } }, icon('splitv')) }),
        this.row({ label: 'Jurek’s Apple Watch', sub: 'Apple Watch Series 11', lead: h('span.set-ic', { style: { background: '#ff9f0a' } }, icon('clockic')) }),
      ]),
    ];
  }

  connFoot(k, what) {
    return () => this.os.sys.airplane ? `Airplane Mode is on. Turning on ${what} will turn Airplane Mode off.` : '';
  }

  pWifi() {
    const os = this.os;
    const list = h('div');
    const render = () => {
      if (!this.radio('wifi')) { list.replaceChildren(); return; }
      const cur = this.wifiNet();
      list.replaceChildren(this.sec('Networks', NETS.map(([n, sec]) =>
        h('button.set-row', { onclick: () => { this.setPref('wifiNet', n); this.refresh(); } },
          h('span.set-check', {}, n === cur ? icon('check') : null),
          h('span.set-rt', {}, h('span.set-rl', {}, n), n === cur ? h('span.set-rs', {}, 'Connected') : null),
          sec ? h('span.set-rv.ico', {}, GL.lock()) : null, h('span.set-rv.ico', {}, icon('wifi')))), 'Known networks will be joined automatically.'));
    };
    return [
      this.sec(null, this.row({ label: 'Wi-Fi', right: this.sw(() => this.radio('wifi'), v => this.setRadio('wifi', v)) }), this.connFoot('wifi', 'Wi-Fi')),
      this.bind(list, render),
    ];
  }

  pBt() {
    const list = h('div');
    const conn = () => this.pref('btdev', { 'AirPods Pro': true });
    const render = () => {
      if (!this.radio('bt')) { list.replaceChildren(); return; }
      const c = conn();
      list.replaceChildren(this.sec('My Devices', BT_DEVICES.map(([n]) =>
        h('button.set-row', { onclick: () => { const m = { ...conn() }; m[n] = !m[n]; this.setPref('btdev', m); this.refresh(); } },
          h('span.set-rt', {}, h('span.set-rl', {}, n)), h('span.set-rv', {}, c[n] ? 'Connected' : 'Not Connected'), c[n] ? h('span.set-dot', {}) : null)), 'Tap a device to connect or disconnect it.'));
    };
    return [
      this.sec(null, this.row({ label: 'Bluetooth', right: this.sw(() => this.radio('bt'), v => this.setRadio('bt', v)) }),
        () => (this.os.sys.airplane ? 'Airplane Mode is on. Turning on Bluetooth will turn Airplane Mode off. ' : '') + `This iPhone Duo is discoverable as “${this.os.sys.name || DEF_NAME}” while Bluetooth is on.`),
      this.bind(list, render),
    ];
  }

  pCell() {
    const list = h('div');
    const render = () => {
      if (!this.radio('cell')) { list.replaceChildren(); return; }
      list.replaceChildren(
        this.sec('Cellular Data Options', [
          this.row({ label: 'Carrier', val: 'Duo Mobile 5G' }),
          this.row({ label: 'Data Roaming', right: this.prefSw('roaming', false) }),
          this.row({ label: 'Low Data Mode', right: this.prefSw('lowdata', false) }),
        ], 'Low Data Mode helps reduce cellular data usage.'),
        this.sec('Cellular Data', [
          this.row({ label: 'Current Period', val: '12.4 GB' }),
          this.row({ label: 'Current Period Roaming', val: '0 bytes' }),
        ]));
    };
    return [
      this.sec(null, this.row({ label: 'Cellular Data', right: this.sw(() => this.radio('cell'), v => this.setRadio('cell', v)) }), this.connFoot('cell', 'Cellular Data')),
      this.bind(list, render),
    ];
  }

  pBattery() {
    const os = this.os;
    const pct = () => Math.round(os.sys.battery);
    const num = h('div.set-bat-n'), fill = h('i'), glyph = h('div.set-batg', {}, fill);
    this.bind(num, () => {
      const p = pct(); num.textContent = p + '%';
      fill.style.width = p + '%';
      fill.style.background = this.pref('lpm', false) ? '#ffd60a' : p <= 20 ? '#ff453a' : '#30d158';
    }, { tick: true });
    const hero = h('div.set-bat', {}, glyph, num, h('div.set-bat-s', {}, this.val(() => (this.pref('lpm', false) ? 'Low Power Mode on' : 'On battery'), { tick: false })));
    // usage chart
    const chart = h('div.set-chart'), axis = h('div.set-cx');
    const stats = h('div.set-stats');
    const draw = () => {
      const day = this.mode.batt === 'day', n = day ? 24 : 10, r = rng(day ? 41 : 97), now = new Date();
      const vals = Array.from({ length: n }, (_, i) => {
        if (!day) return 45 + r() * 50;
        const hr = (now.getHours() - 23 + i + 48) % 24;
        return hr < 6 ? 3 + r() * 9 : hr < 8 ? 15 + r() * 25 : 30 + r() * 65;
      });
      chart.replaceChildren(...vals.map((v, i) => h('div.set-bar', { style: { height: v + '%', opacity: day && i === n - 1 ? .55 : 1 } })));
      const lab = i => {
        if (!day) { const d = new Date(now.getTime() - (n - 1 - i) * 864e5); return (d.getMonth() + 1) + '/' + d.getDate(); }
        const hr = (now.getHours() - 23 + i + 48) % 24; return os.sys.h24 ? pad(hr) + ':00' : (hr % 12 || 12) + (hr < 12 ? ' AM' : ' PM');
      };
      axis.replaceChildren(...[0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1].map(i => h('span', {}, lab(i))));
      stats.replaceChildren(
        h('div', {}, h('small', {}, day ? 'Screen On' : 'Avg. Screen On'), h('b', {}, day ? '4h 12m' : '5h 03m')),
        h('div', {}, h('small', {}, day ? 'Screen Off' : 'Avg. Screen Off'), h('b', {}, day ? '1h 38m' : '1h 21m')));
    };
    const apps = h('div');
    const drawApps = () => apps.replaceChildren(this.sec('Battery Usage by App', USAGE[this.mode.batt].map(([id, p]) =>
      h('div.set-row.hasic', {}, h('span.set-ic.app', {}, appIcon(id, 29)), h('span.set-rt', {}, h('span.set-rl', {}, APP_NAMES[id] || id)),
        h('div.set-ubar', {}, h('i', { style: { width: p * 3 + '%' } })), h('span.set-rv.pct', {}, p + '%')))));
    const segEl = this.seg([['day', 'Last 24 Hours'], ['week', 'Last 10 Days']], () => this.mode.batt, v => { this.mode.batt = v; draw(); drawApps(); this.refresh(); });
    drawApps(); draw();
    return [
      this.card(hero),
      this.sec(null, this.row({ label: 'Low Power Mode', right: this.prefSw('lpm', false, v => { os.setSys('lowpower', v); }) }), 'Low Power Mode temporarily reduces background activity until you can fully charge your iPhone Duo.'),
      h('div.set-pad0', {}, segEl),
      this.card(h('div.set-pad', {}, h('div.set-chh', {}, h('b', {}, 'Battery Level'), h('small', {}, 'Activity')), chart, axis, stats)),
      apps,
    ];
  }

  pGeneral() {
    return [
      this.sec(null, [
        this.row({ label: 'About', chev: true, on: () => this.push('about') }),
        this.row({ label: 'Software Update', val: 'iOS 27.1', chev: true, on: () => this.push('update') }),
        this.row({ label: 'iPhone Storage', val: STORAGE.reduce((s, x) => s + x[1], 0).toFixed(0) + ' GB used', chev: true, on: () => this.push('storage') }),
      ]),
      this.sec(null, this.row({ label: 'Date & Time', chev: true, on: () => this.push('datetime') })),
    ];
  }

  pAbout() {
    const os = this.os;
    const inp = h('input.set-in', { type: 'text', enterkeyhint: 'done', 'data-autocap': 'off', autocomplete: 'off', spellcheck: 'false' });
    this.bind(inp, () => { if (document.activeElement !== inp) inp.value = os.sys.name || DEF_NAME; });
    inp.addEventListener('input', () => os.setSys('name', inp.value.trim() ? inp.value : DEF_NAME));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('blur', () => { if (!inp.value.trim()) inp.value = DEF_NAME; os.setSys('name', inp.value.trim() || DEF_NAME); });
    inp.addEventListener('focus', () => { this.timers.push(setTimeout(() => { try { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* */ } }, 380)); inp.select(); });
    const info = (l, v) => this.row({ label: l, val: v });
    return [
      this.sec(null, [
        h('label.set-row', {}, h('span.set-rt', {}, h('span.set-rl', {}, 'Name')), inp),
        info('iOS Version', '27.1'), info('Model Name', 'iPhone Duo'), info('Model Number', 'MFDU3LL/A'), info('Serial Number', 'F2LDUO27K1'),
      ]),
      this.sec(null, [
        info('Songs', '4'), info('Photos', '20'), info('Applications', '13'),
        info('Capacity', STORAGE_TOTAL + ' GB'), info('Available', (STORAGE_TOTAL - STORAGE.reduce((s, x) => s + x[1], 0)).toFixed(1) + ' GB'),
      ]),
      this.sec(null, [
        info('Inner Display', '888 × 632'), info('Outer Display', '435 × 632'),
        info('Carrier', 'Duo Mobile'), info('Wi-Fi Address', '3C:22:FB:0D:27:51'), info('Bluetooth', '3C:22:FB:0D:27:52'), info('IMEI', '35 271427 038164 2'),
      ]),
    ];
  }

  pStorage() {
    const used = STORAGE.reduce((s, x) => s + x[1], 0);
    return [
      this.card(h('div.set-pad', {},
        h('div.set-storhead', {}, h('b', {}, this.os.sys.name || DEF_NAME), h('span', {}, used.toFixed(1) + ' GB of ' + STORAGE_TOTAL + ' GB Used')),
        h('div.set-stor.big', {}, ...STORAGE.map(([n, g, c]) => h('i', { title: n, style: { width: (g / STORAGE_TOTAL * 100) + '%', background: c } }))),
        h('div.set-legend', {}, ...STORAGE.map(([n, g, c]) => h('span', {}, h('i', { style: { background: c } }), n, h('small', {}, g.toFixed(1) + ' GB'))), h('span', {}, h('i.free'), 'Free', h('small', {}, (STORAGE_TOTAL - used).toFixed(1) + ' GB'))))),
      this.sec('Apps', APP_SIZES.map(([id, g]) => h('div.set-row.hasic', {}, h('span.set-ic.app', {}, appIcon(id, 29)), h('span.set-rt', {}, h('span.set-rl', {}, APP_NAMES[id] || id)), h('span.set-rv', {}, g.toFixed(1) + ' GB')))),
    ];
  }

  pUpdate() {
    return [
      h('div.set-hero', {}, h('div.set-okc', {}, icon('check')), h('b', {}, 'iOS 27.1'), h('small', {}, 'Your iPhone Duo is up to date.')),
      this.sec(null, [this.row({ label: 'Automatic Updates', right: this.prefSw('autoupd', true) }), this.row({ label: 'Last Checked', val: 'Today' })],
        'iOS 27.1 adds improvements to the foldable Split View experience and fixes for the outer display.'),
    ];
  }

  pDate() {
    const os = this.os;
    return [
      this.sec(null, [
        this.row({ label: '24-Hour Time', right: this.sw(() => !!os.sys.h24, v => os.setSys('h24', v)) }),
        this.row({ label: 'Time Zone', val: 'Warsaw' }),
        this.row({ label: 'Current Time', valEl: this.val(() => { const d = new Date(); return fmtTime(d, { h24: os.sys.h24 }) + (os.sys.h24 ? '' : d.getHours() < 12 ? ' AM' : ' PM'); }, { tick: true }) }),
      ], 'Time is set automatically for your time zone.'),
    ];
  }

  pDisplay() {
    const os = this.os;
    const mini = (d, cls = '') => h('div.pv.' + (d ? 'd' : 'l') + (cls ? '.' + cls : ''), {}, h('div.pv-s', {}, h('span'), h('span')), h('b'), h('i'), h('i'), h('i.s'));
    const cards = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Automatic']].map(([v, l]) => {
      const pv = h('div.set-ap-pv', {}, v === 'light' ? mini(false) : v === 'dark' ? mini(true) : [mini(false), mini(true, 'clip')]);
      const b = h('button.set-ap', { onclick: () => os.setSys('theme', v) }, pv, h('span.set-ap-l', {}, l), h('span.set-ap-c', {}, icon('check')));
      return this.bind(b, () => b.classList.toggle('sel', os.sys.theme === v));
    });
    return [
      this.sec('Appearance', h('div.set-aps', {}, ...cards), () => os.sys.theme === 'auto' ? 'Automatic switches to Dark appearance from 8 PM to 7 AM.' : ''),
      this.sec('Brightness', h('div.set-slrow', {}, h('span.set-sli', {}, icon('sun')), this.slider(() => os.sys.brightness, v => os.setSys('brightness', v)), h('span.set-sli.big', {}, icon('sun')))),
      this.sec(null, this.row({ label: '24-Hour Time', right: this.sw(() => !!os.sys.h24, v => os.setSys('h24', v)) })),
    ];
  }

  pWallpaper() {
    const os = this.os;
    const setBg = (el, id, w, hh) => { const p = wallpaperCSS(id, w, hh); el.style.backgroundImage = p.image; el.style.backgroundSize = p.size; el.style.backgroundPosition = p.pos; el.style.backgroundRepeat = 'no-repeat'; };
    const clock = h('div.set-wpc-t');
    const cur = h('div.set-wpc', {}, clock, h('div.set-wpc-d', {}, ...Array.from({ length: 4 }, () => h('i'))));
    let shown = null;
    this.bind(cur, () => {
      const id = os.sys.wallpaper;
      if (id !== shown) { shown = id; setBg(cur, id, 448, 316); }
      cur.classList.toggle('lightwp', isLightWallpaper(id));
      clock.textContent = fmtTime(new Date(), { h24: os.sys.h24 });
    }, { tick: true });
    const thumbs = [];
    const mk = w => {
      const t = h('button.set-wp', { onclick: () => os.setSys('wallpaper', w.id) }, h('span.set-wp-c', {}, icon('check')), h('span.set-wp-n', {}, w.name));
      this.bind(t, () => t.classList.toggle('sel', os.sys.wallpaper === w.id));
      thumbs.push([t, w.id]); return t;
    };
    const gens = WALLPAPERS.filter(w => w.kind === 'gen').map(mk), pics = WALLPAPERS.filter(w => w.kind === 'photo').map(mk);
    const pane = this.building;
    thumbs.forEach(([t, id], i) => this.timers.push(setTimeout(() => { if (pane && !pane.alive) return; setBg(t, id, 300, 420); }, 40 + i * 35)));
    return [
      h('div.set-sec', {}, cur),
      h('div.set-sec', {}, h('div.set-sh', {}, 'Colors & Scenes'), h('div.set-wps', {}, ...gens)),
      h('div.set-sec', {}, h('div.set-sh', {}, 'Photos'), h('div.set-wps', {}, ...pics)),
    ];
  }

  pSounds() {
    const os = this.os;
    const hear = (label, fn, sub) => this.row({ label, sub, chev: false, on: fn, right: h('span.set-play', {}, icon('play')) });
    return [
      this.sec('Ringer and Alerts', h('div.set-slrow', {}, h('span.set-sli', {}, icon('speaker')), this.slider(() => sfx.volume, v => { sfx.setVolume(v); os.showVolumeHUD(v); }), h('span.set-sli.big', {}, icon('speaker'))),
        'Use the volume buttons on the side of the device to change the volume.'),
      this.sec(null, this.row({ label: 'Silent Mode', right: this.sw(() => !!sfx.silent, v => { if (v !== !!sfx.silent) os.toggleSilent(); }) }), 'In Silent Mode, alerts and previews below are muted.'),
      this.sec('Sounds and Vibration Patterns', [
        hear('Ringtone', () => { sfx.ringtone(true); this.timers.push(setTimeout(() => sfx.ringtone(false), 2600)); }, 'Reflection'),
        hear('Text Tone', () => sfx.play('recv'), 'Note'),
        hear('Sent Message', () => sfx.play('sent'), 'Swoosh'),
        hear('New Notification', () => sfx.play('notif'), 'Tri-tone'),
        hear('Lock Sound', () => sfx.play('lock')),
      ]),
    ];
  }

  pFocus() {
    const os = this.os;
    return [
      h('div.set-hero', {}, h('div.set-focic', {}, icon('moon')), h('b', {}, 'Do Not Disturb'), h('small', {}, 'Silence calls, alerts and notifications')),
      this.sec(null, this.row({ label: 'Do Not Disturb', right: this.sw(() => !!os.sys.dnd, v => os.setSys('dnd', v)) }),
        () => os.sys.dnd ? 'Do Not Disturb is on. Notifications are delivered quietly to Notification Center.' : 'When on, notifications are silenced and no banners or sounds appear.'),
      this.sec('Status', this.row({ label: 'Focus Status', valEl: this.val(() => os.sys.dnd ? 'On' : 'Off') })),
    ];
  }

  notifOff() { return store.get('set:notifOff', {}) || {}; }
  pNotifs() {
    const os = this.os;
    const apps = NOTIF_APPS.filter(id => os.appMeta(id));
    return [
      this.sec('Allow Notifications', apps.map(id => h('div.set-row.hasic', {}, h('span.set-ic.app', {}, appIcon(id, 29)), h('span.set-rt', {}, h('span.set-rl', {}, APP_NAMES[id] || id)),
        this.sw(() => !this.notifOff()[id], v => { const m = { ...this.notifOff() }; if (v) delete m[id]; else m[id] = true; store.set('set:notifOff', m); this.refresh(); }))),
        'Apps that are switched off will not show banners, play sounds or appear in Notification Center.'),
      this.sec(null, this.row({ label: 'Send Test Notification', on: () => os.notify({ app: 'settings', title: 'Settings', body: 'This is a test notification from Settings.' }), cls: 'blue' })),
    ];
  }

  pPass() {
    const os = this.os;
    const test = () => {
      const s = this.surface || os.focusSurface; if (!s || !s.island) return;
      s.island.touchId('scan');
      this.timers.push(setTimeout(() => { s.island.touchId('ok'); sfx.play('faceid'); }, 700));
    };
    return [
      h('div.set-hero', {}, h('div.set-fp', {}, GL.finger()), h('b', {}, 'Touch ID'), h('small', {}, 'The side button reads your fingerprint. Press it to wake, then rest your finger to unlock — or press it again to lock.')),
      this.sec('Use Touch ID For', [
        this.row({ label: 'iPhone Unlock', right: this.prefSw('tid-unlock', true) }),
        this.row({ label: 'Apple Pay', right: this.prefSw('tid-pay', true) }),
        this.row({ label: 'Password AutoFill', right: this.prefSw('tid-fill', true) }),
      ]),
      this.sec(null, this.row({ label: 'Try Touch ID', on: test, cls: 'blue' }), 'Shows the Touch ID animation in the Dynamic Island.'),
      this.sec('Passcode', [this.row({ label: 'Require Passcode', val: 'Immediately' }), this.row({ label: 'Demo Passcode', val: '1234' })], 'Enter this passcode on the Lock Screen when you use the unlock button instead of the side button.'),
    ];
  }

  pPrivacy() {
    return [
      this.sec(null, [
        this.row({ label: 'Location Services', valEl: this.val(() => this.pref('loc', true) ? 'On' : 'Off'), chev: true, on: () => this.push('perm-loc') }),
      ]),
      this.sec(null, [
        this.row({ label: 'Photos', chev: true, on: () => this.push('perm-photos') }),
        this.row({ label: 'Camera', chev: true, on: () => this.push('perm-camera') }),
        this.row({ label: 'Microphone', chev: true, on: () => this.push('perm-mic') }),
      ], 'Apps that have asked for access will be listed here.'),
      this.sec(null, [
        this.row({ label: 'Tracking Requests', right: this.prefSw('track', false) }),
        this.row({ label: 'Analytics & Improvements', right: this.prefSw('analytics', false) }),
      ], 'Tracking requests let apps ask to follow your activity across other companies’ apps.'),
    ];
  }
  pPerm(k) {
    const map = { camera: ['camera', 'messages', 'safari'], mic: ['phone', 'messages', 'camera', 'reels'], photos: ['photos', 'camera', 'messages', 'reels'], loc: ['weather', 'safari', 'camera', 'calendar'] };
    const ids = map[k] || [];
    const head = k === 'loc' ? [this.sec(null, this.row({ label: 'Location Services', right: this.prefSw('loc', true) }), 'Location Services uses GPS, Bluetooth and Wi-Fi to determine your approximate location.')] : [];
    const on = id => this.pref('perm-' + k + '-' + id, true);
    return [...head, this.sec('Apps', ids.map(id => h('div.set-row.hasic', {}, h('span.set-ic.app', {}, appIcon(id, 29)), h('span.set-rt', {}, h('span.set-rl', {}, APP_NAMES[id] || id)),
      this.sw(() => on(id) && (k !== 'loc' || this.pref('loc', true)), v => { this.setPref('perm-' + k + '-' + id, v); this.refresh(); }))))];
  }
}
