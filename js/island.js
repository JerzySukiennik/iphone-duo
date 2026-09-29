// Dynamic Island: one per display. Shows live activities (music, timer, call, recording) and transient toasts.
import { h, svg, ICON } from './util.js';

const SIZES = { idle: [26, 26, 13], compact: [46, 122, 23], expanded: [344, 160, 40], toast: [178, 46, 23], faceid: [66, 66, 33], big: [344, 84, 40] };

export class Island {
  constructor(display) {
    this.d = display; this.os = display.os;
    this.expanded = false; this.toast = null; this.act = null; this.node = null; this.mode = 'idle';
    this.sensor = h('i.isl-sensor');
    this.body = h('div.isl-body');
    this.el = h('div.island', { onclick: e => this.onTap(e) }, this.sensor, this.body);
    this.apply('idle');
  }

  onTap(e) {
    if (e.target.closest('button,input,.isl-ctl')) return;
    if (this.toast) return;
    if (this.act) { this.expanded = !this.expanded; this.sync(true); }
  }
  collapse() { if (this.expanded) { this.expanded = false; this.sync(true); } }

  /** Called when os activities change or once per second. */
  sync(force = false) {
    if (this.toast) return;
    const acts = [...this.os.activities.values()].sort((a, b) => b.priority - a.priority);
    const act = acts[0] || null;
    const mode = !act ? 'idle' : this.expanded ? 'expanded' : 'compact';
    if (act !== this.act || mode !== this.mode || force) {
      this.act = act;
      if (!act) this.expanded = false;
      this.mode = mode;
      this.node = act ? act.mount(this.d.id, mode) : null;
      this.body.replaceChildren(...(this.node ? [this.node] : []));
      const size = SIZES[mode].slice();
      if (mode === 'expanded' && act.height) size[1] = act.height;
      this.apply(mode, size);
    }
    if (this.act && this.node && this.act.update) this.act.update(this.node, this.mode, this.d.id);
  }

  apply(mode, size = SIZES[mode]) {
    const s = this.el.style;
    s.width = size[0] + 'px'; s.height = size[1] + 'px'; s.borderRadius = size[2] + 'px';
    this.el.dataset.mode = mode;
    this.sensor.style.opacity = mode === 'idle' || mode === 'compact' || mode === 'toast' ? 1 : 0;
    this.d.ui.classList.toggle('island-open', mode === 'expanded' || mode === 'big');
  }

  /** Show a transient toast in the island for `ms`. content is a Node; kind picks the size. */
  flash(content, ms = 1600, kind = 'toast') {
    clearTimeout(this._ft);
    this.toast = { content };
    this.mode = kind;
    this.body.replaceChildren(content);
    this.apply(kind);
    this._ft = setTimeout(() => { this.toast = null; this.expanded = false; this.mode = 'x'; this.sync(true); }, ms);
  }

  silent(on) {
    const bell = svg(on
      ? '<path d="M12 3.500a5.500 5.500 0 0 0-5.500 5.500v3.500L4.500 16h15l-2-3.500V9A5.500 5.500 0 0 0 12 3.500ZM10 18.500a2 2 0 0 0 4 0" fill="currentColor"/><path d="M4 4l16 16" stroke="#ff453a" stroke-width="2.200" stroke-linecap="round"/>'
      : '<path d="M12 3.500a5.500 5.500 0 0 0-5.500 5.500v3.500L4.500 16h15l-2-3.500V9A5.500 5.500 0 0 0 12 3.500ZM10 18.500a2 2 0 0 0 4 0" fill="currentColor"/>');
    bell.style.color = on ? '#ff453a' : '#fff';
    this.flash(h('div.isl-toast', {}, h('span.ib', {}, bell), h('span', {}, on ? 'Silent' : 'Ring')), 1500);
  }

  touchId(state) { // 'scan' | 'ok' | 'fail'
    const col = state === 'ok' ? '#30d158' : state === 'fail' ? '#ff453a' : '#fff';
    const w = h('div.isl-faceid', { html: `<svg viewBox="0 0 40 40" width="38" height="38"><g fill="none" stroke="${col}" stroke-width="2.200" stroke-linecap="round">
      <path d="M11 17a9 9 0 0 1 18 0M8.500 22.500c0-2.500.500-5 .500-5.500M31 22c0-1.700-.2-3-.5-4.300M14 30c1.700-2.500 2-5 2-8a4 4 0 0 1 8 0c0 4-.6 7-2.400 10M11 26.500c.7-1.700 1-3.500 1-5.500a8 8 0 0 1 16 0c0 3.500-.4 6.500-1.600 9.500M20 22c0 3.500-.2 5.500-1.200 8"/></g></svg>` });
    this.flash(w, state === 'scan' ? 900 : 700, 'faceid');
  }
}

/** Common activity element builders. */
export function waveform(n = 4) {
  return h('div.wave', {}, ...Array.from({ length: n }, (_, i) => h('i', { style: { animationDelay: (i * .17) + 's' } })));
}
export { ICON };
