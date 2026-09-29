// Control Center, Notification Center, Spotlight and heads-up banners for one surface.
import { h, svg, icon, ICON, clamp, fmtDate, fmtTime } from './util.js';
import { sfx } from './audio.js';
import { appIcon } from './icons.js';
import { CONTACTS, contact } from './data.js';

export class Sheets {
  constructor(surface) {
    this.s = surface; this.os = surface.os;
    this.ccOn = false; this.ncOn = false; this.spOn = false;
    this.scrim = h('div.sheet-scrim', { onclick: () => this.closeAll() });
    this.cc = h('div.cc'); this.nc = h('div.nc'); this.sp = h('div.spot');
    this.bannerEl = h('div.banner');
    this.el = h('div.u-sheets', {}, this.scrim, this.nc, this.cc, this.sp);
    this.buildCC(); this.buildNC(); this.buildSpot();
    this.os.on('sys', () => this.refreshCC());
    this.os.on('notifs', () => this.refreshNC());
    this.os.on('music', () => this.refreshCC());
    // swipe a sheet away
    this.dragUp(this.cc, 'cc'); this.dragUp(this.nc, 'nc');
  }

  /* ------------------------------------------------------------------ CC */
  buildCC() {
    const os = this.os, s = os.sys;
    const tog = (key, ic, color, cls = '') => {
      const b = h('button.cc-btn' + (cls ? '.' + cls : ''), { style: { '--c': color }, onclick: () => { sfx.play('tick'); os.toggle(key); } }, icon(ic));
      b._key = key; return b;
    };
    this.tg = {
      airplane: tog('airplane', 'plane', '#ff9f0a'),
      cell: tog('cell', 'cell', '#30d158'),
      wifi: tog('wifi', 'wifi', '#0a84ff'),
      bt: tog('bt', 'bt', '#0a84ff'),
    };
    const conn = h('div.cc-m.cc-conn', {}, this.tg.airplane, this.tg.cell, this.tg.wifi, this.tg.bt);
    this.mediaEl = h('div.cc-m.cc-play');
    const small = (key, ic, label, on) => { const b = h('button.cc-small', { title: label, onclick: () => { sfx.play('tick'); os.toggle(key); } }, icon(ic)); b._key = key; return b; };
    this.sm = { silent: small('silent', 'bell', 'Silent'), dnd: small('dnd', 'moon', 'Focus'), torch: small('torch', 'flash', 'Flashlight'), rot: small('rotlock', 'rotlock', 'Rotation Lock') };
    const act = (ic, label, fn) => h('button.cc-small', { title: label, onclick: () => { sfx.play('tick'); this.closeAll(); fn(); } }, icon(ic));
    this.bright = this.slider('sun', () => os.sys.brightness, v => os.setSys('brightness', v));
    this.vol = this.slider('speaker', () => sfx.volume, v => { sfx.setVolume(v); os.showVolumeHUD(v); });
    const grid = h('div.cc-grid', {}, conn, this.mediaEl,
      this.bright.el, this.vol.el,
      h('div.cc-tg', {},
        this.sm.silent, this.sm.dnd, this.sm.torch, this.sm.rot),
      act('timer', 'Timer', () => os.launch('clock', this.s)),
      act('calc', 'Calculator', () => os.launch('calculator', this.s)),
      act('camflip', 'Camera', () => os.launch('camera', this.s)),
      act('splitv', 'Split View', () => os.startSplit(null, this.s)));
    this.cc.append(grid);
    this.refreshCC();
  }

  slider(ic, get, set) {
    const fill = h('div.fill'), el = h('div.cc-slider.slider', {}, fill, icon(ic));
    const apply = v => { fill.style.height = (v * 100) + '%'; };
    const fromEv = e => { const r = el.getBoundingClientRect(); return clamp(1 - (e.clientY - r.top) / r.height, 0, 1); };
    let down = false;
    el.addEventListener('pointerdown', e => { down = true; el.setPointerCapture(e.pointerId); const v = fromEv(e); set(v); apply(v); });
    el.addEventListener('pointermove', e => { if (!down) return; const v = fromEv(e); set(v); apply(v); });
    el.addEventListener('pointerup', () => { down = false; });
    const upd = () => apply(get());
    return { el, upd };
  }

