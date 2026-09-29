// Camera — real getUserMedia feed (or a demo scene when there is no camera), photo / video / portrait / Smart Take,
// zoom, timer, flash, grid, photographic styles, tap-to-focus with exposure, and Duo Preview for the outer display.
import { h, icon, svg, ICON, clamp, pad, idb, sleep } from '../util.js';
import { App } from './app.js';
import { sfx } from '../audio.js';

const STYLES = [
  { id: 'std', name: 'Standard', f: 'none' },
  { id: 'vivid', name: 'Vivid', f: 'saturate(1.35) contrast(1.08)' },
  { id: 'warm', name: 'Warm', f: 'sepia(.22) saturate(1.15) hue-rotate(-8deg)' },
  { id: 'cool', name: 'Cool', f: 'saturate(1.05) hue-rotate(14deg) brightness(1.02)' },
  { id: 'fade', name: 'Fade', f: 'contrast(.88) brightness(1.08) saturate(.82)' },
  { id: 'drama', name: 'Dramatic', f: 'contrast(1.28) saturate(1.1) brightness(.92)' },
  { id: 'noir', name: 'Noir', f: 'grayscale(1) contrast(1.18)' },
];
const MODES = ['VIDEO', 'PHOTO', 'PORTRAIT', 'SMART'];

