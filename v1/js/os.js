// iOS 27 (Duo): the orchestrator. Owns system state, app windows, and decides — from the hinge angle,
// orientation and which side you are looking at — which surface(s) show which apps.
import { h, icon, svg, Emitter, store, clamp, pad } from './util.js';
import { sfx } from './audio.js';
import { Surface } from './surface.js';
import { APPS } from './registry.js';
import { Player } from './player.js';
import { waveform } from './island.js';
import { artBg } from './data.js';
import { HW, POSES } from './device.js';

let winUid = 0;

/** A frozen copy of a surface's UI (canvases/videos are baked into bitmaps) used by the fold transition. */
function cloneUI(ui) {
  const c = ui.cloneNode(true);
  const sc = ui.querySelectorAll('canvas'), dc = c.querySelectorAll('canvas');
  sc.forEach((src, i) => { const d = dc[i]; if (!d) return; try { d.width = src.width; d.height = src.height; d.getContext('2d').drawImage(src, 0, 0); } catch { /* tainted */ } });
  const sv = ui.querySelectorAll('video'), dv = c.querySelectorAll('video');
  sv.forEach((v, i) => { if (!dv[i] || !v.videoWidth || v.readyState < 2) return; const cv = document.createElement('canvas'); cv.width = v.videoWidth >> 1; cv.height = v.videoHeight >> 1; try { cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); cv.className = v.className; cv.style.cssText = v.style.cssText; dv[i].replaceWith(cv); } catch { /* */ } });
  c.querySelectorAll('.u-snap,.u-off,.u-dim,.u-flash,.hbar-hit,.pull,.kb,.u-preview,.island,.hud-vol,.banner').forEach(e => e.remove());
  c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  c.querySelectorAll('.win').forEach(w => { w.style.transition = 'none'; });
  Object.assign(c.style, { position: 'absolute', transform: 'none', visibility: 'visible', pointerEvents: 'none', opacity: '1', clipPath: 'none' });
  return c;
}

export class Win {
  constructor(os, meta, App) {
    this.os = os; this.meta = meta; this.id = ++winUid;
    this.app = new App(os, this);
    this.el = h('div.win.hidden', { dataset: { app: meta.id } });
    this.el.addEventListener('pointerdown', () => os.focusWin(this), true);
    this.root = this.app.build(this);
    this.root.classList.add('app');
    this.el.append(this.root);
  }
  saveScroll() { this._sc = [...this.el.querySelectorAll('.scroll')].map(e => [e, e.scrollTop, e.scrollLeft]); }
  restoreScroll() { requestAnimationFrame(() => (this._sc || []).forEach(([e, t, l]) => { e.scrollTop = t; e.scrollLeft = l; })); }
}

const DEFAULT_SYS = { wifi: true, bt: true, cell: true, airplane: false, dnd: false, torch: false, brightness: .92, wallpaper: 'dunes', theme: 'light', h24: false, battery: 82, rotlock: false, name: "Jurek's iPhone Duo" };

export class OS extends Emitter {
  constructor(dev) {
    super();
    this.dev = dev;
    this.sys = { ...DEFAULT_SYS, ...store.get('sys', {}), torch: false };
    this.sys.battery = 82;
    this.stack = [];            // recents, most recent first
    this.fg = [null, null];     // foreground windows: [primary/left, secondary/right]
    this.focusSlot = 0;
    this.notifications = [];
    this.activities = new Map();
    this.unread = { messages: 0 };
    this.locked = true; this.awake = true; this.limited = false; this.first = true;
    this.modeName = null; this.pendingSplit = null; this.kbHost = null;
    this.player = new Player(this);
    this.focusSurface = null;

    const M = dev.mounts;
    this.inner = new Surface(this, 'inner', M.flat, { kind: 'inner', pw: HW.HALF * 2, ph: HW.SH });
    this.outer = new Surface(this, 'outer', M.outer, { kind: 'outer', pw: HW.OUT_W, ph: HW.SH });
    this.pL = new Surface(this, 'pL', M.panelL, { kind: 'panel', pw: HW.HALF, ph: HW.SH, slice: 0 });
    this.pR = new Surface(this, 'pR', M.panelR, { kind: 'panel', pw: HW.HALF, ph: HW.SH, slice: 1 });
    this.surfaces = [this.inner, this.outer, this.pL, this.pR];
    this.focusSurface = this.inner;

    this.applyTheme();
    this.bindHardware();
    this.bindDevice();
    this.reflow();
    this.surfaces.forEach(s => s.setLocked(true, { animate: false }));
    this.tick();
    setInterval(() => this.tick(), 1000);
    document.addEventListener('keydown', e => { if (this.kbHost && this.kbHost.kb.shown) this.kbHost.kb.physical(e); });
  }

