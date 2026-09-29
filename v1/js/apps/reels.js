// Reels — a vertical short-video feed. Snap paging (drag / wheel / arrow keys), autoplay, double-tap hearts,
// comments (sheet on compact, side pane on the wide inner display), follow/save/share, spinning audio disc.
import { h, icon, svg, ICON, clamp, store, pick } from '../util.js';
import { App } from './app.js';
import { REELS, COMMENT_POOL, TRACKS } from '../data.js';
import { sfx } from '../audio.js';
import { dragScroll } from '../scroll.js';
import { appIcon } from '../icons.js';

const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'K' : String(n);
const seeded = str => { let s = 0; for (const c of str) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const avatarHue = u => { let s = 0; for (const c of u) s = (s * 17 + c.charCodeAt(0)) % 360; return s; };

/* ------------------------------------------------------------ media kinds */
class VideoMedia {
  constructor(r, app) { this.r = r; this.app = app; this.el = h('video.rl-media', { src: r.src, loop: true, playsinline: true, preload: 'auto', muted: true }); this.el.setAttribute('playsinline', ''); }
  start() { this.el.muted = this.app.muted; this.el.volume = clamp(sfx.volume, 0, 1); const p = this.el.play(); if (p) p.catch(() => { this.el.muted = true; this.el.play().catch(() => { }); }); }
  stop() { this.el.pause(); }
  pause() { this.el.pause(); } resume() { this.el.play().catch(() => { }); }
  get paused() { return this.el.paused; }
  progress() { return this.el.duration ? this.el.currentTime / this.el.duration : 0; }
  seek(p) { if (this.el.duration) this.el.currentTime = p * this.el.duration; }
  destroy() { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
}
class KbMedia {
  constructor(r) { this.r = r; this.el = h('div.rl-media.rl-kb', {}, h('img', { src: r.src, draggable: false })); this.t0 = 0; this.acc = 0; this.playing = false; this.len = 9000; }
  start() { this.playing = true; this.t0 = performance.now(); this.el.classList.remove('paused'); }
  stop() { this.playing = false; this.acc = 0; this.el.classList.add('paused'); }
  pause() { if (!this.playing) return; this.acc += performance.now() - this.t0; this.playing = false; this.el.classList.add('paused'); }
  resume() { this.t0 = performance.now(); this.playing = true; this.el.classList.remove('paused'); }
  get paused() { return !this.playing; }
  progress() { const t = this.acc + (this.playing ? performance.now() - this.t0 : 0); return (t % this.len) / this.len; }
  seek(p) { this.acc = p * this.len; this.t0 = performance.now(); }
  destroy() { }
}
class GenMedia {
  constructor(r) {
    this.r = r; this.c = h('canvas.rl-media', { width: 270, height: 480 }); this.el = this.c; this.g = this.c.getContext('2d');
    this.playing = false; this.t = 0; this.raf = 0; this.stars = Array.from({ length: 140 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
    this.drops = Array.from({ length: 90 }, () => ({ x: Math.random() * 270, y: Math.random() * 480, v: 6 + Math.random() * 10 }));
    this.bokeh = Array.from({ length: 16 }, () => ({ x: Math.random() * 270, y: Math.random() * 300, r: 8 + Math.random() * 26, h: 20 + Math.random() * 40, a: .1 + Math.random() * .25 }));
    this.draw(0);
  }
  loop = () => { if (!this.playing) return; this.t += 1 / 30; this.draw(this.t); this.raf = setTimeout(this.loop, 33); };
  start() { if (this.playing) return; this.playing = true; this.loop(); }
  stop() { this.playing = false; clearTimeout(this.raf); this.t = 0; }
  pause() { this.playing = false; clearTimeout(this.raf); } resume() { this.start(); }
  get paused() { return !this.playing; }
  progress() { return (this.t % 10) / 10; } seek(p) { this.t = p * 10; this.draw(this.t); }
  destroy() { this.stop(); }
  draw(t) {
    const g = this.g, W = 270, H = 480, k = this.r.gen;
    if (k === 'aurora') {
      g.fillStyle = '#04040f'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 5; b++) {
        const hue = 130 + b * 40 + Math.sin(t * .4 + b) * 20;
        const gr = g.createLinearGradient(0, H * .1, 0, H * .7); gr.addColorStop(0, `hsla(${hue},90%,60%,0)`); gr.addColorStop(.5, `hsla(${hue},90%,60%,.35)`); gr.addColorStop(1, `hsla(${hue},90%,60%,0)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) g.lineTo(x, H * .42 + Math.sin(x * .02 + t * (.6 + b * .15) + b * 1.7) * 38 + Math.sin(x * .05 - t * .8) * 12 - b * 22);
        g.lineTo(W, H); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97 % W), (i * 61 % (H * .5)), 1, 1);
      g.fillStyle = '#02020a'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 10) g.lineTo(x, H * .86 - Math.abs(Math.sin(x * .03)) * 40); g.lineTo(W, H); g.fill();
    } else if (k === 'rain') {
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b2a4a'); gr.addColorStop(1, '#0a0f1e'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      this.bokeh.forEach(b => { const rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); rg.addColorStop(0, `hsla(${b.h + Math.sin(t + b.x) * 10},90%,65%,${b.a})`); rg.addColorStop(1, 'transparent'); g.fillStyle = rg; g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); });
      g.strokeStyle = 'rgba(190,210,255,.35)'; g.lineWidth = 1; g.beginPath();
      this.drops.forEach(d => { d.y += d.v; d.x -= 1.2; if (d.y > H) { d.y = -20; d.x = Math.random() * W + 20; } g.moveTo(d.x, d.y); g.lineTo(d.x + 2, d.y + 12); }); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 12; i++) { const x = (i * 47 + t * 3) % W, y = (i * 83) % H; g.beginPath(); g.ellipse(x, y, 3, 5, 0, 0, 7); g.fill(); }
    } else if (k === 'waves') {
      g.fillStyle = '#12002b'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = `hsla(${280 + i * 12 + t * 20},95%,${55 + i * 2}%,.85)`; g.lineWidth = 3.5; g.beginPath();
        for (let x = 0; x <= W; x += 4) { const y = H / 2 + Math.sin(x * .025 + t * 1.6 + i * .5) * (30 + i * 9) + Math.sin(x * .06 - t * 1.1 + i) * 14 + (i - 4) * 22; x ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    } else { // stars: warp
      g.fillStyle = '#02030a'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff';
      this.stars.forEach(s => { s.z -= .012; if (s.z <= .02) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; } const px = W / 2 + s.x / s.z * 60, py = H / 2 + s.y / s.z * 90, q = 1 - s.z; const px2 = W / 2 + s.x / (s.z + .05) * 60, py2 = H / 2 + s.y / (s.z + .05) * 90; g.strokeStyle = `rgba(200,220,255,${q})`; g.lineWidth = 1 + q * 1.5; g.beginPath(); g.moveTo(px2, py2); g.lineTo(px, py); g.stroke(); });
    }
  }
}

/* ------------------------------------------------------------------- app */
export default class Reels extends App {
  constructor(os, win) {
    super(os, win);
    this.idx = 0; this.cards = new Map(); this.muted = false; this.dragging = false; this.sheetOpen = false;
    const st = store.get('reels', {});
    this.liked = new Set(st.liked || []); this.saved = new Set(st.saved || []); this.following = new Set(st.following || []); this.mine = st.mine || {};
    this.comments = {};
  }
  statusTone() { return 'light'; }
  persist() { store.set('reels', { liked: [...this.liked], saved: [...this.saved], following: [...this.following], mine: this.mine }); }

  build() {
    this.track = h('div.rl-track');
    this.stage = h('div.rl-stage', {}, this.track);
    this.progress = h('div.rl-prog', {}, h('i'));
    this.topbar = h('div.rl-top', {},
      h('div.rl-title', {}, 'Reels'),
      h('button.rl-mute', { onclick: e => { e.stopPropagation(); this.setMuted(!this.muted); } }, icon('speaker', 20)),
      h('button.rl-cam', { onclick: e => { e.stopPropagation(); this.os.launch('camera', this.surface); } }, icon('camflip', 22)));
    this.muteBtn = this.topbar.querySelector('.rl-mute');
    this.sheet = this.buildSheet();
    this.side = this.buildSide();
    this.hint = h('div.rl-hint', {}, icon('up', 18), h('span', {}, 'Swipe up for next'));
    this.root = h('div.rl', {}, h('div.rl-main', {}, this.stage, this.topbar, this.progress, this.sheet, this.hint), this.side);
    this.bindStage();
    REELS.forEach((r, i) => this.track.append(this.buildCard(r, i)));
    this.go(0, false);
    setTimeout(() => this.hint.classList.add('gone'), 5200);
    this.tickId = setInterval(() => this.tickProgress(), 100);
    return this.root;
  }

  /* ---------- cards ---------- */
  buildCard(r, i) {
    const liked = this.liked.has(r.id);
    const av = h('div.rl-av', { style: { background: `linear-gradient(135deg,hsl(${avatarHue(r.user)} 70% 55%),hsl(${avatarHue(r.user) + 50} 70% 40%))` } }, r.user[0].toUpperCase());
    const likeBtn = h('button.rl-act.like' + (liked ? '.on' : ''), { onclick: e => { e.stopPropagation(); this.toggleLike(r); } }, icon('heart', 30), h('span', {}, fmtK(r.likes + (liked ? 1 : 0))));
    const cmtBtn = h('button.rl-act', { onclick: e => { e.stopPropagation(); this.openComments(); } }, svg(ICON.comment, '0 0 24 24', 'fill="none"'), h('span', {}, fmtK(r.comments + (this.mine[r.id] || []).length)));
    const shareBtn = h('button.rl-act', { onclick: e => { e.stopPropagation(); this.share(r); } }, icon('share', 28), h('span', {}, 'Share'));
    const saveBtn = h('button.rl-act.save' + (this.saved.has(r.id) ? '.on' : ''), { onclick: e => { e.stopPropagation(); this.toggleSave(r); } }, icon('bookmark', 27));
    const moreBtn = h('button.rl-act.more', { onclick: e => { e.stopPropagation(); this.toast('We’ll show you fewer reels like this'); } }, icon('more', 26));
    const disc = h('div.rl-disc', { style: { background: r.track ? `conic-gradient(from 0deg, hsl(${(TRACKS.find(t => t.id === r.track) || {}).hue || 200} 80% 50%), #222, hsl(${r.hue} 80% 50%), #222)` : 'conic-gradient(#555,#222,#555,#222)' } }, h('i'));
    const follow = h('button.rl-follow' + (this.following.has(r.user) ? '.on' : ''), { onclick: e => { e.stopPropagation(); this.toggleFollow(r); } }, this.following.has(r.user) ? 'Following' : 'Follow');
    const info = h('div.rl-info', {},
      h('div.rl-user', {}, av, h('b', {}, r.user), follow),
      h('div.rl-cap', {}, r.caption),
      h('div.rl-audio', {}, icon('speaker', 13), h('div.rl-marq', {}, h('span', {}, r.audio + '   ·   ' + r.audio))));
    const frame = h('div.rl-frame', {}, h('div.rl-bg', { style: { '--h': r.hue } }), h('div.rl-mwrap'), h('div.rl-shade'), info,
      h('div.rl-actions', {}, likeBtn, cmtBtn, shareBtn, saveBtn, moreBtn, disc), h('div.rl-burst'), h('div.rl-pause', {}, icon('play', 44)));
    const card = h('div.rl-card', { style: { transform: `translateY(${i * 100}%)` }, dataset: { i } }, frame);
    card._r = r; card._like = likeBtn; card._save = saveBtn; card._follow = follow; card._cmt = cmtBtn; card._frame = frame;
    return card;
  }

  mountMedia(i) {
    const card = this.track.children[i]; if (!card || card._media) return;
    const r = card._r;
    const media = r.kind === 'video' ? new VideoMedia(r, this) : r.kind === 'kb' ? new KbMedia(r) : new GenMedia(r);
    card._media = media;
    card._frame.querySelector('.rl-mwrap').append(media.el);
  }
  unmountMedia(i) {
    const card = this.track.children[i]; if (!card || !card._media) return;
    card._media.destroy(); card._media.el.remove(); card._media = null;
  }

  /* ---------- paging ---------- */
  get H() { return this.stage.clientHeight || 632; }
  go(i, animate = true) {
    i = clamp(i, 0, REELS.length - 1);
    const prev = this.idx; this.idx = i;
    for (let k = 0; k < REELS.length; k++) { if (Math.abs(k - i) <= 1) this.mountMedia(k); else this.unmountMedia(k); }
    this.track.style.transition = animate ? 'transform .42s cubic-bezier(.22,.9,.3,1)' : 'none';
    this.track.style.transform = `translateY(${-i * 100}%)`;
    Array.from(this.track.children).forEach((c, k) => { if (c._media && k !== i) c._media.stop(); });
    const cur = this.track.children[i];
    this.current = cur;
    this.paused = false;
    if (cur._media) cur._media.start();
    this.playAudio(cur._r);
    this.updateSide(); this.renderComments();
    this.hint.classList.add('gone');
  }
  setMuted(m) {
    this.muted = m;
    this.muteBtn.replaceChildren(icon(m ? 'mute' : 'speaker', 20)); this.muteBtn.classList.toggle('on', m);
    const cur = this.current; if (cur && cur._media && cur._media.el.tagName === 'VIDEO') cur._media.el.muted = m;
    if (this.bgm) this.bgm.muted = m;
  }
  playAudio(r) {
    if (this.bgm) { this.bgm.pause(); }
    if (!r.track) return;
    const t = TRACKS.find(x => x.id === r.track); if (!t) return;
    if (!this.bgm) { this.bgm = new Audio(); this.bgm.loop = true; }
    if (this.os.player.playing) { this.os.player.pause(); this.resumeMusic = true; }
    this.bgm.src = t.src; this.bgm.muted = this.muted; this.bgm.volume = clamp(sfx.volume, 0, 1);
    this.bgm.play().catch(() => { });
  }
  togglePlay() {
    const m = this.current && this.current._media; if (!m) return;
    if (m.paused) { m.resume(); if (this.bgm && this.current._r.track) this.bgm.play().catch(() => { }); this.paused = false; }
    else { m.pause(); if (this.bgm) this.bgm.pause(); this.paused = true; }
    const p = this.current.querySelector('.rl-pause');
    p.replaceChildren(icon(this.paused ? 'pause' : 'play', 44));
    p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop');
  }
  tickProgress() {
    const m = this.current && this.current._media; if (!m) return;
    this.progress.firstChild.style.width = (m.progress() * 100) + '%';
    this.side && this.side._live && this.side._live();
  }

  /* ---------- gestures ---------- */
  bindStage() {
    const st = this.stage;
    let d = null, lastTap = 0, tapTimer = 0;
    st.addEventListener('pointerdown', e => {
      if (e.target.closest('button,.rl-follow,.rl-prog')) return;
      d = { x: e.clientX, y: e.clientY, t: performance.now(), dy: 0, moved: false, id: e.pointerId, vy: 0, ly: e.clientY, lt: performance.now() };
    });
    st.addEventListener('pointermove', e => {
      if (!d || e.pointerId !== d.id) return;
      const k = window.__scale || 1, dy = (e.clientY - d.y) / k, dx = (e.clientX - d.x) / k;
      if (!d.moved && Math.hypot(dx, dy) > 8) { d.moved = true; st.setPointerCapture(e.pointerId); this.track.style.transition = 'none'; }
      if (!d.moved) return;
      const now = performance.now(); d.vy = ((e.clientY - d.ly) / k) / Math.max(1, now - d.lt); d.ly = e.clientY; d.lt = now;
      let off = dy; const atTop = this.idx === 0 && dy > 0, atEnd = this.idx === REELS.length - 1 && dy < 0;
      if (atTop || atEnd) off = dy * .3;
      d.dy = dy;
      this.track.style.transform = `translateY(calc(${-this.idx * 100}% + ${off}px))`;
    });
    const up = e => {
      if (!d || e.pointerId !== d.id) return;
      const s = d; d = null;
      if (s.moved) {
        try { st.releasePointerCapture(e.pointerId); } catch { /* */ }
        const H = this.H;
        if (s.dy < -H * .16 || s.vy < -.55) this.go(this.idx + 1); else if (s.dy > H * .16 || s.vy > .55) this.go(this.idx - 1); else this.go(this.idx);
        return;
      }
      // tap: single = pause/play, double = like
      const now = performance.now();
      const rect = st.getBoundingClientRect(), k = window.__scale || 1;
      const px = (e.clientX - rect.left) / k, py = (e.clientY - rect.top) / k;
      if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; this.burst(px, py); if (!this.liked.has(this.current._r.id)) this.toggleLike(this.current._r, true); }
      else { lastTap = now; tapTimer = setTimeout(() => { if (!this.sheetOpen) this.togglePlay(); else this.closeComments(); }, 300); }
    };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    // wheel / trackpad: one page per gesture
    let cool = 0;
    st.addEventListener('wheel', e => {
      e.preventDefault();
      const now = performance.now();
      if (now < cool || Math.abs(e.deltaY) < 8) return;
      cool = now + 520; this.go(this.idx + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    // scrub the progress bar
    const scrub = e => { const r = this.progress.getBoundingClientRect(); const m = this.current && this.current._media; if (m) m.seek(clamp((e.clientX - r.left) / r.width, 0, 1)); };
    this.progress.addEventListener('pointerdown', e => { e.stopPropagation(); this.progress.setPointerCapture(e.pointerId); scrub(e); this.progress.classList.add('drag'); });
    this.progress.addEventListener('pointermove', e => { if (this.progress.hasPointerCapture(e.pointerId)) scrub(e); });
    this.progress.addEventListener('pointerup', () => this.progress.classList.remove('drag'));
    this.root.tabIndex = -1;
    this.root.addEventListener('keydown', e => {
      if (e.target.matches('input')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') this.go(this.idx + 1); else if (e.key === 'ArrowUp' || e.key === 'k') this.go(this.idx - 1);
      else if (e.key === ' ') { e.preventDefault(); this.togglePlay(); } else if (e.key === 'l') this.toggleLike(this.current._r); else if (e.key === 'm') this.setMuted(!this.muted); else return;
    });
    this.root.addEventListener('pointerdown', () => { if (!document.activeElement.matches('input')) this.root.focus({ preventScroll: true }); });
  }

  burst(x, y) {
    const b = this.current.querySelector('.rl-burst'); const fr = this.current._frame.getBoundingClientRect(), k = window.__scale || 1, sr = this.stage.getBoundingClientRect();
    const heart = h('div.rl-bheart', { style: { left: (x - (fr.left - sr.left) / k) + 'px', top: y + 'px', '--r': (Math.random() * 40 - 20) + 'deg' } }, icon('heart', 92));
    b.append(heart); sfx.play('like'); setTimeout(() => heart.remove(), 900);
  }

  /* ---------- actions ---------- */
  toggleLike(r, force) {
    const card = [...this.track.children].find(c => c._r === r); if (!card) return;
    const on = force ?? !this.liked.has(r.id);
    on ? this.liked.add(r.id) : this.liked.delete(r.id);
    card._like.classList.toggle('on', on); card._like.lastChild.textContent = fmtK(r.likes + (on ? 1 : 0));
    if (on) { sfx.play('like'); card._like.classList.remove('pop'); void card._like.offsetWidth; card._like.classList.add('pop'); }
    this.persist(); this.updateSide();
  }
  toggleSave(r) { const on = !this.saved.has(r.id); on ? this.saved.add(r.id) : this.saved.delete(r.id); this.track.children[REELS.indexOf(r)]._save.classList.toggle('on', on); sfx.play('pop'); this.toast(on ? 'Saved to Collection' : 'Removed from saved'); this.persist(); }
  toggleFollow(r) {
    const on = !this.following.has(r.user); on ? this.following.add(r.user) : this.following.delete(r.user);
    [...this.track.children].forEach(c => { if (c._r.user === r.user) { c._follow.classList.toggle('on', on); c._follow.textContent = on ? 'Following' : 'Follow'; } });
    sfx.play('pop'); this.persist(); this.updateSide();
  }
  async share(r) {
    const url = `https://reels.duo/${r.id}`;
    try { await navigator.clipboard.writeText(url); } catch { /* */ }
    sfx.play('sent'); this.toast('Link copied');
  }
  toast(msg) {
    this.toastEl && this.toastEl.remove();
    this.toastEl = h('div.rl-toast', {}, msg); this.root.append(this.toastEl);
    const t = this.toastEl; setTimeout(() => t.classList.add('gone'), 1500); setTimeout(() => t.remove(), 1900);
  }

  /* ---------- comments ---------- */
  commentsFor(r) {
    if (this.comments[r.id]) return this.comments[r.id];
    const rnd = seeded(r.id), n = 7 + Math.floor(rnd() * 5), pool = COMMENT_POOL.slice(), out = [];
    for (let i = 0; i < n && pool.length; i++) { const [u, t] = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; out.push({ u, t, likes: Math.floor(rnd() * 900), when: [`${1 + i}h`, `${1 + i}h`, `${1 + Math.floor(i / 2)}d`][i % 3] }); }
    return (this.comments[r.id] = [...(this.mine[r.id] || []), ...out]);
  }
  commentEl(c) {
    const el = h('div.rl-cm', {}, h('div.rl-cav', { style: { background: `hsl(${avatarHue(c.u)} 55% 50%)` } }, c.u[0].toUpperCase()),
      h('div.rl-cbody', {}, h('div', {}, h('b', {}, c.u), h('small', {}, c.when || 'now')), h('p', {}, c.t)),
      h('button.rl-clike' + (c.liked ? '.on' : ''), { onclick: () => { c.liked = !c.liked; c.likes = (c.likes || 0) + (c.liked ? 1 : -1); el.querySelector('.rl-clike').classList.toggle('on', c.liked); el.querySelector('.rl-clike span').textContent = c.likes; sfx.play('pop'); } }, icon('heart', 15), h('span', {}, c.likes || 0)));
    return el;
  }
  buildSheet() {
    this.cList = h('div.rl-clist'); dragScroll(this.cList);
    this.cInput = h('input', { placeholder: 'Add a comment…', enterkeyhint: 'send', maxlength: 140 });
    const post = () => this.postComment(this.cInput);
    this.cInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); post(); } });
    const sheet = h('div.rl-sheet', { onpointerdown: e => e.stopPropagation() },
      h('div.rl-shead', {}, h('b', {}, 'Comments'), h('button', { onclick: () => this.closeComments() }, icon('xmark', 18))),
      this.cList, h('div.rl-cin', {}, h('div.rl-cav.me', {}, 'J'), this.cInput, h('button.rl-post', { onclick: post, 'data-keepkb': '' }, 'Post')));
    return sheet;
  }
  buildSide() {
    this.sList = h('div.rl-clist'); dragScroll(this.sList);
    this.sHead = h('div.rl-sinfo');
    this.sInput = h('input', { placeholder: 'Add a comment…', enterkeyhint: 'send', maxlength: 140 });
    this.sInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.postComment(this.sInput); } });
    return h('div.rl-side', {}, this.sHead, h('div.rl-stitle', {}, 'Comments'), this.sList, h('div.rl-cin', {}, h('div.rl-cav.me', {}, 'J'), this.sInput, h('button.rl-post', { onclick: () => this.postComment(this.sInput), 'data-keepkb': '' }, 'Post')));
  }
  postComment(input) {
    const t = input.value.trim(); if (!t) return;
    const r = this.current._r, c = { u: 'jurek', t, likes: 0, when: 'now' };
    this.commentsFor(r).unshift(c); (this.mine[r.id] ||= []).unshift(c); this.persist();
    input.value = ''; sfx.play('sent'); this.renderComments();
    this.current._cmt.lastChild.textContent = fmtK(r.comments + this.mine[r.id].length);
    this.cList.scrollTop = 0; this.sList.scrollTop = 0;
  }
  renderComments() {
    const r = this.current._r, list = this.commentsFor(r);
    [this.cList, this.sList].forEach(el => el.replaceChildren(...list.map(c => this.commentEl(c))));
  }
  openComments() { this.sheetOpen = true; this.sheet.classList.add('on'); sfx.play('swoosh'); }
  closeComments() { this.sheetOpen = false; this.sheet.classList.remove('on'); if (document.activeElement) document.activeElement.blur(); }
  updateSide() {
    const r = this.current._r;
    this.sHead.replaceChildren(
      h('div.rl-suser', {}, h('div.rl-av', { style: { background: `linear-gradient(135deg,hsl(${avatarHue(r.user)} 70% 55%),hsl(${avatarHue(r.user) + 50} 70% 40%))` } }, r.user[0].toUpperCase()), h('div', {}, h('b', {}, r.user), h('small', {}, r.audio)),
        h('button.rl-follow' + (this.following.has(r.user) ? '.on' : ''), { onclick: () => this.toggleFollow(r) }, this.following.has(r.user) ? 'Following' : 'Follow')),
      h('p.rl-scap', {}, r.caption),
      h('div.rl-sstats', {}, h('span', {}, icon('heart', 14), ' ' + fmtK(r.likes + (this.liked.has(r.id) ? 1 : 0))), h('span', {}, icon('play', 12), ' ' + fmtK(r.likes * 9))));
  }

  onOpen() { const m = this.current && this.current._media; if (m && m.paused && !this.paused) { m.resume(); if (this.bgm) this.bgm.play().catch(() => { }); } }
  onClose() { const m = this.current && this.current._media; if (m) m.pause(); if (this.bgm) this.bgm.pause(); }
  onAttach() { const m = this.current && this.current._media; if (m && !this.paused && m.paused) setTimeout(() => m.resume(), 50); }
  destroy() {
    clearInterval(this.tickId);
    [...this.track.children].forEach((c, i) => this.unmountMedia(i));
    if (this.bgm) { this.bgm.pause(); this.bgm.src = ''; }
  }
}
