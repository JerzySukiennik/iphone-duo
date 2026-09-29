// Music — Apple-Music-style app with real playback through os.player.
import { App } from './app.js';
import { h, icon, svg, store, clamp } from '../util.js';
import { dragScroll, dragGesture } from '../scroll.js';
import { sfx } from '../audio.js';
import { artBg } from '../data.js';

const IDLE = { id: '-', title: 'Not Playing', artist: '', album: '', hue: 250, hue2: 285 };
const TABS = [['listen', 'Listen Now', 'play'], ['browse', 'Browse', 'grid'], ['library', 'Library', 'list'], ['search', 'Search', 'search']];
const MIXES = [
  { key: 'mix:fav', title: 'Favorites Mix', sub: 'Made for you', hue: 340, hue2: 20, ids: ['t4', 't3', 't1'] },
  { key: 'mix:chill', title: 'Chill Mix', sub: 'Kevin MacLeod and more', hue: 200, hue2: 245, ids: ['t1', 't2'] },
  { key: 'mix:focus', title: 'Focus Mix', sub: 'Deep work, no lyrics', hue: 160, hue2: 205, ids: ['t2', 't1', 't4'] },
  { key: 'mix:new', title: 'New Music Mix', sub: 'Fresh picks for you', hue: 290, hue2: 335, ids: ['t3', 't4', 't2'] },
];
const CATS = [
  { key: 'cat:Ambient', title: 'Ambient', hue: 232, hue2: 280, ids: ['t1', 't2'] },
  { key: 'cat:Cinematic', title: 'Cinematic', hue: 190, hue2: 220, ids: ['t2', 't4'] },
  { key: 'cat:Comedic', title: 'Comedic', hue: 20, hue2: 340, ids: ['t3'] },
  { key: 'cat:Dark Strings', title: 'Dark Strings', hue: 345, hue2: 20, ids: ['t4', 't1'] },
  { key: 'cat:Focus', title: 'Focus', hue: 150, hue2: 200, ids: ['t1', 't2', 't4'] },
  { key: 'cat:Party', title: 'Party', hue: 300, hue2: 40, ids: ['t3', 't4'] },
];
const GLYPH = {
  shuffle: '<path d="M3 7h3.5c5 0 5 10 10 10H20M3 17h3.5c1.6 0 2.8-.7 3.7-1.8M13.8 8.8C14.7 7.7 15.5 7 17 7h3M17.5 4.5l3 2.5-3 2.5M17.5 14.5l3 2.5-3 2.5"/>',
  repeat: '<path d="m17 3 3 3-3 3M4 11V9.5A3.5 3.5 0 0 1 7.500 6H20M7 21l-3-3 3-3M20 13v1.5a3.5 3.5 0 0 1-3.500 3.500H4"/>',
};
const glyph = (name, size) => {
  const s = svg(GLYPH[name], '0 0 24 24', 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"');
  if (size) s.style.width = s.style.height = size + 'px';
  return s;
};
const fmt = s => { s = isFinite(s) && s > 0 ? Math.floor(s) : 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export default class Music extends App {
  constructor(os, win) {
    super(os, win);
    this.tab = 'listen'; this.seg = store.get('mu-seg', 'songs'); this.detail = null; this.query = '';
    this.npOpen = false; this.wide = false; this.offs = []; this.shownKey = null; this.lastShuf = null; this.likeKey = null;
    this.recent = store.get('mu-recent', ['t1', 't2', 't3', 't4']);
  }
  get p() { return this.os.player; }
  statusTone() { return this.wide || this.npOpen ? 'light' : 'dark'; }
  updateTone() { try { this.os.surfaces.forEach(s => s.updateTone()); } catch { /* not ready */ } }

  /* ============================================================== build */
  build() {
    const root = this.root = h('div.mu');
    // sidebar (regular width)
    this.sideBtns = TABS.map(([id, label, ic]) => h('button.mu-sb', { dataset: { tab: id }, onclick: () => this.go(id) }, icon(ic, 18), h('span', {}, label)));
    const plBtn = (key, label, ic) => h('button.mu-sb', { onclick: () => this.openColl(key, true) }, icon(ic, 18), h('span', {}, label));
    const side = h('div.mu-side', {}, h('div.mu-side-h', {}, 'Music'), ...this.sideBtns,
      h('div.mu-side-sec', {}, 'Playlists'), plBtn('liked', 'Liked Songs', 'heart'), plBtn('recent', 'Recently Played', 'clockic'), plBtn('mix:fav', 'Favorites Mix', 'star'));
    // main column
    this.pgIn = h('div.mu-pg-in');
    this.page = dragScroll(h('div.mu-page', {}, this.pgIn), { axis: 'y' });
    this.tabBtns = TABS.map(([id, label, ic]) => h('button.mu-tab', { dataset: { tab: id }, onclick: () => this.go(id) }, icon(ic, 24), h('span', {}, label)));
    this.tabBar = h('div.mu-tabs.gls', {}, ...this.tabBtns);
    this.mini = this.buildMini();
    const main = h('div.mu-main', {}, this.page, this.mini.el, this.tabBar);
    this.buildNP();
    root.append(side, main, this.np);
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && this.npOpen) this.closeNP(); });

    this.offs.push(this.os.on('music', () => this.sync()));
    this.offs.push(this.os.on('musictime', () => this.tickTime()));
    this.offs.push(this.os.on('volume', v => { this.vol.set(v); if (this.p.audio) this.p.audio.volume = v; }));
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(root);
    this.renderPage();
    this.sync();
    return root;
  }
  onOpen() { this.measure(); this.sync(); }
  destroy() { this.offs.forEach(f => f && f()); this.offs = []; this.ro && this.ro.disconnect(); }

  measure() {
    const r = this.root; if (!r) return;
    const w = r.offsetWidth, hh = r.offsetHeight; if (!w) return;
    const wide = w >= 800;
    r.classList.toggle('reg', w >= 620);
    r.classList.toggle('wide', wide);
    r.classList.toggle('short', hh < 520);
    if (wide !== this.wide) { this.wide = wide; this.updateTone(); }
  }

  buildMini() {
    const art = h('div.mu-art'), title = h('b'), sub = h('span'), bar = h('i.mu-mini-bar');
    const pp = h('button.mu-mb', { onclick: e => { e.stopPropagation(); this.p.toggle(); } });
    const nx = h('button.mu-mb', { onclick: e => { e.stopPropagation(); this.p.next(); } }, icon('next', 22));
    const el = h('div.mu-mini.gls', { onclick: () => this.openNP() }, art, h('div.mu-mini-t', {}, title, sub), pp, nx, bar);
    return { el, art, title, sub, pp, bar };
  }

  slider(onDrag, onEnd) {
    const fill = h('i'), knob = h('u');
    const el = h('div.mu-sl', { dataset: { nodrag: '1' } }, h('div.mu-sl-tr', {}, fill), knob);
    const st = { v: 0, drag: false };
    const set = v => { st.v = clamp(v, 0, 1); fill.style.width = st.v * 100 + '%'; knob.style.left = st.v * 100 + '%'; };
    const ratio = e => { const r = el.getBoundingClientRect(); return r.width ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0; };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st.drag = true; try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      el.classList.add('drag'); set(ratio(e)); onDrag && onDrag(st.v);
    });
    el.addEventListener('pointermove', e => { if (st.drag) { set(ratio(e)); onDrag && onDrag(st.v); } });
    const up = () => { if (!st.drag) return; st.drag = false; el.classList.remove('drag'); onEnd && onEnd(st.v); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return { el, set, st };
  }

  buildNP() {
    const p = this.p;
    this.npBg = h('div.mu-np-bg');
    this.artEl = h('div.mu-art.xl');
    this.artWrap = h('div.mu-art-wrap', {}, this.artEl);
    this.npTitle = h('b'); this.npArtist = h('span');
    this.heart = h('button.mu-heart.big', { onclick: () => { const t = p.track; if (t) { sfx.play('like'); p.toggleLike(t.id); } } }, icon('heart', 22));
    const meta = h('div.mu-meta', {}, h('div.mu-meta-t', {}, this.npTitle, this.npArtist), this.heart);
    this.scrub = this.slider(v => { this.tEl.textContent = fmt(v * p.duration); this.tRem.textContent = p.duration ? '-' + fmt(p.duration - v * p.duration) : '-:--'; }, v => { if (p.duration) p.seek(v * p.duration); });
    this.tEl = h('span', {}, '0:00'); this.tRem = h('span', {}, '-:--');
    this.ppBig = h('button.mu-tb.pp', { onclick: () => p.toggle() });
    const tr = h('div.mu-tr', {}, h('button.mu-tb', { onclick: () => p.prev() }, icon('prev', 30)), this.ppBig, h('button.mu-tb', { onclick: () => p.next() }, icon('next', 30)));
    this.vol = this.slider(v => { sfx.setVolume(v); if (p.audio) p.audio.volume = v; }, () => sfx.play('vol'));
    this.vol.set(sfx.volume); if (p.audio) p.audio.volume = sfx.volume;
    const vrow = h('div.mu-vol', {}, h('button', { onclick: () => { sfx.setVolume(0); this.vol.set(0); if (p.audio) p.audio.volume = 0; } }, icon('mute', 18)), this.vol.el,
      h('button', { onclick: () => { sfx.setVolume(1); this.vol.set(1); if (p.audio) p.audio.volume = 1; } }, icon('speaker', 20)));
    this.shufBtn = h('button.mu-ob', { onclick: () => { p.shuffle = !p.shuffle; p.changed(); } }, glyph('shuffle', 20));
    this.repBtn = h('button.mu-ob', { onclick: () => { p.repeat = !p.repeat; p.changed(); } }, glyph('repeat', 20));
    const opts = h('div.mu-opts', {}, this.shufBtn, this.repBtn);
    const ctrl = h('div.mu-np-ctrl', {}, meta, this.scrub.el, h('div.mu-times', {}, this.tEl, this.tRem), tr, vrow, opts);
    this.viz = h('div.mu-viz', {}, ...Array.from({ length: 30 }, () => h('i', { style: `--h:${(.3 + Math.random() * .7).toFixed(2)};--d:${(.45 + Math.random() * .7).toFixed(2)}s;--dl:-${(Math.random() * 1.2).toFixed(2)}s` })));
    this.queue = h('div.mu-q');
    const inner = h('div.mu-np-in', {}, h('div.mu-np-top', {}, this.artWrap, ctrl), this.viz, this.queue);
    this.npScroll = dragScroll(h('div.mu-np-scroll', {}, inner), { axis: 'y' });
    this.npHead = h('div.mu-np-head', {}, h('button.mu-np-x', { onclick: () => this.closeNP() }, icon('down', 18)), h('div.mu-grab'), h('div.mu-np-lbl', {}, 'Now Playing'));
    this.np = h('div.mu-np', {}, this.npBg, this.npHead, this.npScroll);
    dragGesture(this.npHead, {
      filter: () => !this.wide,
      onStart: ({ dy }) => { if (dy < 0) return false; this.np.classList.add('drag'); },
      onMove: ({ dy }) => { this.np.style.transform = `translateY(${Math.max(0, dy)}px)`; },
      onEnd: ({ dy, vy }) => { this.np.classList.remove('drag'); this.np.style.transform = ''; if (dy > 110 || vy > .6) this.closeNP(); },
    });
  }

  openNP() { if (this.npOpen) return; this.npOpen = true; this.root.classList.add('np-open'); this.updateTone(); }
  closeNP() { if (!this.npOpen) return; this.npOpen = false; this.root.classList.remove('np-open'); this.np.classList.remove('drag'); this.np.style.transform = ''; this.updateTone(); }

  /* ============================================================== sync */
  setBg(d) {
    const layer = h('div.mu-np-bgl', { style: { background: `radial-gradient(90% 55% at 25% 8%, hsl(${d.hue2} 85% 52%), transparent 70%), radial-gradient(80% 60% at 85% 95%, hsl(${d.hue} 80% 46%), transparent 70%), hsl(${d.hue} 45% 14%)` } });
    const old = [...this.npBg.children];
    this.npBg.append(layer); void layer.offsetWidth; layer.classList.add('on');
    setTimeout(() => old.forEach(o => o.remove()), 900);
  }
  sync() {
    const p = this.p, t = p.track, playing = !!(t && p.playing), key = t ? t.id : '-';
    this.root.classList.toggle('playing', playing);
    this.root.classList.toggle('has-track', !!t);
    if (key !== this.shownKey) {
      this.shownKey = key; const d = t || IDLE;
      this.artEl.style.background = artBg(d); this.mini.art.style.background = artBg(d);
      this.npTitle.textContent = d.title; this.npArtist.textContent = t ? `${t.artist} — ${t.album}` : 'Choose a song to start';
      this.mini.title.textContent = d.title; this.mini.sub.textContent = t ? t.artist : 'Tap a song to play';
      this.setBg(d); this.renderQueue();
      if (t) { this.recent = [t.id, ...this.recent.filter(x => x !== t.id)]; store.set('mu-recent', this.recent); }
    }
    if (p.shuffle !== this.lastShuf) { this.lastShuf = p.shuffle; this.renderQueue(); }
    this.mini.pp.replaceChildren(icon(playing ? 'pause' : 'play', 24));
    this.ppBig.replaceChildren(icon(playing ? 'pause' : 'play', 40));
    this.shufBtn.classList.toggle('on', p.shuffle); this.repBtn.classList.toggle('on', p.repeat);
    this.heart.classList.toggle('on', !!(t && p.liked.has(t.id)));
    this.root.querySelectorAll('.mu-heart[data-id]').forEach(b => b.classList.toggle('on', p.liked.has(b.dataset.id)));
    this.markNow();
    const lk = [...p.liked].sort().join();
    if (lk !== this.likeKey) {
      const first = this.likeKey === null; this.likeKey = lk;
      if (!first && ((this.tab === 'library' && (this.seg === 'liked' || this.detail === 'liked')) || this.detail === 'liked')) this.renderPage(true);
    }
    this.tickTime();
  }
  markNow() {
    const p = this.p, id = p.track ? p.track.id : null, playing = !!(p.track && p.playing);
    this.root.querySelectorAll('.mu-row[data-id],.mu-tile[data-id]').forEach(r => r.classList.toggle('now', r.dataset.id === id));
    this.root.querySelectorAll('.mu-hero[data-id]').forEach(r => { const b = r.querySelector('.mu-hero-btn'); if (b) b.textContent = r.dataset.id === id && playing ? 'Pause' : 'Play'; });
  }
  tickTime() {
    if (!this.scrub || this.scrub.st.drag) return;
    const p = this.p, dur = p.duration, tm = p.time;
    this.scrub.set(dur ? tm / dur : 0);
    this.tEl.textContent = fmt(tm); this.tRem.textContent = dur ? '-' + fmt(dur - tm) : '-:--';
    this.mini.bar.style.width = (dur ? tm / dur * 100 : 0) + '%';
  }
  renderQueue() {
    const p = this.p, n = p.tracks.length;
    const items = p.track ? Array.from({ length: n - 1 }, (_, i) => p.tracks[(p.idx + 1 + i) % n]) : p.tracks.slice();
    this.queue.replaceChildren(h('div.mu-q-h', {}, h('b', {}, 'Up Next'), h('span', {}, p.shuffle ? 'Shuffling' : `${items.length} songs`)), ...items.map(t => this.row(t)));
    this.markNow();
  }

  /* ============================================================== navigation */
  go(tab) { this.tab = tab; this.detail = null; this.renderPage(); this.page.scrollTop = 0; }
  openColl(key, lib) { if (lib) { this.tab = 'library'; this.seg = 'playlists'; } this.detail = key; this.renderPage(); this.page.scrollTop = 0; }
  playTrack(id) {
    const p = this.p, i = p.tracks.findIndex(t => t.id === id); if (i < 0) return;
    if (p.track && p.idx === i) p.toggle(); else p.play(i);
  }
  playColl(c, shuffle) {
    const p = this.p; if (!c.tracks.length) return;
    const t = shuffle ? c.tracks[Math.floor(Math.random() * c.tracks.length)] : c.tracks[0];
    p.shuffle = !!shuffle; p.play(p.tracks.findIndex(x => x.id === t.id));
  }
  collection(key) {
    const p = this.p, T = p.tracks, by = ids => ids.map(id => T.find(t => t.id === id)).filter(Boolean);
    const mk = (title, sub, hue, hue2, tracks, gl) => ({ key, title, sub: sub || `${tracks.length} song${tracks.length === 1 ? '' : 's'}`, hue, hue2, tracks, gl });
    if (key === 'liked') return mk('Liked Songs', null, 345, 15, T.filter(t => p.liked.has(t.id)), 'heart');
    if (key === 'recent') return mk('Recently Played', null, 220, 260, by(this.recent));
    if (key === 'all') return mk('All Songs', null, 250, 210, T);
    if (key.startsWith('al:')) { const a = key.slice(3), tr = T.filter(t => t.album === a), f = tr[0] || IDLE; return mk(a, f.artist, f.hue, f.hue2, tr); }
    const c = [...MIXES, ...CATS].find(x => x.key === key);
    return c ? mk(c.title, c.sub, c.hue, c.hue2, by(c.ids)) : mk('Songs', null, 250, 210, []);
  }

  /* ============================================================== components */
  art(t, cls = '') { return h('div.mu-art' + cls, { style: { background: artBg(t) } }); }
  eq(cls = '') { return h('div.mu-eq' + cls, {}, h('i'), h('i'), h('i'), h('i')); }
  heartBtn(id) { return h('button.mu-heart', { dataset: { id }, onclick: e => { e.stopPropagation(); sfx.play('like'); this.p.toggleLike(id); } }, icon('heart', 20)); }
  row(t, o = {}) {
    return h('div.mu-row', { dataset: { id: t.id }, onclick: () => this.playTrack(t.id) },
      o.num ? h('span.mu-num', {}, o.num) : null,
      h('div.mu-rart', {}, this.art(t), this.eq()),
      h('div.mu-rt', {}, h('b', {}, t.title), h('span', {}, `${t.artist} · ${t.album}`)),
      this.heartBtn(t.id));
  }
  tile(t) {
    return h('div.mu-tile', { dataset: { id: t.id }, onclick: () => this.playTrack(t.id) }, h('div.mu-tart', {}, this.art(t), this.eq('.badge')), h('b', {}, t.title), h('span', {}, t.artist));
  }
  collTile(c, label) {
    const art = h('div.mu-art', { style: { background: artBg(c) } }, label ? h('span.mu-mix-l', {}, label) : null);
    return h('div.mu-tile', { onclick: () => this.openColl(c.key) }, h('div.mu-tart', {}, art), h('b', {}, c.title), h('span', {}, c.sub));
  }
  shelf(title, tiles) {
    return h('section.mu-sec', {}, h('h2', {}, title), dragScroll(h('div.mu-shelf', {}, h('div.mu-shelf-in', {}, ...tiles)), { axis: 'x' }));
  }

  /* ============================================================== pages */
  renderPage(keep) {
    const top = keep ? this.page.scrollTop : 0;
    let node;
    try { node = this.detail ? this.pDetail() : ({ listen: () => this.pListen(), browse: () => this.pBrowse(), library: () => this.pLibrary(), search: () => this.pSearch() })[this.tab](); }
    catch (e) { node = h('div.mu-empty', {}, 'Something went wrong.'); console.error(e); }
    this.pgIn.replaceChildren(node);
    this.page.scrollTop = top;
    [...this.sideBtns, ...this.tabBtns].forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.markNow();
  }

  pListen() {
    const p = this.p, T = p.tracks, by = id => T.find(t => t.id === id);
    const hero = T[new Date().getDate() % T.length];
    const heroEl = h('div.mu-hero', { dataset: { id: hero.id }, style: { background: artBg(hero) }, onclick: () => this.playTrack(hero.id) },
      h('div.mu-hero-in', {}, h('small', {}, 'FEATURED ALBUM'), h('b', {}, hero.album), h('span', {}, hero.artist), h('button.mu-hero-btn', {}, 'Play')));
    const albums = [...new Set(T.map(t => t.album))].map(a => this.collection('al:' + a));
    return h('div', {}, h('h1.mu-h1', {}, 'Listen Now'), heroEl,
      this.shelf('Recently Played', this.recent.map(by).filter(Boolean).map(t => this.tile(t))),
      this.shelf('Made For You', MIXES.map(m => this.collTile(this.collection(m.key), m.title.replace(' Mix', '') + '\nMix'))),
      this.shelf('Albums', albums.map(c => this.collTile(c))));
  }

  pBrowse() {
    const T = this.p.tracks;
    return h('div', {}, h('h1.mu-h1', {}, 'Browse'),
      h('div.mu-grid', {}, ...CATS.map(c => h('div.mu-cat', { style: { background: artBg(c) }, onclick: () => this.openColl(c.key) }, h('span', {}, c.title)))),
      h('section.mu-sec', {}, h('h2', {}, 'Top Songs'), h('div.mu-list', {}, ...T.map((t, i) => this.row(t, { num: i + 1 })))));
  }

  pLibrary() {
    const T = this.p.tracks, p = this.p;
    const seg = h('div.mu-seg', {}, ...[['playlists', 'Playlists'], ['songs', 'Songs'], ['liked', 'Liked']].map(([id, l]) =>
      h('button' + (this.seg === id ? '.on' : ''), { onclick: () => { this.seg = id; store.set('mu-seg', id); this.renderPage(); } }, l)));
    let body;
    if (this.seg === 'playlists') {
      body = h('div.mu-list', {}, ...['liked', 'recent', 'all', ...MIXES.map(m => m.key)].map(k => {
        const c = this.collection(k);
        return h('div.mu-pl', { onclick: () => this.openColl(k) }, h('div.mu-art', { style: { background: artBg(c) } }, c.gl ? h('span.mu-glyph', {}, icon(c.gl, 22)) : null),
          h('div.mu-rt', {}, h('b', {}, c.title), h('span', {}, c.sub)), h('span.mu-chev', {}, icon('chevronR', 14)));
      }));
    } else {
      const list = this.seg === 'liked' ? T.filter(t => p.liked.has(t.id)) : T;
      body = list.length ? h('div.mu-list', {}, ...list.map(t => this.row(t))) : h('div.mu-empty', {}, h('div.mu-empty-i', {}, icon('heart', 34)), 'No liked songs yet', h('small', {}, 'Tap the heart on any song and it shows up here.'));
    }
    return h('div', {}, h('h1.mu-h1', {}, 'Library'), seg, body);
  }

  pDetail() {
    const c = this.collection(this.detail);
    const back = (TABS.find(t => t[0] === this.tab) || TABS[0])[1];
    const pill = (label, ic, fn) => h('button.mu-pill', { onclick: fn }, icon(ic, 15), label);
    const head = h('div.mu-dh', {}, h('div.mu-art.lg', { style: { background: artBg(c) } }, c.gl ? h('span.mu-glyph', {}, icon(c.gl, 44)) : null),
      h('div.mu-dh-t', {}, h('h1', {}, c.title), h('span', {}, c.sub), h('div.mu-dh-b', {}, pill('Play', 'play', () => this.playColl(c, false)), pill('Shuffle', 'next', () => this.playColl(c, true)))));
    return h('div', {}, h('button.mu-back', { onclick: () => { this.detail = null; this.renderPage(); } }, icon('chevronL', 16), back), head,
      c.tracks.length ? h('div.mu-list', {}, ...c.tracks.map((t, i) => this.row(t, { num: i + 1 }))) : h('div.mu-empty', {}, 'No songs yet'));
  }

  pSearch() {
    if (!this.srch) {
      const input = h('input', { type: 'text', placeholder: 'Songs, Artists, Albums', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
      const sf = h('div.mu-sf', {}, icon('search', 16), input, h('button.mu-clear', { onclick: () => { input.value = ''; this.updateSearch(); input.focus(); } }, icon('xmark', 14)));
      input.addEventListener('input', () => this.updateSearch());
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      const out = h('div.mu-sr');
      this.srch = { wrap: h('div', {}, h('h1.mu-h1', {}, 'Search'), sf, out), input, sf, out };
    }
    this.updateSearch();
    return this.srch.wrap;
  }
  updateSearch() {
    const s = this.srch, T = this.p.tracks, q = s.input.value.trim().toLowerCase();
    this.query = q; s.sf.classList.toggle('has', !!q);
    if (!q) {
      const terms = ['Kevin MacLeod', ...new Set(T.map(t => t.album)), ...T.map(t => t.title)];
      s.out.replaceChildren(h('h2.mu-sh', {}, 'Try searching for'), h('div.mu-chips', {}, ...terms.map(x => h('button.mu-chip', { onclick: () => { s.input.value = x; this.updateSearch(); } }, x))));
    } else {
      const res = T.filter(t => (t.title + ' ' + t.artist + ' ' + t.album).toLowerCase().includes(q));
      s.out.replaceChildren(res.length ? h('div', {}, h('h2.mu-sh', {}, 'Songs'), h('div.mu-list', {}, ...res.map(t => this.row(t)))) : h('div.mu-empty', {}, `No results for “${s.input.value.trim()}”`, h('small', {}, 'Check the spelling or try a different search.')));
    }
    this.markNow();
  }
}