  /* ============================================================ registry */
  appMeta(id) { return APPS[id]; }
  allApps() { return Object.values(APPS); }
  badge(id) { return this.unread[id] || 0; }

  /* ================================================================ mode */
  computeMode() {
    const f = this.dev.fold, back = Math.abs(this.dev.yawT) > 90;
    if (this.dev.poseName === 'tent' && !back && f > 90) return 'outer';   // tent: the cover display faces you (StandBy-style)
    if (this.tr && !back) return f >= 90 ? 'transo' : 'trans';
    if (back) return f > 55 ? 'outer' : (this.previewOn && this.fg.some(w => w && w.meta.id === 'camera') ? 'preview' : 'off');
    let m = this._mode;
    if (m == null) m = f > 166 ? 'outer' : f < 2.5 ? 'flat' : 'bent';
    else if (m === 'outer') { if (f < 154) m = f < 2.5 ? 'flat' : 'bent'; }
    else if (m === 'flat') { if (f > 3.5) m = f > 166 ? 'outer' : 'bent'; }
    else { if (f > 166) m = 'outer'; else if (f < 2.5) m = 'flat'; }
    this._mode = m;
    return m;
  }
  rotFor(s) { const o = this.dev.orientT; return s === this.outer ? this.outerSign * o : -o; }
  get outerSign() { return -1; }

  /** Assign windows to the surfaces that are currently visible. */
  reflow() {
    const m = this.computeMode();
    const fg = this.fg, wins = fg.filter(Boolean);
    let active = [];
    if (m === 'outer') active = [this.outer];
    else if (m === 'transo') active = [this.outer, this.pR];
    else if (m === 'preview') active = [this.outer];
    else if (m === 'flat') active = [this.inner];
    else if (m === 'bent' || m === 'trans') active = [this.pL, this.pR];
    const parked = this.stack.filter(w => !wins.includes(w));
    const first = active[0];
    for (const s of this.surfaces) {
      const on = active.includes(s);
      const rot = this.rotFor(s);
      if (s.rot !== rot) s.setGeometry(rot);
      if (!on) { s.setWins([], []); s.setActive(false); continue; }
      s.setActive(true);
      s.previewMode = m === 'preview';
      let list;
      if (m === 'outer' || m === 'transo') list = [s === this.outer ? (fg[0] || fg[1]) : null].filter(Boolean);
      else if (m === 'flat') list = wins;
      else if (m === 'bent') list = [s === this.pL ? fg[0] : fg[1]].filter(Boolean);
      else list = []; // 'trans': the panels only show the frozen projection
      s.setWins(list, s === first ? parked.filter(p => !list.includes(p)) : []);
    }
    this.outer.setPreview(m === 'preview' ? this.previewNode : null);
    this.applySnapshots(m);
    // stale animations on windows that are now hidden
    this.stack.forEach(w => { if (w.el.classList.contains('hidden')) w.el.getAnimations().forEach(a => a.cancel()); });
    this.modeChanged = m !== this.modeName; this.modeName = m;
    this.surfaces.forEach(s => s.setAwake(this.awake));
    this.emit('reflow', m);
  }

  bindDevice() {
    this.dev.on('fold', f => {
      if (!this.tr && this.awake) {
        const home = this._mode === 'flat' ? 0 : this._mode === 'outer' ? 180 : null;
        if (home != null && Math.abs(f - home) > 1.2 && (this.dev.dragging || Math.abs(this.dev.target - f) > .6)) this.beginTransition(this._mode);
      }
      if (this.tr) this.applyTrFx(f);
      const m = this.computeMode(); if (m !== this.modeName) this.reflow();
    });
    this.dev.on('settle', () => { if (this.tr) this.endTransition(); this.reflow(); });
    // closing the device while it is asleep just keeps it asleep; opening while locked shows the inner lock screen
  }

  setPreviewNode(n) { this.previewNode = n; if (this.modeName === 'preview' || this._mode === 'preview') this.reflow(); }

