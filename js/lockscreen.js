// Lock screen for one surface. Duo has Touch ID in the side button: press to wake, touch/press again to unlock.
// Swiping up offers the passcode pad instead (hint: 1234).
import { h, svg, icon, fmtTime, fmtDate } from './util.js';
import { sfx } from './audio.js';
import { applyWallpaper } from './wallpaper.js';
import { weatherWidget, calendarWidget, musicWidget } from './widgets.js';
import { dragGesture } from './scroll.js';
import { appIcon } from './icons.js';

export class LockScreen {
  constructor(surface) {
    this.s = surface; this.os = surface.os; this.passOpen = false; this.passcode = '';
    this.build();
  }

  build() {
    const os = this.os, s = this.s;
    this.bg = h('div.lk-bg');
    this.date = h('div.lk-date');
    this.time = h('div.lk-time');
    this.list = h('div.lk-notifs');
    this.widgets = h('div.lk-widgets');
    this.torch = h('button.lk-round', { onclick: () => { sfx.play('tick'); os.toggle('torch'); } }, svg('<path d="M8 3h8l-1.500 6h-5L8 3Zm2.500 6h3v3.500l1.500 2.500V21a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6l1.500-2.500V9Z" fill="currentColor"/>'));
    this.cam = h('button.lk-round', { onclick: () => os.lockCamera(s) }, svg('<path d="M4 8.500h3.200l1.300-2h7l1.300 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" fill="currentColor"/><circle cx="12" cy="13.500" r="3.500" fill="#000" opacity=".7"/>'));
    this.hint = h('div.lk-hint', { html: '<span class="fp"></span>Press the side button to unlock' });
    this.pass = this.buildPass();
    this.main = h('div.lk-main', {}, this.date, this.time, this.widgets, this.list, h('div.lk-bottom', {}, this.torch, this.cam), this.hint);
    this.el = h('div.u-lock', {}, this.bg, this.main, this.pass);

    dragGesture(this.el, {
      lock: 8,
      filter: e => !e.target.closest('.lk-round,.lk-pass,.notif,.widget'),
      onStart: ({ dy }) => dy < 0 && !this.passOpen,
      onMove: ({ dy }) => { if (dy < 0) this.el.style.transform = `translateY(${dy}px)`; },
      onEnd: ({ dy, vy }) => { if (dy < -150 || vy < -.6) { this.snap(); this.showPass(); } else this.snap(); },
    });
    this.el.addEventListener('click', e => { if (!e.target.closest('.lk-round,.lk-pass,.notif,.widget')) { /* tap does nothing, like iOS */ } });
  }

  layout() {
    const s = this.s, id = this.os.sys.wallpaper;
    // panels show their slice of one shared wallpaper
    if (s.kind === 'panel') {
      const land = s.w > s.h, off = s.slice * (land ? s.h : s.w);
      applyWallpaper(this.bg, id, land ? s.w : s.w * 2, land ? s.h * 2 : s.h);
      this.bg.style.backgroundSize = land ? `${s.w}px ${s.h * 2}px` : `${s.w * 2}px ${s.h}px`;
      this.bg.style.backgroundPosition = land ? `0 -${off}px` : `-${off}px 0`;
    } else applyWallpaper(this.bg, id, s.w, s.h);
    const showTime = s.kind !== 'panel' || s.slice === 0;
    this.date.style.display = this.time.style.display = showTime ? '' : 'none';
    this.widgets.style.display = s.kind === 'panel' && s.slice === 1 ? '' : 'none';
    if (s.kind === 'panel' && s.slice === 1 && !this.widgets.childElementCount) this.buildWidgets();
    // scale the tall clock to the available height
    const land = s.w > s.h;
    const size = land && s.h < 500 ? 150 : 214;
    this.time.style.fontSize = size + 'px'; this.time.style.height = size + 'px';
    this.time.style.top = (land && s.h < 500 ? 56 : 66) + 'px';
    this.list.style.maxWidth = s.w >= 780 ? '380px' : '';
    this.tick(new Date());
    this.renderNotifs();
  }

