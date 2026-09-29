// Photos — library grid + viewer. Shows what the Camera captures (IndexedDB) plus the sample library.
// Wide: grid on the left, viewer on the right (like the Split View library on the real Duo). Compact: grid -> full-screen viewer.
import { h, icon, svg, ICON, clamp, store, idb, pad, DAYS, MONTHS } from '../util.js';
import { App } from './app.js';
import { LIBRARY } from '../data.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';

const FILTERS = [
  { id: 'orig', name: 'Original', f: '' }, { id: 'vivid', name: 'Vivid', f: 'saturate(1.35) contrast(1.08)' }, { id: 'warm', name: 'Warm', f: 'sepia(.22) saturate(1.15) hue-rotate(-8deg)' },
  { id: 'cool', name: 'Cool', f: 'saturate(1.05) hue-rotate(14deg)' }, { id: 'fade', name: 'Fade', f: 'contrast(.88) brightness(1.08) saturate(.82)' }, { id: 'noir', name: 'Noir', f: 'grayscale(1) contrast(1.18)' }, { id: 'mono', name: 'Mono', f: 'grayscale(1)' },
];
const fmtDur = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const dayLabel = ts => {
  const d = new Date(ts), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return `${DAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
};

export default class Photos extends App {
  constructor(os, win) {
    super(os, win);
    this.items = []; this.tab = 'all'; this.sel = null; this.selectMode = false; this.picked = new Set();
    this.fav = new Set(store.get('photos.fav', [])); this.hidden = new Set(store.get('photos.hidden', []));
    this.urls = []; this.editing = false; this.edit = { f: 0, br: 0, ct: 0, sat: 0, warm: 0 };
    this.zoom = 1; this.pan = { x: 0, y: 0 };
  }
  statusTone() { return this.win.el.clientWidth >= 700 || this.viewerOpen ? 'light' : 'dark'; } // wide: the black viewer pane sits under the status corner

  build() {
    this.title = h('div.pho-title', {}, 'Library');
    this.selBtn = h('button.pho-btn', { onclick: () => this.toggleSelect() }, 'Select');
    this.head = h('div.pho-head', {}, this.title, this.selBtn);
    this.grid = h('div.pho-grid');
    this.scroller = h('div.pho-scroll', {}, this.grid); dragScroll(this.scroller);
    this.tabs = h('div.pho-tabs');
    this.selBar = h('div.pho-selbar');
    this.listPane = h('div.pho-list', {}, this.head, this.scroller, this.tabs, this.selBar);

    this.stage = h('div.pho-stage');
    this.viewer = h('div.pho-viewer', {}, this.stage);
    this.vbar = h('div.pho-vbar');
    this.vback = h('button.pho-vback', { onclick: () => this.closeViewer() }, icon('chevronL', 20), h('span', {}, 'Library'));
    this.vcap = h('div.pho-vcap');
    this.editPane = h('div.pho-edit');
    this.empty = h('div.pho-empty', {}, icon('photo', 44), h('div', {}, 'Select a photo'));
    this.viewer.append(this.vback, this.vbar, this.vcap, this.editPane, this.empty);
    this.root = h('div.pho', {}, this.listPane, this.viewer);
    this.renderTabs();
    this.bindViewer();
    this.refresh();
    this.os.on('photo', () => this.refresh());
    this.root.tabIndex = -1;
    this.root.addEventListener('keydown', e => {
      if (e.target.matches('input')) return;
      if (e.key === 'ArrowRight') this.step(1); else if (e.key === 'ArrowLeft') this.step(-1); else if (e.key === 'Escape' && this.viewerOpen) this.closeViewer(); else if (e.key === 'f') this.toggleFav(); else if (e.key === 'Backspace' || e.key === 'Delete') this.deleteCurrent();
    });
    this.root.addEventListener('pointerdown', () => this.root.focus({ preventScroll: true }));
    return this.root;
  }

  /* ------------------------------------------------------------------ data */
  async refresh() {
    const mine = (await idb.all()).sort((a, b) => b.ts - a.ts);
    this.urls.forEach(u => URL.revokeObjectURL(u)); this.urls = [];
    const own = mine.map(r => { const src = URL.createObjectURL(r.blob); this.urls.push(src); const poster = r.poster ? URL.createObjectURL(r.poster) : null; if (poster) this.urls.push(poster); return { id: r.id, type: r.type, src, poster, ts: r.ts, w: r.w, h: r.h, dur: r.dur, user: true }; });
    const lib = LIBRARY.filter(l => !this.hidden.has(l.id)).map(l => ({ id: l.id, type: 'photo', src: l.src, ts: l.ts, w: 900, h: 1200, user: false }));
    this.all = [...own, ...lib].sort((a, b) => b.ts - a.ts);
    this.applyTab();
  }
  applyTab() {
    const f = { all: () => true, fav: i => this.fav.has(i.id), video: i => i.type === 'video', mine: i => i.user }[this.tab];
    this.items = this.all.filter(f);
    this.title.textContent = { all: 'Library', fav: 'Favorites', video: 'Videos', mine: 'Camera Roll' }[this.tab];
    if (this.sel && !this.items.includes(this.sel)) this.sel = this.items.find(i => i.id === this.sel.id) || null;
    this.renderGrid(); this.renderViewer();
  }
  renderTabs() {
    const t = (id, label, ic) => h('button.pho-tab' + (this.tab === id ? '.on' : ''), { onclick: () => { sfx.play('tick'); this.tab = id; this.renderTabs(); this.applyTab(); this.scroller.scrollTop = 0; } }, icon(ic, 19), h('span', {}, label));
    this.tabs.replaceChildren(t('all', 'Library', 'photo'), t('fav', 'Favorites', 'heart'), t('video', 'Videos', 'play'), t('mine', 'Camera Roll', 'camflip'));
  }

  /* ------------------------------------------------------------------ grid */
  renderGrid() {
    if (!this.items.length) { this.grid.replaceChildren(h('div.pho-none', {}, icon(this.tab === 'fav' ? 'heart' : 'photo', 40), h('b', {}, this.tab === 'fav' ? 'No Favorites' : this.tab === 'video' ? 'No Videos' : 'No Photos'), h('span', {}, this.tab === 'mine' ? 'Take a photo with the Camera app.' : 'Nothing here yet.'))); return; }
    const kids = []; let last = '';
    this.items.forEach(it => {
      const lbl = dayLabel(it.ts);
      if (lbl !== last) { last = lbl; kids.push(h('div.pho-day', {}, lbl)); }
      const cell = h('div.pho-cell' + (this.sel === it ? '.on' : '') + (this.picked.has(it.id) ? '.picked' : ''), { dataset: { id: it.id }, onclick: e => this.clickCell(it, cell) },
        h('img', { src: it.poster || it.src, loading: 'lazy', draggable: false }),
        it.type === 'video' ? h('span.pho-dur', {}, icon('play', 9), ' ' + fmtDur(it.dur || 0)) : null,
        this.fav.has(it.id) ? h('span.pho-fav', {}, icon('heart', 12)) : null,
        this.selectMode ? h('span.pho-check', {}, icon('check', 13)) : null);
      kids.push(cell);
    });
    this.grid.replaceChildren(...kids);
  }
  clickCell(it, cell) {
    if (this.selectMode) { this.picked.has(it.id) ? this.picked.delete(it.id) : this.picked.add(it.id); cell.classList.toggle('picked'); sfx.play('tick'); this.renderSelBar(); return; }
    sfx.play('tick'); this.open(it, cell);
  }
  toggleSelect() {
    this.selectMode = !this.selectMode; this.picked.clear(); this.selBtn.textContent = this.selectMode ? 'Cancel' : 'Select';
    this.root.classList.toggle('selecting', this.selectMode); this.renderGrid(); this.renderSelBar();
  }
  renderSelBar() {
    if (!this.selectMode) { this.selBar.classList.remove('on'); return; }
    this.selBar.classList.add('on');
    const n = this.picked.size;
    this.selBar.replaceChildren(h('span', {}, n ? `${n} Selected` : 'Select Items'),
      h('button', { disabled: !n, onclick: () => this.bulkFav() }, icon('heart', 20)),
      h('button', { disabled: !n, onclick: () => this.bulkDelete() }, icon('trash', 20)));
  }
  bulkFav() { this.picked.forEach(id => this.fav.add(id)); store.set('photos.fav', [...this.fav]); this.toggleSelect(); this.applyTab(); }
  async bulkDelete() { for (const id of [...this.picked]) await this.remove(this.all.find(i => i.id === id)); this.toggleSelect(); await this.refresh(); }

  /* ---------------------------------------------------------------- viewer */
  open(it, cell) {
    this.sel = it; this.viewerOpen = true; this.zoom = 1; this.pan = { x: 0, y: 0 }; this.editing = false;
    this.root.classList.add('viewing'); this.root.classList.remove('editing');
    this.renderGrid(); this.renderViewer();
    if (!this.isWide()) this.viewer.animate([{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.25,1)' });
    this.win.surface && this.win.surface.updateTone();
  }
  isWide() { return this.win.el.clientWidth >= 700; }
  closeViewer() {
    if (this.editing) { this.cancelEdit(); return; }
    this.viewerOpen = false; this.root.classList.remove('viewing');
    if (this.isWide()) { /* the right pane stays */ } this.stopVideo();
    this.win.surface && this.win.surface.updateTone();
  }
  stopVideo() { const v = this.stage.querySelector('video'); if (v) v.pause(); }
  step(d) {
    if (!this.sel) return; const i = this.items.indexOf(this.sel), n = this.items[clamp(i + d, 0, this.items.length - 1)];
    if (n === this.sel) return; this.sel = n; this.zoom = 1; this.pan = { x: 0, y: 0 }; this.renderViewer(d);
    const cell = this.grid.querySelector(`[data-id="${CSS.escape(n.id)}"]`); if (cell) { this.grid.querySelectorAll('.pho-cell.on').forEach(c => c.classList.remove('on')); cell.classList.add('on'); cell.scrollIntoView({ block: 'nearest' }); }
  }
  renderViewer(dir = 0) {
    const it = this.sel;
    this.viewer.classList.toggle('has', !!it);
    this.empty.style.display = it ? 'none' : '';
    this.stage.replaceChildren(); this.vbar.replaceChildren(); this.vcap.textContent = '';
    if (!it) return;
    const el = it.type === 'video'
      ? h('video.pho-media', { src: it.src, poster: it.poster || '', playsinline: true, loop: true, autoplay: true, muted: false })
      : h('img.pho-media', { src: it.src, draggable: false });
    if (it.type === 'video') { el.setAttribute('playsinline', ''); el.volume = .8; el.play().catch(() => { el.muted = true; el.play().catch(() => { }); }); }
    this.media = el; this.applyXform(); this.stage.append(el);
    if (dir) el.animate([{ opacity: 0, transform: `translateX(${dir * 60}px)` }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    const d = new Date(it.ts);
    this.vcap.replaceChildren(h('b', {}, dayLabel(it.ts)), h('small', {}, d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })));
    const b = (ic, fn, on, title) => h('button.edgebtn' + (on ? '.on' : ''), { title, onclick: e => { e.stopPropagation(); fn(); } }, icon(ic, 20));
    this.vbar.replaceChildren(
      b('heart', () => this.toggleFav(), this.fav.has(it.id), 'Favorite'), b('share', () => this.share(), false, 'Share'), b('sliders', () => this.startEdit(), false, 'Edit'), b('trash', () => this.deleteCurrent(), false, 'Delete'));
    this.vbar.querySelector('.edgebtn.on') && (this.vbar.querySelector('.edgebtn.on').firstChild.firstChild.style.fill = '#ff3b5c');
  }
  applyXform() {
    if (!this.media) return;
    const e = this.editing ? this.editFilter() : '';
    this.media.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    this.media.style.filter = e;
    this.stage.classList.toggle('zoomed', this.zoom > 1.02);
  }
  bindViewer() {
    const st = this.stage; let d = null;
    st.addEventListener('pointerdown', e => { if (this.editing && e.target.closest('.pho-edit')) return; d = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, t: performance.now(), moved: false, id: e.pointerId }; });
    st.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return; const k = window.__scale || 1, dx = (e.clientX - d.x) / k, dy = (e.clientY - d.y) / k;
      if (!d.moved && Math.hypot(dx, dy) > 6) { d.moved = true; st.setPointerCapture(e.pointerId); }
      if (!d.moved) return;
      if (this.zoom > 1.02) { this.pan = { x: d.px + dx, y: d.py + dy }; this.applyXform(); }
      else if (this.media) { this.media.style.transition = 'none'; this.media.style.transform = `translate(${dx}px, ${Math.max(0, dy) * (this.isWide() ? 0 : 1)}px) scale(${1 - Math.max(0, dy) / 1400})`; d.dx = dx; d.dy = dy; this.viewer.style.setProperty('--dim', String(clamp(1 - Math.max(0, dy) / 300, .3, 1))); }
    });
    const up = e => {
      if (!d || e.pointerId !== d.id) return; const s = d; d = null;
      if (this.media) this.media.style.transition = '';
      this.viewer.style.setProperty('--dim', '1');
      if (!s.moved) { const now = performance.now(); if (now - (this.lastTap || 0) < 300) { this.zoom = this.zoom > 1.02 ? 1 : 2.4; this.pan = { x: 0, y: 0 }; this.applyXform(); this.lastTap = 0; } else this.lastTap = now; if (this.sel && this.sel.type === 'video' && this.zoom <= 1.02) setTimeout(() => { if (this.lastTap && performance.now() - this.lastTap >= 290 && this.media) this.media.paused ? this.media.play() : this.media.pause(); }, 300); return; }
      if (this.zoom > 1.02) return;
      if (s.dy > 110 && !this.isWide()) { this.closeViewer(); this.applyXform(); return; }
      if (Math.abs(s.dx || 0) > 70) this.step(s.dx < 0 ? 1 : -1); else this.applyXform();
    };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey) && this.zoom <= 1.02) return; e.preventDefault();
      this.zoom = clamp(this.zoom - e.deltaY * (e.ctrlKey ? .01 : .004), 1, 6); if (this.zoom <= 1.02) this.pan = { x: 0, y: 0 }; this.applyXform();
    }, { passive: false });
  }

  /* --------------------------------------------------------------- actions */
  toggleFav() {
    if (!this.sel) return; const id = this.sel.id; this.fav.has(id) ? this.fav.delete(id) : this.fav.add(id); store.set('photos.fav', [...this.fav]); sfx.play('like');
    this.renderViewer(); this.renderGrid();
    if (this.tab === 'fav') this.applyTab();
  }
  async share() {
    try { const b = await (await fetch(this.sel.src)).blob(); if (navigator.clipboard && window.ClipboardItem && b.type === 'image/png') await navigator.clipboard.write([new ClipboardItem({ [b.type]: b })]); } catch { /* */ }
    sfx.play('sent'); this.toast('Copied');
  }
  toast(msg) { const t = h('div.pho-toast', {}, msg); this.root.append(t); setTimeout(() => t.classList.add('gone'), 1200); setTimeout(() => t.remove(), 1600); }
  async remove(it) { if (!it) return; if (it.user) await idb.del(it.id); else { this.hidden.add(it.id); store.set('photos.hidden', [...this.hidden]); } this.fav.delete(it.id); }
  async deleteCurrent() {
    const it = this.sel; if (!it) return; const i = this.items.indexOf(it);
    await this.remove(it); sfx.play('pop');
    await this.refresh();
    this.sel = this.items[Math.min(i, this.items.length - 1)] || null;
    if (!this.sel) this.closeViewer();
    this.renderGrid(); this.renderViewer();
  }

  /* ------------------------------------------------------------------ edit */
  editFilter() {
    const e = this.edit, f = FILTERS[e.f].f;
    return [f, `brightness(${1 + e.br / 100})`, `contrast(${1 + e.ct / 100})`, `saturate(${1 + e.sat / 100})`, e.warm ? `sepia(${Math.abs(e.warm) / 200}) hue-rotate(${e.warm > 0 ? -10 : 18}deg)` : ''].filter(Boolean).join(' ');
  }
  startEdit() {
    if (!this.sel || this.sel.type === 'video') { this.toast('Editing photos only'); return; }
    this.editing = true; this.edit = { f: 0, br: 0, ct: 0, sat: 0, warm: 0 }; this.root.classList.add('editing');
    const slider = (key, label, min = -50, max = 50) => {
      const input = h('input', { type: 'range', min, max, value: this.edit[key], 'data-nodrag': '' });
      const val = h('span', {}, '0');
      input.addEventListener('input', () => { this.edit[key] = +input.value; val.textContent = input.value; this.applyXform(); });
      return h('label.pho-sl', {}, h('div', {}, h('span', {}, label), val), input);
    };
    const chips = h('div.pho-chips', {}, ...FILTERS.map((f, i) => h('button.pho-chip' + (i === 0 ? '.on' : ''), { onclick: e => { this.edit.f = i; chips.querySelectorAll('.pho-chip').forEach((c, j) => c.classList.toggle('on', j === i)); this.applyXform(); } },
      h('i', { style: { backgroundImage: `url(${this.sel.src})`, filter: f.f } }), h('span', {}, f.name))));
    this.editPane.replaceChildren(
      h('div.pho-ehead', {}, h('button', { onclick: () => this.cancelEdit() }, 'Cancel'), h('b', {}, 'Edit'), h('button.done', { onclick: () => this.saveEdit() }, 'Done')),
      chips, slider('br', 'Exposure'), slider('ct', 'Contrast'), slider('sat', 'Saturation'), slider('warm', 'Warmth'));
    this.applyXform();
  }
  cancelEdit() { this.editing = false; this.root.classList.remove('editing'); this.applyXform(); }
  async saveEdit() {
    const it = this.sel, img = this.media; const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d');
    if ('filter' in g) g.filter = this.editFilter(); g.drawImage(img, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
    const rec = { id: 'p-' + Date.now(), type: 'photo', blob, ts: Date.now(), w: c.width, h: c.height };
    await idb.put(rec); sfx.play('recStop'); this.editing = false; this.root.classList.remove('editing');
    await this.refresh(); this.sel = this.items.find(i => i.id === rec.id) || this.items[0]; this.renderGrid(); this.renderViewer(); this.toast('Saved as new photo');
  }

  onClose() { this.stopVideo(); }
  destroy() { this.urls.forEach(u => URL.revokeObjectURL(u)); }
}