  /* ---- fold transition: the screen "stays" — a frozen projection of the UI, blurred & dimmed as the hinge bends ---- */
  beginTransition(from) {
    const src = from === 'flat' ? this.inner : this.outer;
    if (!src.active) return;
    this.tr = { from, node: cloneUI(src.ui), land: src.w > src.h, w: src.w, h: src.h, made: false };
    this.applyTrFx(this.dev.fold);
  }
  endTransition() {
    this.tr = null;
    [this.pL, this.pR].forEach(p => { p.setSnapshot(null); });
  }
  applySnapshots(m) {
    if ((m !== 'trans' && m !== 'transo') || !this.tr) { if (this.pL.snapEl.firstChild || this.pR.snapEl.firstChild) this.endSnap(); return; }
    const tr = this.tr, half = this.pL.pw;        // a panel is one half of the inner display
    const want = m === 'trans' ? [this.pL, this.pR] : [this.pR];
    [this.pL, this.pR].forEach((p, i) => {
      const has = !!p.snapEl.firstChild;
      if (!want.includes(p)) { if (has) p.setSnapshot(null); return; }
      if (has) return;
      const n = tr.node.cloneNode(true);
      if (tr.from === 'flat') p.setSnapshot(n, tr.land ? i * half : 0, tr.land ? 0 : i * half);
      else p.setSnapshot(n, 0, 0);
    });
    this.applyTrFx(this.dev.fold);
  }
  endSnap() { [this.pL, this.pR].forEach(p => p.setSnapshot(null)); }
  applyTrFx(f) {
    if (!this.tr) return;
    const t = clamp(f / 180, 0, 1);
    // the half that swings away (left) softens hardest; the fixed half clears as the display flattens
    this.pL.setSnapFx(3 + 34 * Math.pow(t, .8), clamp(1 - .78 * t, .2, 1), 1 + .03 * t);
    this.pR.setSnapFx(20 * Math.pow(t, 1.1), clamp(1 - .38 * t, .5, 1), 1);
  }

  /** Orientation change: fade the UI, let the hardware rotate, then re-lay-out. */
  async setOrientation(o) {
    const uis = this.surfaces.map(s => s.ui);
    uis.forEach(u => { u.style.transition = 'opacity .18s'; u.style.opacity = '0'; });
    this.dev.go({ o });
    setTimeout(() => { this.reflow(); uis.forEach(u => { u.style.opacity = ''; }); }, 260);
  }
  async pose(name) {
    const p = POSES[name]; if (!p) return;
    if (p.o !== this.dev.orientT) this.setOrientation(p.o);
    this.dev.pose(name);
    if (name === 'tent' || name === 'closed') { this.dev.go({ yaw: name === 'tent' ? 0 : 0 }); }
    setTimeout(() => this.reflow(), 60);
  }

  /* =============================================================== apps */
  async launch(id, surface, srcRect, opts = {}) {
    if (this.locked && !opts.force) return;
    const meta = APPS[id]; if (!meta) return;
    surface = surface || this.focusSurface || this.inner;
    let win = this.stack.find(w => w.meta.id === id);
    if (!win) { const mod = await meta.load(); win = new Win(this, meta, mod.default); this.stack.unshift(win); }
    else this.stack = [win, ...this.stack.filter(w => w !== win)];

    const wasFg = this.fg.includes(win);
    let slot = 0;
    const m = this.modeName;
    if (this.pendingSplit && this.pendingSplit !== win && (m === 'flat' || m === 'bent')) {
      this.fg = [this.pendingSplit, win]; this.pendingSplit = null; slot = 1;
    } else {
      if (m === 'bent' && surface === this.pR && this.fg[0] && this.fg[0] !== win) slot = 1;
      else if (m === 'flat' && this.fg[0] && this.fg[1]) slot = this.focusSlot;
      const other = 1 - slot;
      if (this.fg[other] === win) this.fg[other] = null;
      this.fg[slot] = win;
    }
    this.focusSlot = slot;
    // a lone window in slot 1 while slot 0 is empty slides to slot 0
    if (!this.fg[0] && this.fg[1]) { this.fg[0] = this.fg[1]; this.fg[1] = null; this.focusSlot = 0; }
    this.reflow();
    const host = this.hostOf(win) || surface;
    if (!wasFg || opts.animate) {
      const src = srcRect || null;
      host.animateOpen(win, src);
    }
    win.app.onOpen && win.app.onOpen(host);
    this.emit('launch', id);
    return win;
  }

  hostOf(win) { return this.surfaces.find(s => s.active && s.wins.includes(win)); }

