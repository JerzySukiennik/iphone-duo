// A Surface is one physical display area (inner canvas, outer display, or one of the two bent-mode panels)
// with its own UI stack: wallpaper, home, windows, lock, chrome, keyboard, sheets, island.
import { h, svg, icon, ICON, clamp, fmtTime, sleep } from './util.js';
import { HomeView } from './home.js';
import { LockScreen } from './lockscreen.js';
import { Keyboard } from './keyboard.js';
import { Island } from './island.js';
import { applyWallpaper, isLightWallpaper } from './wallpaper.js';
import { dragGesture } from './scroll.js';
import { Sheets } from './sheets.js';
import { appIcon } from './icons.js';
import { sfx } from './audio.js';

const EASE = 'cubic-bezier(.2,.9,.25,1)';

export class Surface {
  /** kind: 'inner' | 'outer' | 'panel'; slice: for panels, 0/1 (which half of the shared wallpaper) */
  constructor(os, id, mount, { kind, pw, ph, slice = null }) {
    this.os = os; this.id = id; this.mount = mount; this.kind = kind; this.pw = pw; this.ph = ph; this.slice = slice;
    this.rot = 0; this.w = pw; this.h = ph; this.active = false; this.wins = []; this.parked = []; this.mode = null;
    this.build();
    this.setGeometry(0);
  }

  build() {
    this.ui = h('div.ui.surf-' + this.kind);
    this.wall = h('div.u-wall');
    this.home = new HomeView(this);
    this.winsEl = h('div.u-wins');
    this.switchEl = h('div.u-switch', {}, h('div.sw-back'));
    this.kb = new Keyboard(this);
    this.sheets = new Sheets(this);
    this.lock = new LockScreen(this);
    this.island = new Island(this);

    this.eTime = h('div.e-time', { onclick: () => this.sheets.toggleNC() });
    this.ringSvg = svg('<circle cx="17" cy="17" r="15.500" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2.200"/><circle class="rp" cx="17" cy="17" r="15.500" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-dasharray="97.400" stroke-dashoffset="20"/>', '0 0 34 34', 'class="ring"');
    this.wifi = svg('<path d="M12 18.500a1.800 1.800 0 1 0 0 .01M6.800 14.200a7.400 7.400 0 0 1 10.400 0M3.500 10.700a12 12 0 0 1 17 0" fill="none" stroke="currentColor" stroke-width="2.100" stroke-linecap="round"/>', '0 0 24 24', 'class="wifi"');
    this.eRing = h('div.e-ring', { onclick: () => this.sheets.toggleCC() }, this.ringSvg, this.wifi);
    this.edge = h('div.edge', {}, this.eTime, this.eRing);
    this.hbar = h('div.hbar');
    this.chrome = h('div.u-chrome', {}, this.edge, this.hbar);
    this.hit = h('div.hbar-hit');
    this.hud = h('div.hud-vol', {}, h('div.fill'), icon('speaker'));
    this.off = h('div.u-off');
    this.dim = h('div.u-dim');
    this.flash = h('div.u-flash');

    this.previewEl = h('div.u-preview');
    this.snapEl = h('div.u-snap');
    this.ui.append(this.wall, this.home.el, this.winsEl, this.switchEl, this.kb.el, this.sheets.el, this.lock.el, this.previewEl, this.snapEl,
      this.chrome, this.hit, this.island.el, this.hud, this.dim, this.flash, this.off);
    this.ui.style.visibility = 'hidden';   // surfaces start inactive
    this.mount.append(this.ui);

    this.bindHome();
    this.bindPull();
    this.ui.addEventListener('focusin', e => this.onFocus(e));
    this.ui.addEventListener('focusout', () => setTimeout(() => this.onBlur(), 60));
    this.ui.addEventListener('pointerdown', e => this.onPointer(e), true);
    this.ui.addEventListener('pointerdown', () => this.os.setFocus(this), true);
  }