  refreshCC() {
    const s = this.os.sys;
    const on = (b, v) => b.classList.toggle('on', !!v);
    on(this.tg.airplane, s.airplane); on(this.tg.cell, s.cell && !s.airplane); on(this.tg.wifi, s.wifi && !s.airplane); on(this.tg.bt, s.bt && !s.airplane);
    on(this.sm.silent, sfx.silent); on(this.sm.dnd, s.dnd); on(this.sm.torch, s.torch); on(this.sm.rot, s.rotlock);
    this.bright.upd(); this.vol.upd();
    const p = this.os.player, t = p.track;
    this.mediaEl.replaceChildren(
      h('div', { style: { fontSize: '11.5px', opacity: .7, fontWeight: 600 } }, p.playing ? 'Now Playing' : 'Not Playing'),
      h('div.t', {}, t ? t.title : 'Music'), h('div.a', {}, t ? t.artist : 'Nothing playing'),
      h('div.ctl', {}, h('button', { onclick: () => p.prev() }, icon('prev')), h('button', { onclick: () => p.toggle() }, icon(p.playing ? 'pause' : 'play')), h('button', { onclick: () => p.next() }, icon('next'))));
  }

  /* ------------------------------------------------------------------ NC */
  buildNC() {
    this.ncList = h('div.nc-list');
    this.nc.append(h('div.nc-in', {}, h('div.nc-head', {}, h('b', {}, 'Notifications'), h('button', { onclick: () => this.os.clearNotifs() }, 'Clear')), this.ncList));
    this.refreshNC();
  }
  refreshNC() {
    const ns = this.os.notifications;
    if (!ns.length) { this.ncList.replaceChildren(h('div.nc-empty', {}, 'No Notifications')); return; }
    this.ncList.replaceChildren(...ns.slice(0, 6).map(n => this.notifEl(n)));
  }
  notifEl(n, banner = false) {
    const el = h('div.notif', {}, h('div.n-ico', {}, appIcon(n.app, 38)),
      h('div.n-txt', {}, h('div.n-top', {}, h('b', {}, n.title), h('small', {}, n.when || 'now')), h('div.n-body', {}, n.body)));
    el.addEventListener('click', () => { this.closeAll(); this.hideBanner(); this.os.openNotif(n, this.s); });
    return el;
  }

  /* ------------------------------------------------------------- banners */
  showBanner(n) {
    clearTimeout(this._bt);
    this.bannerEl.replaceChildren(this.notifEl(n, true));
    if (!this.bannerEl.parentNode) this.s.ui.append(this.bannerEl);
    requestAnimationFrame(() => this.bannerEl.classList.add('on'));
    let y0 = null;
    this.bannerEl.onpointerdown = e => { y0 = e.clientY; };
    this.bannerEl.onpointerup = e => { if (y0 != null && e.clientY - y0 < -14) this.hideBanner(); y0 = null; };
    this._bt = setTimeout(() => this.hideBanner(), 4600);
  }
  hideBanner() { clearTimeout(this._bt); this.bannerEl.classList.remove('on'); }