  async home(surface, opts = {}) {
    if (this.locked && !this.limited) return;
    surface = surface || this.focusSurface;
    let slots = [0, 1];
    if (this.modeName === 'bent') slots = surface === this.pR ? [1] : [0];
    let closing = slots.map(i => this.fg[i]).filter(Boolean);
    if (!closing.length && this.modeName === 'bent') { slots = [0, 1]; closing = this.fg.filter(Boolean); }
    if (!closing.length) { this.pendingSplit = null; if (this.limited) this.relock(); return; }
    this.pendingSplit = null;
    const host = this.hostOf(closing[0]) || surface;
    host.home.el.classList.remove('away');
    if (opts.fromGesture) { host.winsEl.style.transform = ''; }
    await Promise.all(closing.map(w => { const dst = host.home.iconRect(w.meta.id); return host.animateClose(w, dst); }));
    slots.forEach(i => { this.fg[i] = null; });
    if (!this.fg[0] && this.fg[1]) { this.fg[0] = this.fg[1]; this.fg[1] = null; }
    this.reflow();
    closing.forEach(w => w.app.onClose && w.app.onClose());
    if (this.limited) this.relock();
  }

  kill(win) {
    this.stack = this.stack.filter(w => w !== win);
    this.fg = this.fg.map(w => (w === win ? null : w));
    if (this.pendingSplit === win) this.pendingSplit = null;
    win.app.destroy && win.app.destroy();
    win.el.remove();
    this.reflow();
  }

  focusApp(win, surface, opts = {}) {
    this.stack = [win, ...this.stack.filter(w => w !== win)];
    if (!this.fg.includes(win)) { this.fg[0] = win; if (this.modeName !== 'flat') this.fg[1] = this.fg[1] === win ? null : this.fg[1]; }
    this.reflow();
    (surface || this.focusSurface).layoutWins(true);
    win.app.onOpen && win.app.onOpen(surface);
  }
  focusWin(win) { const i = this.fg.indexOf(win); if (i >= 0) this.focusSlot = i; }
  setFocus(surface) { this.focusSurface = surface; }

  cycleApps(surface, dir) {
    const cur = this.fg[0]; if (!cur || this.stack.length < 2) return;
    const i = this.stack.indexOf(cur), n = this.stack[(i + dir + this.stack.length) % this.stack.length];
    if (n === cur) return;
    this.fg[0] = n; if (this.fg[1] === n) this.fg[1] = null;
    this.stack = [n, ...this.stack.filter(w => w !== n)];
    this.reflow(); sfx.play('swoosh');
  }

  switcher(surface) {
    if (this.locked) return;
    surface = surface || this.focusSurface;
    // bring every recent window into this surface so it can show them as cards
    surface.setWins(surface.wins, this.stack.filter(w => !surface.wins.includes(w)));
    surface.openSwitcher();
  }

  /** Split View: run two apps side by side (inner display / bent panels). */
  startSplit(win, surface) {
    surface = surface || this.focusSurface;
    if (this.modeName === 'outer') { surface.island.flash(h('div.isl-toast', {}, 'Open to split'), 1800); return; }
    const base = win || this.fg[0];
    if (!base) { surface.island.flash(h('div.isl-toast', {}, 'Open an app'), 1600); return; }
    if (surface.switching) surface.closeSwitcher(null);
    this.pendingSplit = base;
    this.fg = [null, null]; this.reflow();
    this.surfaces.forEach(s => s.active && s.island.flash(h('div.isl-toast', {}, 'Pick 2nd app'), 2400));
  }