/* ---------- demo scene used when no webcam is available ---------- */
class SceneSource {
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = 1280; this.c.height = 960; this.g = this.c.getContext('2d');
    this.img = new Image(); this.img.src = 'assets/img/p1015.jpg';
    this.noise = document.createElement('canvas'); this.noise.width = this.noise.height = 128;
    const ng = this.noise.getContext('2d'), id = ng.createImageData(128, 128);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 16; }
    ng.putImageData(id, 0, 0);
    this.birds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * 1280, y: 120 + Math.random() * 220, v: 40 + Math.random() * 40, p: Math.random() * 6 }));
    this.live = false;
  }
  get w() { return 1280; } get h() { return 960; } get el() { return this.c; }
  draw(t) {
    const g = this.g, W = 1280, H = 960;
    g.fillStyle = '#123'; g.fillRect(0, 0, W, H);
    if (this.img.complete && this.img.naturalWidth) {
      const iw = this.img.naturalWidth, ih = this.img.naturalHeight, s = Math.max(W / iw, H / ih) * (1.03 + Math.sin(t * .35) * .01);
      g.drawImage(this.img, W / 2 - iw * s / 2 + Math.sin(t * .6) * 9, H / 2 - ih * s / 2 + Math.cos(t * .45) * 7, iw * s, ih * s);
    }
    g.fillStyle = 'rgba(0,0,0,.55)';
    this.birds.forEach(b => { b.x += b.v / 60; if (b.x > W + 40) { b.x = -40; b.y = 120 + Math.random() * 220; } const f = Math.sin(t * 9 + b.p) * 7; g.beginPath(); g.moveTo(b.x - 14, b.y - f); g.quadraticCurveTo(b.x - 6, b.y - 8 + f, b.x, b.y); g.quadraticCurveTo(b.x + 6, b.y - 8 + f, b.x + 14, b.y - f); g.lineWidth = 2.2; g.strokeStyle = 'rgba(20,20,20,.7)'; g.stroke(); });
    g.globalCompositeOperation = 'overlay'; g.globalAlpha = .6; g.drawImage(this.noise, Math.random() * -64, Math.random() * -64, 1400, 1100); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

export default class Camera extends App {
  constructor(os, win) {
    super(os, win);
    this.mode = 'PHOTO'; this.zoom = 1; this.flash = 'auto'; this.timer = 0; this.grid = false; this.live = true; this.style = 0; this.ev = 0;
    this.front = false; this.smart = false; this.duoPreview = true; this.kidCue = false; this.recording = false; this.scene = new SceneSource();
    this.source = null; this.video = null; this.stream = null; this.usingScene = true; this.idle = 0; this.last = null; this.counting = false; this.t0 = performance.now();
    this.prevDiff = null;
  }
  statusTone() { return 'light'; }

  build() {
    this.canvas = h('canvas.cam-view');
    this.g = this.canvas.getContext('2d');
    this.depth = h('div.cam-depth');
    this.gridEl = h('div.cam-grid', {}, h('i'), h('i'), h('i'), h('i'));
    this.reticle = h('div.cam-focus', {}, h('i'), h('div.cam-ev', {}, icon('sun', 15)));
    this.count = h('div.cam-count');
    this.badge = h('div.cam-badge');
    this.flashEl = h('div.cam-flash');
    this.demoTag = h('div.cam-demo', {}, 'Demo scene · camera unavailable');
    this.zoomBar = h('div.cam-zoom');
    this.modeBar = h('div.cam-modes');
    this.styleBar = h('div.cam-styles');
    this.thumb = h('button.cam-thumb', { onclick: () => this.os.launch('photos', this.surface) });
    this.shutterBtn = h('button.cam-shutter', { onclick: () => this.shutter() }, h('i'));
    this.flipBtn = h('button.cam-flip', { onclick: () => { this.front = !this.front; sfx.play('pop'); this.renderBar(); } }, icon('camflip', 24));
    this.recTag = h('div.cam-rec', {}, h('i'), h('span', {}, '00:00'));
    this.top = h('div.cam-top');
    this.vf = h('div.cam-vf', {}, this.canvas, this.depth, this.gridEl, this.reticle, this.count, this.badge, this.flashEl, this.demoTag, this.recTag, this.top, this.styleBar);
    this.side = h('div.cam-side', {}, this.modeBar, h('div.cam-shrow', {}, this.thumb, this.shutterBtn, this.flipBtn));
    this.root = h('div.cam', {}, this.vf, this.side);
    this.renderBar(); this.renderZoom(); this.renderModes(); this.renderStyles();
    this.bindVf();
    this.buildPreview();
    new ResizeObserver(() => this.resize()).observe(this.vf);
    this.resize();
    this.loop();
    this.loadThumb();
    this.os.on('photo', rec => this.setThumb(rec));
    return this.root;
  }

  /* ---------------------------------------------------------------- stream */
  async startStream() {
    if (this.stream || this.starting) return; this.starting = true;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw 0;
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false });
      this.stream = s;
      this.video = h('video', { playsinline: true, muted: true, autoplay: true, style: { position: 'absolute', width: '2px', height: '2px', opacity: 0, pointerEvents: 'none' } });
      this.video.srcObject = s; this.root.append(this.video); await this.video.play();
      this.source = this.video; this.usingScene = false; this.demoTag.style.display = 'none';
    } catch { this.usingScene = true; this.source = this.scene; this.demoTag.style.display = ''; }
    this.starting = false;
  }
  stopStream() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.video) { this.video.remove(); this.video = null; }
    this.source = null;
  }
  resize() {
    const r = this.vf.getBoundingClientRect(), k = window.__scale || 1;
    const w = Math.max(2, Math.round(r.width / k)), hh = Math.max(2, Math.round(r.height / k));
    this.vw = w; this.vh = hh;
    const dpr = Math.min(1.5, Math.max(1, (window.devicePixelRatio || 1) * k));
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(hh * dpr);
  }

  /** crop rect (source coords) so the source fills a w:h viewport at the current zoom */
  crop(sw, sh, w, hh) {
    const s = Math.max(w / sw, hh / sh);
    let cw = w / s, ch = hh / s;
    const zc = Math.max(1, this.zoom);
    cw /= zc; ch /= zc;
    return [(sw - cw) / 2, (sh - ch) / 2, cw, ch];
  }
  drawTo(ctx, w, hh, filter) {
    const src = this.source; if (!src) return false;
    const sw = src === this.scene ? src.w : src.videoWidth, sh = src === this.scene ? src.h : src.videoHeight;
    if (!sw || !sh) return false;
    const [cx, cy, cw, ch] = this.crop(sw, sh, w, hh);
    ctx.save();
    if (filter) ctx.filter = filter;
    if (this.front) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src === this.scene ? src.el : src, cx, cy, cw, ch, 0, 0, w, hh);
    ctx.restore();
    return true;
  }

  loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const hidden = this.win.el.classList.contains('hidden') || this.win.el.style.visibility === 'hidden';
    if (hidden) { if (++this.idle > 60 && this.stream && !this.recording) this.stopStream(); return; }
    this.idle = 0;
    if (!this.source && !this.starting) this.startStream();
    const t = (performance.now() - this.t0) / 1000;
    if (this.source === this.scene) this.scene.draw(t);
    const ok = this.drawTo(this.g, this.canvas.width, this.canvas.height, null);
    this.canvas.style.filter = [STYLES[this.style].f === 'none' ? '' : STYLES[this.style].f, this.ev ? `brightness(${1 + this.ev * .5})` : ''].filter(Boolean).join(' ');
    if (this.recording) this.recTag.lastChild.textContent = this.recTime();
    if (this.prevCanvas && this.previewWanted()) this.drawPreview(t);
    if (this.waitingStill && ok && (++this.frame % 4 === 0)) this.checkStill();
  }
  frame = 0;

  /* --------------------------------------------------------------- capture */
  async shutter() {
    if (this.counting) { this.cancelCount(); return; }
    sfx.init();
    if (this.mode === 'VIDEO') return this.toggleRecord();
    if (this.mode === 'SMART' || this.smart) return this.smartTake();
    if (this.timer) return this.countThen(this.timer, () => this.snap());
    this.snap();
  }
  async countThen(n, fn) {
    this.counting = true; this.shutterBtn.classList.add('busy');
    for (let i = n; i > 0 && this.counting; i--) { this.showCount(i); sfx.play('tick'); await sleep(1000); }
    this.showCount(0);
    if (this.counting) { this.counting = false; this.shutterBtn.classList.remove('busy'); fn(); }
  }
  cancelCount() { this.counting = false; this.waitingStill = false; this.showCount(0); this.badge.textContent = ''; this.shutterBtn.classList.remove('busy'); }
  showCount(i) {
    this.count.textContent = i || ''; this.count.classList.toggle('on', !!i);
    if (this.prevCount) { this.prevCount.textContent = i || ''; this.prevCount.classList.toggle('on', !!i); }
  }
  smartTake() {
    this.counting = true; this.waitingStill = true; this.stillFor = 0; this.frame = 0; this.shutterBtn.classList.add('busy');
    this.badge.textContent = 'Smart Take · get ready…'; this.badge.classList.add('on');
    this.prevTag && (this.prevTag.textContent = 'Get ready…');
    this.smartTimeout = setTimeout(() => { if (this.waitingStill) this.finishSmart(); }, 6500);
  }
  checkStill() {
    // downsample and compare with the previous frame: "everyone is ready" when the scene holds still
    const c = this.diffC ||= (() => { const x = document.createElement('canvas'); x.width = 32; x.height = 24; return x; })();
    const gx = c.getContext('2d', { willReadFrequently: true });
    this.drawTo(gx, 32, 24, null);
    const d = gx.getImageData(0, 0, 32, 24).data; let diff = 0;
    if (this.prevDiff) for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - this.prevDiff[i]);
    this.prevDiff = d.slice();
    const avg = diff / (32 * 24);
    this.stillFor = avg < 4.5 ? this.stillFor + 1 : 0;
    if (this.stillFor > 8) this.finishSmart();
  }
  finishSmart() {
    clearTimeout(this.smartTimeout); this.waitingStill = false; this.counting = false; this.shutterBtn.classList.remove('busy');
    this.badge.textContent = ''; this.badge.classList.remove('on'); this.prevTag && (this.prevTag.textContent = '');
    this.snap();
  }
  async snap() {
    const src = this.source; if (!src) return;
    const sw = src === this.scene ? src.w : src.videoWidth, sh = src === this.scene ? src.h : src.videoHeight;
    if (!sw) return;
    const flashOn = this.flash === 'on' || (this.flash === 'auto' && false);
    sfx.play('shutter');
    this.flashEl.classList.remove('go'); void this.flashEl.offsetWidth; this.flashEl.classList.add('go');
    if (flashOn) { this.os.setSys('torch', true); setTimeout(() => this.os.setSys('torch', false), 220); this.surface && this.surface.flashWhite(); }
    // full-resolution render matching the viewfinder framing
    const ar = this.vw / this.vh, H = Math.min(1440, sh), W = Math.round(H * ar);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const f = [STYLES[this.style].f === 'none' ? '' : STYLES[this.style].f, this.ev ? `brightness(${1 + this.ev * .5})` : ''].filter(Boolean).join(' ');
    const supportsFilter = 'filter' in g;
    this.drawTo(g, W, H, supportsFilter && f ? f : null);
    if (this.mode === 'PORTRAIT' && supportsFilter) {
      // fake depth: blurred copy masked with an ellipse over the sharp subject
      const b = document.createElement('canvas'); b.width = W; b.height = H; const bg = b.getContext('2d');
      bg.filter = `blur(${Math.round(W / 90)}px)`; bg.drawImage(c, 0, 0);
      const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d');
      const gr = mg.createRadialGradient(W / 2, H / 2, W * .12, W / 2, H / 2, W * .36); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
      mg.save(); mg.translate(W / 2, H / 2); mg.scale(1, 1.35); mg.translate(-W / 2, -H / 2); mg.fillStyle = gr; mg.fillRect(0, 0, W, H); mg.restore();
      bg.globalCompositeOperation = 'destination-in'; bg.drawImage(m, 0, 0);
      g.drawImage(b, 0, 0);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
    const rec = { id: 'p-' + Date.now(), type: 'photo', blob, ts: Date.now(), w: W, h: H, mode: this.mode.toLowerCase() };
    await idb.put(rec);
    this.setThumb(rec);
    this.os.emit('photo', rec);
    this.pulseThumb();
  }

  /* ----------------------------------------------------------------- video */
  recTime() { const s = Math.floor((performance.now() - this.recStart) / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  async toggleRecord() {
    if (this.recording) return this.stopRecord();
    if (!this.canvas.captureStream || !window.MediaRecorder) { this.badge.textContent = 'Recording not supported'; this.badge.classList.add('on'); setTimeout(() => this.badge.classList.remove('on'), 1800); return; }
    const stream = this.canvas.captureStream(30);
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.chunks = []; this.mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : {});
    this.mr.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.mr.onstop = () => this.saveVideo(mime || 'video/webm');
    // snapshot for the poster frame
    this.poster = await new Promise(r => this.canvas.toBlob(r, 'image/jpeg', .7));
    this.mr.start(500); this.recording = true; this.recStart = performance.now();
    sfx.play('rec'); this.shutterBtn.classList.add('rec'); this.recTag.classList.add('on');
    this.os.setActivity('recording', {
      priority: 8, height: 100,
      mount: (i, mode) => mode === 'compact' ? h('div.isl-c.i-rec', {}, h('i.recdot'), h('span.rt', {}, '0:00')) : h('div.i-exp', {}, h('div.i-top', {}, h('i.recdot'), h('div.i-meta', {}, h('b', {}, 'Recording'), h('span.rt', {}, '0:00')))),
      update: node => { node.querySelectorAll('.rt').forEach(e => { e.textContent = this.recording ? this.recTime().replace(/^0/, '') : ''; }); },
    });
  }
  stopRecord() {
    this.recording = false; this.mr.stop(); sfx.play('recStop'); this.shutterBtn.classList.remove('rec'); this.recTag.classList.remove('on'); this.os.clearActivity('recording');
  }
  async saveVideo(mime) {
    const blob = new Blob(this.chunks, { type: mime.split(';')[0] });
    const dur = (performance.now() - this.recStart) / 1000;
    const rec = { id: 'v-' + Date.now(), type: 'video', blob, poster: this.poster, ts: Date.now(), dur, w: this.canvas.width, h: this.canvas.height };
    await idb.put(rec); this.setThumb(rec); this.os.emit('photo', rec); this.pulseThumb();
  }

  /* ----------------------------------------------------------------- thumbs */
  async loadThumb() {
    const all = (await idb.all()).sort((a, b) => b.ts - a.ts);
    if (all[0]) this.setThumb(all[0]);
  }
  setThumb(rec) {
    if (this.last && this.last.url) URL.revokeObjectURL(this.last.url);
    const blob = rec.type === 'video' ? rec.poster : rec.blob;
    if (!blob) return;
    const url = URL.createObjectURL(blob); this.last = { url };
    this.thumb.style.backgroundImage = `url(${url})`;
  }
  pulseThumb() { this.thumb.classList.remove('pulse'); void this.thumb.offsetWidth; this.thumb.classList.add('pulse'); }

  /* --------------------------------------------------------------------- UI */
  renderBar() {
    const t = (ic, on, fn, title, label) => { const b = h('button.cam-tb' + (on ? '.on' : ''), { title, onclick: () => { sfx.play('tick'); fn(); this.renderBar(); } }, icon(ic, 20), label ? h('span', {}, label) : null); return b; };
    const flashLbl = { auto: 'A', on: '', off: '' }[this.flash];
    this.top.replaceChildren(
      t('flash', this.flash === 'on', () => { this.flash = { auto: 'on', on: 'off', off: 'auto' }[this.flash]; }, 'Flash: ' + this.flash, flashLbl || null),
      t('live', this.live, () => { this.live = !this.live; }, 'Live Photo'),
      t('timer', !!this.timer, () => { this.timer = { 0: 3, 3: 10, 10: 0 }[this.timer]; }, 'Timer', this.timer ? this.timer + 's' : null),
      t('grid', this.grid, () => { this.grid = !this.grid; this.gridEl.classList.toggle('on', this.grid); }, 'Grid'),
      t('sliders', this.styleBar.classList.contains('on'), () => this.styleBar.classList.toggle('on'), 'Photographic Styles'),
      t('duo', this.duoPreview, () => { this.duoPreview = !this.duoPreview; this.os.previewOn = this.duoPreview; this.os.reflow(); this.applyPreview(); }, 'Duo Preview: shows a live preview on the outer display'),
      t('kid', this.kidCue, () => { this.kidCue = !this.kidCue; this.applyPreview(); }, 'Kid Cue: playful animation on the outer display'),
    );
    this.top.querySelectorAll('.cam-tb')[0].classList.toggle('dim', this.flash === 'off');
    this.flipBtn.classList.toggle('on', this.front);
    this.flipBtn.title = this.front ? 'Front camera (mirrored)' : 'Rear camera';
    this.os.previewOn = this.duoPreview;
  }
  renderZoom() {
    const z = (v, l) => h('button.cam-z' + (Math.abs(this.zoom - v) < .05 ? '.on' : ''), { onclick: () => { this.zoom = v; sfx.play('tick'); this.renderZoom(); } }, l);
    this.zoomBar.replaceChildren(z(1, '1×'), z(2, '2'), z(3, '3'));
    if (!this.zoomBar.parentNode) this.vf.append(this.zoomBar);
    if (![1, 2, 3].includes(+this.zoom.toFixed(1))) { const b = this.zoomBar.querySelector('.on'); if (b) b.classList.remove('on'); this.zoomBar.append(h('button.cam-z.on', {}, this.zoom.toFixed(1) + '×')); }
  }
  renderModes() {
    this.modeBar.replaceChildren(...MODES.map(m => h('button.cam-m' + (m === this.mode ? '.on' : ''), { onclick: () => this.setMode(m) }, m === 'SMART' ? 'SMART TAKE' : m)));
  }
  setMode(m) {
    if (this.recording) return;
    this.mode = m; sfx.play('tick'); this.renderModes();
    this.depth.classList.toggle('on', m === 'PORTRAIT');
    this.shutterBtn.classList.toggle('video', m === 'VIDEO');
    this.badge.classList.remove('on');
    if (m === 'PORTRAIT') { this.badge.textContent = 'Depth Effect · f/1.6'; this.badge.classList.add('on'); setTimeout(() => this.mode === 'PORTRAIT' && this.badge.classList.remove('on'), 2200); }
  }
  renderStyles() {
    this.styleBar.replaceChildren(...STYLES.map((s, i) => h('button.cam-st' + (i === this.style ? '.on' : ''), { onclick: () => { this.style = i; sfx.play('tick'); this.renderStyles(); } }, h('i', { style: { filter: s.f } }), h('span', {}, s.name))));
  }

  bindVf() {
    this.vf.addEventListener('pointerdown', e => {
      if (e.target.closest('button,.cam-styles,.cam-zoom')) return;
      const r = this.vf.getBoundingClientRect(), k = window.__scale || 1;
      const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
      this.reticle.style.left = x + 'px'; this.reticle.style.top = y + 'px';
      this.reticle.classList.remove('on'); void this.reticle.offsetWidth; this.reticle.classList.add('on');
      clearTimeout(this._rt); this._rt = setTimeout(() => this.reticle.classList.remove('on'), 2600);
      const y0 = e.clientY, ev0 = this.ev; let moved = false;
      const mv = ev => { const dy = (y0 - ev.clientY) / k; if (Math.abs(dy) > 3) { moved = true; this.ev = clamp(ev0 + dy / 140, -1, 1); this.reticle.style.setProperty('--ev', this.ev); clearTimeout(this._rt); this._rt = setTimeout(() => this.reticle.classList.remove('on'), 2600); } };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      sfx.play('tick');
    });
    this.vf.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom = clamp(this.zoom - e.deltaY * .01, 1, 5); this.renderZoom(); } }, { passive: false });
    this.root.tabIndex = -1;
    this.root.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.shutter(); } });
    this.root.addEventListener('pointerdown', () => this.root.focus({ preventScroll: true }));
  }

  /* -------------------------------------------- Duo Preview (outer display) */
  buildPreview() {
    this.prevCanvas = h('canvas.cp-view', { width: 300, height: 400 });
    this.prevCount = h('div.cp-count');
    this.prevTag = h('div.cp-tag');
    this.kid = h('canvas.cp-kid', { width: 300, height: 300 });
    this.previewNode = h('div.cam-prev', {}, this.prevCanvas, this.kid, this.prevCount, this.prevTag, h('div.cp-badge', {}, icon('duo', 14), h('span', {}, 'Duo Preview')));
    this.pg = this.prevCanvas.getContext('2d'); this.kg = this.kid.getContext('2d');
    this.applyPreview();
  }
  previewWanted() { return this.duoPreview && this.os.dev.yawT !== 0 || this.os.modeName === 'preview' || this.os.modeName === 'outer' && this.os.dev.fold < 100; }
  applyPreview() { this.kid.style.display = this.kidCue ? '' : 'none'; this.os.setPreviewNode && this.os.setPreviewNode(this.duoPreview ? this.previewNode : null); }
  drawPreview(t) {
    const w = this.prevCanvas.width, hh = this.prevCanvas.height;
    const p = this.pg; p.fillStyle = '#000'; p.fillRect(0, 0, w, hh);
    const sv = this.front; this.front = !sv; this.drawTo(p, w, hh, null); this.front = sv; // preview is a mirror for the subject
    if (this.kidCue) {
      const k = this.kg, s = 300; k.clearRect(0, 0, s, s);
      const b = Math.abs(Math.sin(t * 4)) * 22, sq = 1 + Math.sin(t * 8) * .06;
      k.save(); k.translate(150, 210 - b); k.scale(1 / sq, sq);
      k.fillStyle = '#ffcf3d'; k.beginPath(); k.ellipse(0, 0, 58, 64, 0, 0, 7); k.fill();
      k.fillStyle = '#fff'; k.beginPath(); k.ellipse(-20, -14, 15, 19, 0, 0, 7); k.ellipse(20, -14, 15, 19, 0, 0, 7); k.fill();
      k.fillStyle = '#222'; k.beginPath(); k.arc(-20 + Math.sin(t * 3) * 5, -12, 7, 0, 7); k.arc(20 + Math.sin(t * 3) * 5, -12, 7, 0, 7); k.fill();
      k.strokeStyle = '#222'; k.lineWidth = 5; k.lineCap = 'round'; k.beginPath(); k.arc(0, 12, 22, .15 * Math.PI, .85 * Math.PI); k.stroke();
      k.fillStyle = '#ff7a8a'; k.beginPath(); k.ellipse(-38, 12, 9, 6, 0, 0, 7); k.ellipse(38, 12, 9, 6, 0, 0, 7); k.fill();
      k.restore();
      k.strokeStyle = '#ffcf3d'; k.lineWidth = 6; k.lineCap = 'round'; k.beginPath(); k.moveTo(92, 200 - b); k.lineTo(120 + Math.sin(t * 8) * 8, 150 - b - Math.abs(Math.sin(t * 8)) * 30); k.moveTo(208, 200 - b); k.lineTo(180 - Math.sin(t * 8) * 8, 150 - b - Math.abs(Math.cos(t * 8)) * 30); k.stroke();
    }
  }

  /* ---------------------------------------------------------------- lifecycle */
  onOpen() { this.idle = 0; if (!this.source) this.startStream(); this.os.previewOn = this.duoPreview; this.applyPreview(); }
  onClose() { }
  destroy() { cancelAnimationFrame(this.raf); this.stopStream(); this.os.previewOn = false; this.os.setPreviewNode && this.os.setPreviewNode(null); if (this.recording) this.stopRecord(); }
}