  /* -------------------------------------------------------------- geometry */
  /** rot: rotation of the UI relative to its physical slot (deg): 0, 90 or -90. */
  setGeometry(rot) {
    this.rot = rot;
    const sw = rot % 180 !== 0;
    this.w = sw ? this.ph : this.pw; this.h = sw ? this.pw : this.ph;
    const s = this.ui.style;
    s.width = this.w + 'px'; s.height = this.h + 'px';
    s.transform = rot === 0 ? '' : rot === -90 ? `translate(0px, ${this.w}px) rotate(-90deg)` : `translate(${this.h}px, 0px) rotate(90deg)`;
    this.ui.dataset.orient = this.w > this.h ? 'land' : 'port';
    this.applyWall();
    this.home.render();
    this.lock.layout();
    this.layoutWins(false);
  }

  applyWall() {
    const os = this.os, id = os.sys.wallpaper;
    if (this.kind === 'panel') {
      // both panels are slices of one wallpaper that spans the whole inner display
      const land = this.w > this.h;
      const fw = land ? this.w : this.w * 2, fh = land ? this.h * 2 : this.h;
      applyWallpaper(this.wall, id, land ? this.w : fw, land ? fh : fh);
      const off = this.slice * (land ? this.h : this.w);
      this.wall.style.backgroundSize = land ? `${this.w}px ${this.h * 2}px` : `${this.w * 2}px ${this.h}px`;
      this.wall.style.backgroundPosition = land ? `0 -${off}px` : `-${off}px 0`;
    } else applyWallpaper(this.wall, id, this.w, this.h);
    this.tone = isLightWallpaper(id) ? 'dark' : 'light';
    this.home.el.classList.toggle('tone-dark', this.tone === 'dark');
    this.updateTone();
  }

  /** rect of an element in this UI's coordinates */
  rectOf(el) {
    const er = this.ui.getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = er.width / this.w || 1;
    return { x: (r.left - er.left) / k, y: (r.top - er.top) / k, w: r.width / k, h: r.height / k };
  }