  /* ============================================================== lock */
  wake() {
    if (this.awake) return;
    this.awake = true; sfx.play('unlock');
    this.surfaces.forEach(s => { s.setAwake(true); if (s.active) s.lock.el.animate([{ filter: 'blur(16px)', opacity: .2, transform: 'scale(1.05)' }, { filter: 'blur(0px)', opacity: 1, transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.9,.25,1)' }); });
    this.reflow();
  }
  sleep() {
    if (!this.awake) return;
    this.awake = false; this.locked = true; this.limited = false; sfx.play('lock');
    this.surfaces.forEach(s => { s.setAwake(false); s.setLocked(true, { animate: false }); s.sheets.closeAll(); s.updateTone(); });
    this.reflow();
  }
  relock() {
    this.locked = true; this.limited = false;
    this.surfaces.forEach(s => { s.setLocked(true); s.updateTone(); });
  }
  unlock() {
    if (!this.locked && !this.limited) return;
    this.locked = false; this.limited = false; sfx.play('unlock');
    this.surfaces.forEach(s => {
      s.setLocked(false); s.updateTone();
      const target = s.wins.length ? s.winsEl : s.home.el;   // the content revealed under the lock screen blooms in from a blur
      if (s.active) target.animate([{ filter: 'blur(26px)', transform: 'scale(1.14)', opacity: .35 }, { filter: 'blur(0px)', transform: 'scale(1)', opacity: 1 }], { duration: 720, easing: 'cubic-bezier(.2,.9,.25,1)' });
    });
    this.emit('unlock');
    if (this.first) { this.first = false; this.scheduleInbound(); }
    if (this.afterUnlock) { const f = this.afterUnlock; this.afterUnlock = null; setTimeout(f, 420); }
  }
  /** Side button (Touch ID): wake, unlock or sleep. */
  pressSide() {
    sfx.init();
    if (!this.awake) { this.wake(); return; }
    if (this.locked) {
      this.surfaces.filter(s => s.active).forEach(s => s.island.touchId('scan'));
      setTimeout(() => { this.surfaces.filter(s => s.active).forEach(s => s.island.touchId('ok')); sfx.play('faceid'); this.unlock(); }, 620);
    } else this.sleep();
  }
  openFromLock(id, surface, notif) {
    this.afterUnlock = async () => { const win = await this.launch(id, surface, null); if (notif && win && win.app.onNotification) win.app.onNotification(notif); };
    surface.lock.showPass();
  }
  async lockCamera(surface) {
    this.limited = true; this.locked = false;
    this.surfaces.forEach(s => s.setLocked(false));
    await this.launch('camera', surface, null, { force: true });
  }

  /* ========================================================== hardware */
  bindHardware() {
    const b = this.dev.btn;
    const press = (el, fn) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); sfx.init(); sfx.play('click'); fn(); });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
    };
    press(b.power, () => this.pressSide());
    press(b.vup, () => this.changeVolume(.0625));
    press(b.vdn, () => this.changeVolume(-.0625));
    press(b.action, () => this.toggleSilent());
    press(b.cam, () => this.cameraControl());
  }
  changeVolume(d) {
    if (!this.awake) return;
    const v = clamp(sfx.volume + d, 0, 1); sfx.setVolume(v); sfx.play('vol'); this.showVolumeHUD(v); this.emit('volume', v); this.emit('sys');
  }
  showVolumeHUD(v) { this.surfaces.forEach(s => s.active && s.showVolume(v)); this.emit('volume', v); }
  toggleSilent() {
    sfx.setSilent(!sfx.silent);
    this.surfaces.forEach(s => s.active && s.island.silent(sfx.silent));
    this.emit('sys');
  }
  cameraControl() {
    if (!this.awake || this.locked) { if (this.awake) this.lockCamera(this.focusSurface); return; }
    const cam = this.stack.find(w => w.meta.id === 'camera');
    if (cam && this.fg.includes(cam)) cam.app.shutter && cam.app.shutter();
    else this.launch('camera', this.focusSurface);
  }

  /* =============================================================== sys */
  setSys(key, val) {
    this.sys[key] = val;
    if (['wallpaper', 'theme', 'h24', 'name', 'rotlock'].includes(key)) store.set('sys', { wallpaper: this.sys.wallpaper, theme: this.sys.theme, h24: this.sys.h24, name: this.sys.name, brightness: this.sys.brightness });
    if (key === 'brightness') { this.surfaces.forEach(s => s.setBrightness(val)); store.set('sys', { ...store.get('sys', {}), brightness: val }); }
    if (key === 'wallpaper') this.surfaces.forEach(s => { s.applyWall(); s.lock.layout(); });
    if (key === 'theme') this.applyTheme();
    if (key === 'torch') this.dev.torch(val);
    this.emit('sys', key);
  }
  toggle(key) {
    if (key === 'silent') return this.toggleSilent();
    if (key === 'airplane') { const v = !this.sys.airplane; this.sys.airplane = v; this.emit('sys', key); return; }
    this.setSys(key, !this.sys[key]);
  }
  applyTheme() {
    const hr = new Date().getHours();
    const dark = this.sys.theme === 'dark' || (this.sys.theme === 'auto' && (hr >= 20 || hr < 7));
    document.getElementById('stage').dataset.ui = dark ? 'dark' : 'light';
  }

