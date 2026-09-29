// Home screen. Layout adapts to the surface: wide inner canvas (featured widget + icon grid),
// portrait outer display / panels (widgets + grid) or a short landscape strip (icons only).
import { h, icon } from './util.js';
import { appIcon } from './icons.js';
import { weatherWidget, calendarWidget, LIB_FEATURED, featuredWidget } from './widgets.js';
import { sfx } from './audio.js';

export const DOCK = ['phone', 'safari', 'messages', 'music'];
export const GRID = ['camera', 'photos', 'reels', 'clock', 'calendar', 'notes', 'calculator', 'weather', 'settings'];

export class HomeView {
  constructor(surface) {
    this.s = surface; this.os = surface.os;
    this.el = h('div.u-home');
    this.icons = {};
    this.widgets = [];
  }

  iconRect(id) {
    const el = this.icons[id]; if (!el) return null;
    return this.s.rectOf(el);
  }

  render() {
    const s = this.s, os = this.os;
    this.icons = {}; this.widgets = [];
    const wide = s.w >= 780, portrait = s.h > s.w;
    this.el.replaceChildren();

    const mkApp = id => {
      const meta = os.appMeta(id);
      const ico = appIcon(meta.icon || id, 60);
      this.icons[id] = ico;
      const wrap = h('div.bwrap', {}, ico);
      const b = os.badge(id);
      if (b) wrap.append(h('span.badge', {}, b));
      const el = h('div.happ', { dataset: { app: id } }, wrap, h('span.lbl', {}, meta.name));
      el.addEventListener('click', () => { sfx.play('tick'); os.launch(id, s, s.rectOf(ico)); });
      return el;
    };

    const body = h('div.home-body');
    const cols = wide ? 4 : (portrait ? 4 : Math.max(4, Math.floor((s.w - 28 - 84) / 88)));
    const mkGrid = (...kids) => { const g = h('div.hgrid', { style: { gridTemplateColumns: `repeat(${cols}, 60px)` } }, ...kids); return g; };
    const wgt = (w, key) => { w._disp = s; this.widgets.push(w); w.addEventListener('click', () => os.launch(key, s, s.rectOf(w))); return w; };

    const items = [];
    if (portrait || wide) items.push(wgt(weatherWidget('s'), 'weather'), wgt(calendarWidget('s'), 'calendar'));
    GRID.forEach(id => items.push(mkApp(id)));
    const right = h('div.hcol.r', {}, mkGrid(...items));

    if (wide) {
      const feat = featuredWidget(os); feat._disp = s; this.widgets.push(feat);
      feat.addEventListener('click', () => os.launch('photos', s, s.rectOf(feat)));
      body.append(h('div.hcol.l', {}, feat), right);
    } else body.append(right);

    // vertical dock on the right edge (iOS 27 Duo)
    const dock = h('div.dock', {}, ...DOCK.map(id => {
      const meta = os.appMeta(id), ico = appIcon(meta.icon || id, 56);
      this.icons[id] = ico;
      ico.dataset.app = id;
      ico.addEventListener('click', () => { sfx.play('tick'); os.launch(id, s, s.rectOf(ico)); });
      const b = os.badge(id), wrap = h('div.bwrap', {}, ico);
      if (b) wrap.append(h('span.badge', {}, b));
      return wrap;
    }));
    const search = h('button.searchbtn', { onclick: () => s.openSpotlight() }, icon('search'));
    this.el.append(body, dock, search);
  }

  tick() {
    const now = Date.now();
    this.widgets.forEach(w => {
      w._upd && w._upd();
      if (w._tick && now - (w._last || 0) > w._every) { w._last = now; if (w._last0) w._tick(); w._last0 = true; }
    });
  }
}