  /* ------------------------------------------------------------ spotlight */
  buildSpot() {
    this.spInput = h('input', { placeholder: 'Search', enterkeyhint: 'search', 'data-autocap': 'off' });
    this.spRes = h('div.sp-res.scroll');
    this.sp.append(h('div.sp-box', {}, h('div.sp-bar', {}, icon('search'), this.spInput, h('button', { onclick: () => this.closeAll() }, 'Cancel')), this.spRes));
    this.spInput.addEventListener('input', () => this.spSearch());
    this.spSearch();
  }
  spSearch() {
    const q = this.spInput.value.trim().toLowerCase(), os = this.os;
    const apps = os.allApps().filter(a => !q || a.name.toLowerCase().includes(q));
    const ppl = q ? CONTACTS.filter(c => c.name.toLowerCase().includes(q)) : [];
    const rows = [];
    if (apps.length) { rows.push(h('div.sp-h', {}, q ? 'Apps' : 'Siri Suggestions')); apps.slice(0, 6).forEach(a => rows.push(h('button.sp-row', { onclick: () => { this.closeAll(); os.launch(a.id, this.s); } }, appIcon(a.icon || a.id, 38), h('span', {}, a.name)))); }
    if (ppl.length) { rows.push(h('div.sp-h', {}, 'Contacts')); ppl.forEach(c => rows.push(h('button.sp-row', { onclick: () => { this.closeAll(); os.launch('messages', this.s); } }, appIcon('messages', 38), h('span', {}, c.name)))); }
    if (!rows.length) rows.push(h('div.sp-none', {}, 'No Results'));
    this.spRes.replaceChildren(...rows);
  }
  openSpotlight() {
    this.closeAll(); this.spOn = true; this.sp.classList.add('on'); this.scrim.classList.add('on');
    this.spInput.value = ''; this.spSearch();
    setTimeout(() => this.spInput.focus(), 200);
  }

  /* ----------------------------------------------------------- open/close */
  toggleCC() { this.ccOn ? this.closeAll() : this.openCC(); }
  toggleNC() { this.ncOn ? this.closeAll() : this.openNC(); }
  openCC() { this.closeAll(); this.ccOn = true; this.refreshCC(); this.cc.style.transition = ''; this.cc.style.transform = ''; this.cc.classList.add('on'); this.scrim.classList.add('on'); sfx.play('swoosh'); }
  openNC() { this.closeAll(); this.ncOn = true; this.refreshNC(); this.nc.style.transition = ''; this.nc.style.transform = ''; this.nc.classList.add('on'); this.scrim.classList.add('on'); sfx.play('swoosh'); }
  closeAll() {
    for (const [el, k] of [[this.cc, 'ccOn'], [this.nc, 'ncOn']]) { el.style.transition = ''; el.style.transform = ''; el.classList.remove('on'); this[k] = false; }
    this.sp.classList.remove('on'); this.spOn = false;
    this.scrim.classList.remove('on');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* interactive pull-down */
  drag(side, dy) {
    const el = side === 'cc' ? this.cc : this.nc;
    const total = el.offsetHeight + (side === 'cc' ? 30 : 4);
    if (!this._pulling) { this._pulling = side; if (side === 'cc') { this.refreshCC(); } else { this.refreshNC(); } this.scrim.classList.add('on'); }
    const off = -total + clamp(dy * 1.1, 0, total + 24);
    el.style.transition = 'none'; el.style.transform = `translateY(${off}px)`;
  }
  release(side, dy, vy) {
    const el = side === 'cc' ? this.cc : this.nc;
    this._pulling = null;
    el.style.transition = '';
    const open = dy > 90 || vy > .5;
    if (open) { el.style.transform = ''; el.classList.add('on'); if (side === 'cc') this.ccOn = true; else this.ncOn = true; sfx.play('swoosh'); }
    else { el.style.transform = ''; el.classList.remove('on'); this.scrim.classList.remove('on'); }
  }
  dragUp(el, side) {
    let y0 = null, id = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button,.slider,input')) return; y0 = e.clientY; id = e.pointerId; });
    el.addEventListener('pointermove', e => { if (y0 == null || e.pointerId !== id) return; const dy = (e.clientY - y0) / (window.__scale || 1); if (dy < -8) { el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; } });
    el.addEventListener('pointerup', e => { if (y0 == null) return; const dy = (e.clientY - y0) / (window.__scale || 1); y0 = null; el.style.transition = ''; el.style.transform = ''; if (dy < -70) this.closeAll(); });
  }
}