  /* ===================================================== notifications */
  notify(n) {
    n = { when: 'now', ts: Date.now(), ...n };
    this.notifications.unshift(n);
    if (this.sys.dnd) { this.emit('notifs'); return; }
    sfx.play(n.sound || 'notif');
    this.emit('notifs');
    this.surfaces.forEach(s => s.lock.renderNotifs());
    if (!this.locked) { const s = this.surfaces.find(x => x.active && x.kind !== 'panel') || this.surfaces.find(x => x.active); if (s) s.sheets.showBanner(n); }
    if (n.app === 'messages') { this.unread.messages = (this.unread.messages || 0) + 1; this.surfaces.forEach(s => s.home.render()); }
  }
  clearNotifs() { this.notifications = []; this.emit('notifs'); this.surfaces.forEach(s => s.lock.renderNotifs()); }
  async openNotif(n, surface) {
    this.notifications = this.notifications.filter(x => x !== n); this.emit('notifs'); this.surfaces.forEach(s => s.lock.renderNotifs());
    const win = await this.launch(n.app, surface, null, { animate: true });
    if (win && win.app.onNotification) win.app.onNotification(n);
  }
  clearBadge(id) { if (this.unread[id]) { this.unread[id] = 0; this.surfaces.forEach(s => s.home.render()); } }

  scheduleInbound() {
    setTimeout(async () => { const m = await import('./apps/messages.js'); m.receive(this, 'alex', 'yo!! did you see the new Duo?? it unfolds like a book 🤯'); }, 14000);
    setTimeout(async () => { const m = await import('./apps/messages.js'); m.receive(this, 'maya', 'lunch at 12:30? blue bottle?'); }, 65000);
  }

  /* ======================================================== activities */
  setActivity(key, spec) { this.activities.set(key, { priority: 1, ...spec }); this.surfaces.forEach(s => s.island.sync(true)); }
  clearActivity(key) { if (this.activities.delete(key)) this.surfaces.forEach(s => s.island.sync(true)); }
  syncMusicActivity() {
    const p = this.player;
    if (!p.playing) { this.clearActivity('music'); return; }
    const t = p.track;
    this.setActivity('music', {
      priority: 5, height: 150,
      mount: (idx, mode) => {
        const art = h('div.i-art', { style: { background: artBg(t) } });
        if (mode === 'compact') return h('div.isl-c.i-music', {}, art, waveform(4));
        const bar = h('div.i-bar', {}, h('i'));
        const el = h('div.i-exp', {},
          h('div.i-top', {}, art.cloneNode(), h('div.i-meta', {}, h('b', {}, t.title), h('span', {}, t.artist)), waveform(4)),
          bar,
          h('div.i-ctl.isl-ctl', {}, h('button', { onclick: e => { e.stopPropagation(); p.prev(); } }, icon('prev')), h('button', { onclick: e => { e.stopPropagation(); p.toggle(); } }, icon(p.playing ? 'pause' : 'play')), h('button', { onclick: e => { e.stopPropagation(); p.next(); } }, icon('next'))));
        el._bar = bar.firstChild; return el;
      },
      update: node => { if (node._bar && this.player.duration) node._bar.style.width = (this.player.time / this.player.duration * 100) + '%'; },
    });
  }

  /* ============================================================= keyboard */
  showKeyboard(surface, target) {
    let host = surface;
    if (this.modeName === 'bent' && surface === this.pL) host = this.pR;
    if (this.kbHost && this.kbHost !== host) this.hideKeyboard();
    this.kbHost = host;
    host.kb.attach(target); host.kb.shown = true; host.kb.el.classList.add('on');
    host.kbHostedHere = true; host.updateKeyboardInsets();
    if (host !== surface) { surface.kbHostedHere = false; }
  }
  hideKeyboard() {
    const host = this.kbHost; if (!host) return;
    host.kb.el.classList.remove('on'); host.kb.shown = false; host.kbHostedHere = false; host.updateKeyboardInsets();
    this.kbHost = null;
  }

  /* ================================================================ tick */
  tick() {
    const now = new Date();
    if (now.getSeconds() === 0) { this.applyTheme(); if (now.getMinutes() % 4 === 0 && this.sys.battery > 20) this.sys.battery -= 1; }
    this.surfaces.forEach(s => s.tick(now));
    this.emit('tick', now);
  }
}