  buildWidgets() {
    const os = this.os;
    const a = weatherWidget('s'), b = calendarWidget('s'), m = musicWidget(os);
    m._disp = this.s;
    this.widgets.append(h('div.lk-today', {}, 'Today'), h('div.lk-wrow', {}, a, b), h('div.lk-wrow.one', {}, m));
    a.addEventListener('click', () => os.openFromLock('weather', this.s));
    b.addEventListener('click', () => os.openFromLock('calendar', this.s));
    m.addEventListener('click', e => { e.stopImmediatePropagation(); os.openFromLock('music', this.s); }, true);
    os.on('music', () => m._upd && m._upd());
  }

  setLocked(locked, { animate = true } = {}) {
    const el = this.el;
    el.style.transition = animate ? 'transform .6s cubic-bezier(.3,.9,.25,1), opacity .45s, filter .5s' : 'none';
    if (locked) { el.style.transform = ''; el.style.opacity = '1'; el.style.filter = ''; el.style.pointerEvents = ''; this.hidePass(); this.hint.classList.add('on'); }
    else { el.style.transform = `translateY(-${this.s.h + 40}px) scale(1.06)`; el.style.opacity = '0'; el.style.filter = 'blur(18px)'; el.style.pointerEvents = 'none'; this.hint.classList.remove('on'); this.hidePass(); }
  }
  snap() { this.el.style.transition = 'transform .45s cubic-bezier(.2,1.1,.3,1)'; this.el.style.transform = ''; }

  /* ----- passcode ----- */
  buildPass() {
    this.dots = h('div.pc-dots', {}, ...Array.from({ length: 4 }, () => h('i')));
    this.passMsg = h('div.pc-msg', 'Enter Passcode');
    const letters = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };
    const key = n => h('button.pc-key', { onclick: () => this.digit(String(n)) }, h('b', {}, n), letters[n] ? h('small', {}, letters[n]) : null);
    const pad = h('div.pc-pad', {}, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key), h('span'), key(0), h('button.pc-cancel', { onclick: () => this.hidePass() }, 'Cancel'));
    return h('div.lk-pass', {}, h('div.pc-inner', {}, this.passMsg, this.dots, pad, h('div.pc-hint', 'Hint: 1 2 3 4')));
  }
  showPass() { this.passOpen = true; this.passcode = ''; this.updDots(); this.pass.classList.add('on'); sfx.play('tick'); }
  hidePass() { this.passOpen = false; this.pass.classList.remove('on'); }
  updDots() { [...this.dots.children].forEach((d, i) => d.classList.toggle('f', i < this.passcode.length)); }
  digit(n) {
    if (this.passcode.length >= 4) return;
    sfx.play('key'); this.passcode += n; this.updDots();
    if (this.passcode.length === 4) {
      setTimeout(() => {
        if (this.passcode === '1234') { this.hidePass(); this.os.unlock(); }
        else {
          sfx.play('error'); this.passMsg.textContent = 'Try Again';
          this.dots.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(14px)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 380 });
          this.passcode = ''; this.updDots(); setTimeout(() => this.passMsg.textContent = 'Enter Passcode', 1400);
        }
      }, 140);
    }
  }

  /* ----- content ----- */
  tick(now) {
    const ds = fmtDate(now); if (ds !== this._d) { this._d = ds; this.date.textContent = ds; }
    const t = fmtTime(now, { h24: this.os.sys.h24 });
    if (t !== this._t) {
      this._t = t;
      this.time.replaceChildren(...t.split('').map(c => h('span' + (c === ':' ? '.colon' : ''), {}, c)));
    }
  }
  renderNotifs() {
    const ns = this.os.notifications;
    this.list.replaceChildren(...ns.slice(0, 3).map(n => {
      const el = h('div.notif', {}, h('div.n-ico', {}, appIcon(n.app, 38)),
        h('div.n-txt', {}, h('div.n-top', {}, h('b', {}, n.title), h('small', {}, n.when || 'now')), h('div.n-body', {}, n.body)));
      el.addEventListener('click', () => this.os.openFromLock(n.app, this.s, n));
      return el;
    }));
  }
}