  /* --------------------------------------------------------------- activity */
  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    this.ui.style.visibility = on ? 'visible' : 'hidden';
    if (!on) this.kb.el.classList.remove('on');
    else { this.tick(new Date()); if (this.wasActive) this.ui.animate([{ opacity: 0, filter: 'blur(14px)', transform: 'scale(1.03)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { duration: 520, easing: EASE }); }
    if (on) this.wasActive = true;
  }
  /** Fold transition: show a frozen projection of the interface (progressively blurred / darkened by the hinge angle). */
  setSnapshot(node, x = 0, y = 0) {
    if (!node) { this.snapEl.replaceChildren(); this.snapEl.style.filter = ''; this.ui.classList.remove('snapping'); return; }
    node.style.left = -x + 'px'; node.style.top = -y + 'px';
    this.snapEl.replaceChildren(node); this.ui.classList.add('snapping');
  }
  setSnapFx(blur, dim, scale = 1) { this.snapEl.style.filter = `blur(${blur.toFixed(1)}px) brightness(${dim.toFixed(3)})`; this.snapEl.firstChild && (this.snapEl.firstChild.style.transform = scale === 1 ? '' : `scale(${scale})`); }

  /** Duo Preview: the outer display shows the camera feed for the subject */
  setPreview(node) {
    if (node) { if (node.parentNode !== this.previewEl) this.previewEl.replaceChildren(node); }
    else this.previewEl.replaceChildren();
    this.ui.classList.toggle('preview-on', !!node);
  }
  setAwake(on) { this.off.classList.toggle('awake', on); }
  setLocked(locked, opts = {}) { this.lock.setLocked(locked, opts); }

  /* ---------------------------------------------------------------- tone */
  updateTone() {
    let tone = this.tone || 'light';
    const w = this.wins[0];
    if (w && !w.el.classList.contains('hidden')) tone = w.app.statusTone ? w.app.statusTone(this) : 'dark';
    if (this.os.locked) tone = isLightWallpaper(this.os.sys.wallpaper) ? 'dark' : 'light';
    this.edge.classList.toggle('tone-dark', tone === 'dark');
    this.hbar.classList.toggle('tone-dark', tone === 'dark');
  }

  tick(now) {
    if (!this.active) return;
    this.eTime.textContent = fmtTime(now, { h24: this.os.sys.h24 });
    const pct = this.os.sys.battery / 100;
    this.ringSvg.querySelector('.rp').setAttribute('stroke-dashoffset', String(97.4 * (1 - pct)));
    this.lock.tick(now);
    this.home.tick();
    this.island.sync();
  }

  /* ---------------------------------------------------------------- windows */
  setWins(list, parked = []) {
    list = list.filter(Boolean);
    const attach = w => {
      if (w.el.parentNode !== this.winsEl) { w.saveScroll(); this.winsEl.append(w.el); w.restoreScroll(); w.app.onAttach && w.app.onAttach(this); }
      w.surface = this;
    };
    list.forEach(attach); parked.forEach(attach);
    this.wins = list; this.parked = parked;
    this.layoutWins(false);
  }

  get showing() { return this.wins.length > 0; }

  layoutWins(animate = true) {
    const n = this.wins.length, W = this.w, H = this.h;
    const split = n === 2 && W >= 780;
    this.winsEl.classList.toggle('split', split);
    const shown = new Set(this.wins);
    for (const w of [...this.wins, ...(this.parked || [])]) {
      const el = w.el;
      if (!animate) el.classList.add('noanim');
      const idx = this.wins.indexOf(w);
      if (idx < 0) { el.classList.add('hidden'); continue; }
      el.classList.remove('hidden');
      const gap = 8;
      let r;
      if (split) { const ww = Math.floor((W - gap * 3) / 2); r = { x: gap + idx * (ww + gap), y: gap, w: ww, h: H - gap * 2, rad: 26 }; }
      else r = { x: 0, y: 0, w: W, h: H, rad: 0 };
      w.rect = r;
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderRadius: r.rad + 'px', transform: '' });
      // status column sits over the window that touches the right edge
      const touchesRight = r.x + r.w >= W - 1 || (split && idx === 1);
      el.style.setProperty('--safe-r', touchesRight ? '66px' : '0px');
      el.style.setProperty('--safe-b', '22px');
      el.dataset.side = split ? (idx === 0 ? 'left' : 'right') : 'full';
      el.classList.toggle('focus-ring', split && this.os.focusWin === w && false);
      if (!animate) requestAnimationFrame(() => el.classList.remove('noanim'));
    }
    this.home.el.classList.toggle('away', n > 0 && !this.switching);
    this.winsEl.style.pointerEvents = n > 0 ? '' : 'none';
    this.ui.dataset.hasapp = n > 0 ? '1' : '0';
    this.updateTone();
    this.updateKeyboardInsets();
  }

  /** Zoom a window out of (or into) an app-icon rect, iOS style. */
  animateOpen(win, src) {
    const el = win.el, r = win.rect; if (!r) return;
    if (!src) { el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE }); return; }
    const s = Math.min(r.w, r.h), k = src.w / s;
    const cx = r.w / 2, cy = r.h / 2;
    const tx = (src.x + src.w / 2 - r.x) - k * cx, ty = (src.y + src.h / 2 - r.y) - k * cy;
    const ix = (r.w - s) / 2, iy = (r.h - s) / 2;
    const from = { transform: `translate(${tx}px,${ty}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${src.w * .224 / k}px)`, opacity: .0, filter: 'blur(10px)' };
    const mid = { ...from, opacity: 1, offset: .12 };
    const to = { transform: 'none', clipPath: `inset(0px 0px 0px 0px round ${r.rad || 0}px)`, opacity: 1, filter: 'blur(0px)' };
    const a = el.animate([from, mid, to], { duration: 520, easing: EASE, fill: 'none' });
    this.home.el.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.08)', opacity: 0 }], { duration: 420, easing: EASE });
    return a.finished;
  }

  animateClose(win, dst) {
    const el = win.el, r = win.rect; if (!r) return Promise.resolve();
    if (!dst) return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 260, easing: EASE, fill: 'forwards' }).finished;
    const s = Math.min(r.w, r.h), k = dst.w / s;
    const cx = r.w / 2, cy = r.h / 2;
    const tx = (dst.x + dst.w / 2 - r.x) - k * cx, ty = (dst.y + dst.h / 2 - r.y) - k * cy;
    const ix = (r.w - s) / 2, iy = (r.h - s) / 2;
    const cur = getComputedStyle(this.winsEl).transform;
    this.home.el.style.transition = 'none';
    const to = { transform: `translate(${tx}px,${ty}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px ${iy}px ${ix}px round ${dst.w * .224 / k}px)`, opacity: .0, filter: 'blur(8px)', offset: 1 };
    const a = el.animate([{ transform: 'none', clipPath: `inset(0px round ${r.rad || 0}px)`, opacity: 1, filter: 'blur(0px)' }, { ...to, opacity: 1, offset: .82 }, to], { duration: 460, easing: EASE, fill: 'forwards' });
    this.home.el.style.transition = '';
    this.home.el.animate([{ transform: 'scale(1.08)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: EASE });
    return a.finished;
  }

  /* -------------------------------------------------------- home indicator */
  bindHome() {
    let mode = null, dyLast = 0;
    const W = () => this.w, H = () => this.h;
    let taps = 0, tapT = 0;
    this.hit.addEventListener('click', () => {
      const now = performance.now();
      if (now - tapT < 380) { taps = 0; this.os.switcher(this); } else { taps = 1; tapT = now; }
    });
    dragGesture(this.hit, {
      lock: 6,
      onStart: ({ dx, dy }) => {
        if (this.switching) { mode = 'sw'; return true; }
        if (!this.showing) { mode = 'home'; return Math.abs(dy) > Math.abs(dx) ? true : false; }
        mode = Math.abs(dy) >= Math.abs(dx) ? 'up' : 'side';
        this.winsEl.style.transition = 'none';
        this.winsEl.style.transformOrigin = '50% 100%';
        return true;
      },
      onMove: ({ dx, dy }) => {
        if (mode === 'up') {
          const p = clamp(-dy / (H() * .62), 0, 1.15);
          this.winsEl.style.transform = `translateY(${-dy * -0.0 + (-p * 22)}px) scale(${1 - p * .5})`;
          this.winsEl.style.borderRadius = `${Math.min(46, p * 80)}px`;
          this.winsEl.style.overflow = 'hidden';
          this.home.el.style.transition = 'none';
          this.home.el.classList.remove('away');
          this.home.el.style.opacity = String(clamp(p * 1.3, 0, 1));
          this.home.el.style.transform = `scale(${1.08 - .08 * clamp(p, 0, 1)})`;
          this.hbar.style.transform = `translateY(${clamp(dy, -60, 0) * .2}px)`;
        } else if (mode === 'side') {
          this.winsEl.style.transform = `translateX(${dx * .6}px)`;
        } else if (mode === 'sw') {
          this.swipeSwitcher(dy);
        }
      },
      onEnd: ({ dx, dy, vx, vy }) => {
        const reset = () => {
          this.winsEl.style.transition = `transform .45s ${EASE}, border-radius .45s`;
          this.winsEl.style.transform = ''; this.winsEl.style.borderRadius = '';
          this.home.el.style.transition = ''; this.home.el.style.opacity = ''; this.home.el.style.transform = '';
          this.hbar.style.transform = '';
          this.home.el.classList.toggle('away', this.wins.length > 0);
          setTimeout(() => { this.winsEl.style.transition = ''; this.winsEl.style.overflow = ''; }, 470);
        };
        if (mode === 'up') {
          const p = clamp(-dy / (H() * .62), 0, 1.15);
          if (vy < -0.9 || p > .6) { this.winsEl.style.overflow = ''; this.winsEl.style.transform = ''; this.winsEl.style.borderRadius = ''; this.home.el.style.opacity = ''; this.home.el.style.transform = ''; this.home.el.style.transition = ''; this.os.home(this, { fromGesture: true }); sfx.play('swoosh'); }
          else if (p > .18) { reset(); this.os.switcher(this); }
          else reset();
        } else if (mode === 'side') {
          reset();
          if (dx > 90 || vx > .8) this.os.cycleApps(this, -1);
          else if (dx < -90 || vx < -.8) this.os.cycleApps(this, 1);
        } else if (mode === 'home' && dy < -60) { this.openSpotlight(); }
        else if (mode === 'sw') { if (dy < -80) this.closeSwitcher(null); }
        mode = null;
      },
    });
  }

  /* ------------------------------------------------------------ pull-downs */
  bindPull() {
    const zone = h('div.pull', { style: { position: 'absolute', left: 0, top: 0, right: 0, height: '26px', zIndex: 44 } });
    this.ui.append(zone);
    let side = null;
    dragGesture(zone, {
      lock: 5,
      onStart: ({ dy, e }) => {
        if (dy < 0) return false;
        const r = this.ui.getBoundingClientRect(), x = (e.clientX - r.left) / (r.width / this.w);
        side = x > this.w - 110 ? 'cc' : 'nc';
        return true;
      },
      onMove: ({ dy }) => this.sheets.drag(side, dy),
      onEnd: ({ dy, vy }) => this.sheets.release(side, dy, vy),
    });
  }

  /* ------------------------------------------------------------ switcher */
  async openSwitcher() {
    const os = this.os;
    const list = os.stack.slice();
    this.switching = true;
    this.switchEl.classList.add('on');
    this.winsEl.style.pointerEvents = 'auto';
    this.home.el.classList.remove('away');
    this.cards = [];
    this.swIndex = Math.max(0, list.indexOf(this.wins[0]));
    this.swList = list;
    this.swScroll = 0;
    // header labels & hit areas
    this.swHead = h('div.sw-layer', { style: { position: 'absolute', inset: 0, zIndex: 8 } });
    this.ui.querySelectorAll('.sw-layer,.sw-empty').forEach(n => n.remove());
    this.ui.classList.add('switching');
    if (!list.length) { const e = h('div.sw-empty', { style: { zIndex: 8 } }, 'No Recent Apps'); e.onclick = () => this.closeSwitcher(null); this.ui.append(e); return; }
    this.ui.append(this.swHead);
    list.forEach(w => { w.el.classList.remove('hidden'); w.el.style.pointerEvents = 'none'; });
    this.layoutSwitcher(false);
    this.hbarHitToTop(true);
    const layer = this.swHead;
    // drag horizontally to scroll, up on a card to dismiss, tap to open
    let down = null;
    layer.onpointerdown = e => { down = { x: e.clientX, y: e.clientY, sx: this.swScroll, t: performance.now(), card: e.target.closest('.sw-card'), moved: false, vertical: false }; layer.setPointerCapture(e.pointerId); };
    layer.onpointermove = e => {
      if (!down) return;
      const k = (window.__scale || 1);
      const dx = (e.clientX - down.x) / k, dy = (e.clientY - down.y) / k;
      if (!down.moved && Math.hypot(dx, dy) > 7) { down.moved = true; down.vertical = Math.abs(dy) > Math.abs(dx) && down.card; }
      if (!down.moved) return;
      if (down.vertical) { const c = down.card; c._dy = dy; this.layoutSwitcher(false); }
      else { this.swScroll = down.sx + dx; this.layoutSwitcher(false); }
    };
    layer.onpointerup = e => {
      if (!down) return; const d = down; down = null;
      try { layer.releasePointerCapture(e.pointerId); } catch { /* */ }
      const k = (window.__scale || 1), dy = (e.clientY - d.y) / k;
      if (!d.moved) {
        const btn = e.target.closest('.sw-split');
        if (btn) { const w = d.card && d.card._win; if (w) this.os.startSplit(w, this); return; }
        if (d.card) this.closeSwitcher(d.card._win); else this.closeSwitcher(null);
      } else if (d.vertical) {
        if (dy < -90) { const w = d.card._win; d.card._dy = -this.h; this.layoutSwitcher(true); setTimeout(() => { this.os.kill(w); this.swList = this.os.stack.slice(); if (!this.swList.length) { this.closeSwitcher(null); return; } this.rebuildSwitcherLabels(); this.layoutSwitcher(true); }, 260); }
        else { d.card._dy = 0; this.layoutSwitcher(true); }
      } else { this.snapSwitcher(); }
    };
    this.rebuildSwitcherLabels();
    this.layoutSwitcher(true);
  }

  hbarHitToTop() { /* the home-bar hit area stays above the switcher (z-index 41 > 6) */ }

  rebuildSwitcherLabels() {
    this.swHead.replaceChildren();
    this.swList.forEach(w => {
      const c = h('div.sw-card', { style: { left: 0, top: 0 } },
        h('div.sw-head', {}, appIcon(w.meta.icon || w.meta.id, 22), h('span', {}, w.meta.name),
          this.os.stack.length > 1 ? h('span.sw-split', {}, 'Split View') : null));
      c._win = w; w._card = c; this.swHead.append(c);
    });
  }

  cardGeom() {
    const W = this.w, H = this.h;
    const k = W >= 780 ? 0.56 : Math.min(0.6, (W - 120) / W);
    const cw = W * k, ch = H * k, gap = 26;
    return { k, cw, ch, gap, top: (H - ch) / 2 + 8 };
  }

  layoutSwitcher(animate) {
    const g = this.cardGeom(), W = this.w, list = this.swList || [];
    const count = list.length;
    const total = count * (g.cw + g.gap) - g.gap;
    const base = (W - g.cw) / 2 - (this.swIndex || 0) * (g.cw + g.gap) + (this.swScroll || 0);
    list.forEach((w, i) => {
      const c = w._card; const dy = c ? (c._dy || 0) : 0;
      const x = base + i * (g.cw + g.gap), y = g.top + dy;
      w.el.classList.toggle('noanim', !animate);
      const r = w.rect || { x: 0, y: 0, w: this.w, h: this.h };
      Object.assign(w.el.style, { left: '0px', top: '0px', width: this.w + 'px', height: this.h + 'px', borderRadius: (44) + 'px', transform: `translate(${x}px, ${y}px) scale(${g.k})`, transition: animate ? '' : 'none' });
      if (!animate) requestAnimationFrame(() => { w.el.style.transition = ''; });
      w.el.style.opacity = dy < -20 ? String(Math.max(0, 1 + dy / 300)) : '1';
      if (c) Object.assign(c.style, { transform: `translate(${x}px, ${y}px)`, width: g.cw + 'px', height: g.ch + 'px', transition: animate ? `transform .45s ${EASE}` : 'none' });
    });
  }

  swipeSwitcher() { /* drag on the home bar while in the switcher: no-op */ }

  snapSwitcher() {
    const g = this.cardGeom();
    const shift = -this.swScroll / (g.cw + g.gap);
    this.swIndex = clamp(Math.round((this.swIndex || 0) + shift), 0, Math.max(0, this.swList.length - 1));
    this.swScroll = 0; this.layoutSwitcher(true);
  }

  async closeSwitcher(win) {
    if (!this.switching) return;
    this.switching = false;
    this.switchEl.classList.remove('on'); this.ui.classList.remove('switching');
    const os = this.os;
    (this.swList || []).forEach(w => { w.el.style.pointerEvents = ''; w.el.style.opacity = ''; w.el.style.transform = ''; });
    if (win) os.focusApp(win, this, { fromSwitcher: true });
    else { this.layoutWins(true); os.reflow(); }
    this.ui.querySelectorAll('.sw-layer,.sw-empty').forEach(n => n.remove());
  }

  /* -------------------------------------------------------------- spotlight */
  openSpotlight() { this.sheets.openSpotlight(); }

  /* -------------------------------------------------------------- keyboard */
  onFocus(e) {
    const t = e.target;
    if (!t.matches || !t.matches('input:not([type=range]):not([type=checkbox]):not([type=file]),textarea')) return;
    this.os.showKeyboard(this, t);
  }
  onBlur() {
    if (this.ui.contains(document.activeElement) && document.activeElement.matches('input,textarea')) return;
    this.os.hideKeyboard(this);
  }
  onPointer(e) {
    if (e.target.closest('input,textarea,button,.kb,[data-keepkb],.key,.sg')) return;
    const a = document.activeElement;
    if (a && a.matches && a.matches('input,textarea') && this.ui.contains(a)) a.blur();
  }
  updateKeyboardInsets() {
    const on = this.kb.el.classList.contains('on');
    const kh = on ? this.kb.height : 0;
    for (const w of this.wins) w.el.style.setProperty('--kb', (this.kbHostedHere ? kh : 0) + 'px');
  }

  /* --------------------------------------------------------------- hud/etc */
  showVolume(v) {
    this.hud.querySelector('.fill').style.height = (v * 100) + '%';
    this.hud.classList.add('on'); clearTimeout(this._hv);
    this._hv = setTimeout(() => this.hud.classList.remove('on'), 1400);
  }
  flashWhite(ms = 140) { this.flash.animate([{ opacity: .9 }, { opacity: 0 }], { duration: ms + 160, easing: 'ease-out' }); }
  setBrightness(b) { this.dim.style.opacity = String(clamp(1 - b, 0, .85) * .9); }
}
