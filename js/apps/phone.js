// Phone — Favorites, Recents, Contacts, Keypad, Voicemail + a full call screen and a Dynamic Island call activity.
import { App } from './app.js';
import { h, icon, svg, store, pad, fmtTime } from '../util.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';
import { CONTACTS, contact, avatarBg, initials } from '../data.js';

const SUBS = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ', 0: '+' };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const digitsOf = s => String(s || '').replace(/[^\d+*#]/g, '');
const fmtNum = n => { const d = String(n || ''); return /^\d{10}$/.test(d) ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d; };
const vmIcon = () => svg('<g fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"><circle cx="7" cy="11.500" r="3.700"/><circle cx="17" cy="11.500" r="3.700"/><path d="M7 15.200h10"/></g>');
const TABS = [
  ['favorites', 'Favorites', () => icon('star')],
  ['recents', 'Recents', () => icon('clockic')],
  ['contacts', 'Contacts', () => icon('person')],
  ['keypad', 'Keypad', () => icon('keypad')],
  ['voicemail', 'Voicemail', vmIcon],
];
const dur = s => { s = Math.max(0, Math.floor(s)); const hh = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (hh ? hh + ':' + pad(m) : m) + ':' + pad(s % 60); };
const DAYS3 = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default class Phone extends App {
  constructor(os, win) {
    super(os, win);
    const now = Date.now(), H = 3600e3, D = 24 * H;
    this.tab = 'recents'; this.num = ''; this.call = null; this.edit = false; this.filter = 'all'; this.q = '';
    this.favs = store.get('phone:favs', ['alex', 'maya', 'mom', 'dad']);
    this.recents = store.get('phone:recents', null) || [
      { id: 'maya', dir: 'missed', ts: now - 3 * H },
      { id: 'mom', dir: 'out', ts: now - 5 * H, dur: 312 },
      { id: 'alex', dir: 'in', ts: now - 26 * H, dur: 184 },
      { id: 'leo', dir: 'out', ts: now - 2 * D, dur: 47 },
      { id: null, num: '+1 (650) 555-0139', dir: 'missed', ts: now - 3 * D },
      { id: 'dad', dir: 'in', ts: now - 4 * D, dur: 611 },
      { id: 'zoe', dir: 'out', ts: now - 6 * D, dur: 0 },
    ];
    this.vm = store.get('phone:vm', null) || [
      { id: 'v1', cid: 'mom', ts: now - 1 * D, dur: 23, fresh: true, text: 'Hi sweetie, it’s Mom. Call me back when you get a chance — nothing urgent, I just wanted to hear about your day.' },
      { id: 'v2', num: '+1 (650) 555-0139', ts: now - 3 * D, dur: 8, fresh: true, text: '' },
      { id: 'v3', cid: 'kim', ts: now - 6 * D, dur: 41, fresh: false, text: 'Hey, Coach Kim. Practice is moved to five o’clock on Thursday. Bring your water bottle, and see you there.' },
    ];
    this.playing = null; this.vmOpen = null; this.vmRef = null; this.offs = []; this.timers = []; this._tone = null; this.detailStack = 0;
  }

  statusTone() { if (this.call) return 'light'; const t = document.getElementById('stage'); return t && t.dataset.ui === 'dark' ? 'light' : 'dark'; }
  checkTone() { const t = this.statusTone(); if (t !== this._tone) { this._tone = t; const s = this.surface; if (s && s.updateTone) s.updateTone(); } }
  wide() { return this.root.offsetWidth >= 620; }
  clock(ts) { const d = new Date(ts), h24 = this.os.sys.h24; return fmtTime(d, { h24 }) + (h24 ? '' : d.getHours() < 12 ? ' AM' : ' PM'); }
  when(ts) {
    const d = new Date(ts), n = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(n) - day(d)) / 864e5);
    if (diff <= 0) return this.clock(ts); if (diff === 1) return 'Yesterday'; if (diff < 7) return DAYS3[d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
  }
  save() { store.set('phone:favs', this.favs); store.set('phone:recents', this.recents); store.set('phone:vm', this.vm); }
  matchNum(num) { const d = digitsOf(num); if (!d) return null; return CONTACTS.find(c => digitsOf(c.num) === d || digitsOf(c.num).replace(/^\+?1/, '') === d) || null; }
  entryInfo(e) { const c = e.id ? contact(e.id) : null; return { c, name: c ? c.name : fmtNum(e.num), num: c ? c.num : e.num, id: e.id || null }; }
  avatar(c, size, fallback) {
    const a = h('div.ph-av', { style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * .42) + 'px' } });
    if (c) { a.style.background = avatarBg(c); a.textContent = initials(c.name); } else { a.classList.add('anon'); a.append(icon('person')); }
    return a;
  }

  /* ================================================================== build */
  build() {
    const os = this.os;
    this.body = h('div.ph-body');
    this.scroll = h('div.ph-scroll', {}, this.body);
    this.detail = h('div.ph-detail');
    this.main = h('div.ph-main', {}, this.scroll, this.detail);
    this.buildKeypad();
    this.rail = h('nav.ph-rail', {}, ...TABS.map(([id, label, ic]) => {
      const b = h('button.ph-tab', { dataset: { tab: id }, onclick: () => this.setTab(id) }, h('span.ph-tab-i', {}, ic()), h('span.ph-tab-l', {}, label));
      if (id === 'voicemail') { this.vmBadge = h('i.ph-badge'); b.querySelector('.ph-tab-i').append(this.vmBadge); }
      return b;
    }));
    this.sheet = h('div.ph-sheet');
    this.toastEl = h('div.ph-toast');
    const root = h('div.ph', { dataset: { tab: this.tab }, tabIndex: -1 }, this.main, this.kp, this.rail, this.sheet, this.toastEl);
    this.root = root;
    dragScroll(this.scroll);
    root.addEventListener('pointerdown', e => { if (!e.target.closest('input,textarea')) root.focus({ preventScroll: true }); });
    root.addEventListener('keydown', e => this.onKey(e));
    this.offs.push(os.on('sys', () => { this.checkTone(); }));
    this.renderTabs(); this.renderMain(); this.renderNum();
    return root;
  }
  onOpen() { this._tone = this.statusTone(); }
  destroy() {
    this.offs.forEach(f => f()); this.timers.forEach(clearTimeout); this.stopVm();
    if (this.call) { clearInterval(this.call.iv); clearTimeout(this.call.tc); sfx.ringback(false); this.os.clearActivity('call'); this.call = null; }
  }
  setTab(id) {
    if (id === this.tab && this.root.dataset.tab === id) { this.closeDetail(); return; }
    this.tab = id; this.edit = false; this.q = ''; this.stopVm(); this.closeDetail();
    this.renderTabs(); this.renderMain(true);
  }
  mainTab() { return this.tab === 'keypad' ? 'recents' : this.tab; }
  renderTabs() {
    this.root.dataset.tab = this.tab;
    this.rail.querySelectorAll('.ph-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    const n = this.vm.filter(v => v.fresh).length;
    this.vmBadge.textContent = n; this.vmBadge.hidden = !n;
  }
  onKey(e) {
    if (e.target.matches && e.target.matches('input,textarea')) return;
    if (this.call) { if (this.call.kp && /^[0-9*#]$/.test(e.key)) this.callDigit(e.key); return; }
    if (!(this.tab === 'keypad' || this.wide())) return;
    if (/^[0-9*#+]$/.test(e.key)) this.press(e.key === '+' ? '0' : e.key, e.key === '+');
    else if (e.key === 'Backspace') this.del();
    else if (e.key === 'Enter') this.dial();
  }

  /* ================================================================== keypad */
  buildKeypad() {
    this.numEl = h('div.ph-num'); this.matchEl = h('div.ph-match');
    const keys = KEYS.map(d => {
      const b = h('button.ph-key', { dataset: { d } }, h('b', {}, d), h('small', {}, SUBS[d] || (d === '1' ? '' : '')));
      let lp = null, fired = false;
      b.addEventListener('pointerdown', () => { fired = false; this.press(d); if (d === '0') lp = setTimeout(() => { fired = true; this.num = this.num.slice(0, -1) + '+'; this.renderNum(); }, 480); });
      const up = () => { clearTimeout(lp); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      return b;
    });
    this.callBtn = h('button.ph-callbtn', { onclick: () => this.dial(), 'aria-label': 'Call' }, icon('phone'));
    this.delBtn = h('button.ph-delbtn', { onclick: () => { this.del(); }, 'aria-label': 'Delete' },
      svg('<path d="M9 5h11a1.500 1.500 0 0 1 1.500 1.500v11A1.500 1.500 0 0 1 20 19H9l-6.500-7L9 5Z" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/><path d="m12.500 9.500 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>'));
    let dt = null;
    this.delBtn.addEventListener('pointerdown', () => { dt = setTimeout(() => { this.num = ''; this.renderNum(); }, 600); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => this.delBtn.addEventListener(ev, () => clearTimeout(dt)));
    this.kp = h('div.ph-kp', {}, h('div.ph-nw', {}, this.numEl, this.matchEl), h('div.ph-pad', {}, ...keys, h('span'), this.callBtn, this.delBtn));
  }
  press(d, long) {
    sfx.play('dtmf', d);
    if (this.num.length >= 24) return;
    this.num += long ? '+' : d; this.renderNum();
  }
  del() { this.num = this.num.slice(0, -1); this.renderNum(); }
  renderNum() {
    const n = this.num;
    this.numEl.textContent = fmtNum(n);
    const len = fmtNum(n).length;
    this.numEl.style.fontSize = Math.max(22, Math.min(38, 460 / Math.max(len, 12))) + 'px';
    const c = this.matchNum(n);
    this.matchEl.textContent = c ? c.name : '';
    this.delBtn.style.visibility = n ? 'visible' : 'hidden';
  }
  dial() {
    let n = this.num;
    if (!n) { const last = this.recents.find(r => r.dir === 'out'); if (!last) return; const i = this.entryInfo(last); this.num = digitsOf(i.num); this.renderNum(); return; }
    const c = this.matchNum(n);
    this.startCall({ id: c ? c.id : null, name: c ? c.name : fmtNum(n), num: c ? c.num : n }, { fromKp: true });
  }

  /* ================================================================== pages */
  renderMain(reset) {
    const t = this.mainTab(), top = this.scroll.scrollTop;
    const pages = { favorites: () => this.pgFav(), recents: () => this.pgRecents(), contacts: () => this.pgContacts(), voicemail: () => this.pgVm() };
    this.body.replaceChildren(...pages[t]());
    this.scroll.scrollTop = reset ? 0 : top;
  }
  head(title, actions = []) { return h('div.ph-head', {}, h('h1', {}, title), h('div.ph-acts', {}, ...actions)); }
  textBtn(label, fn, cls = '') { return h('button.ph-tb' + (cls ? '.' + cls : ''), { onclick: fn }, label); }
  empty(icn, title, sub) { return h('div.ph-empty', {}, h('span', {}, icn), h('b', {}, title), h('small', {}, sub)); }
  infoBtn(fn) { return h('button.ph-info', { onclick: e => { e.stopPropagation(); fn(); }, 'aria-label': 'Info' }, h('span', {}, 'i')); }

  pgFav() {
    const list = this.favs.map(id => contact(id)).filter(Boolean);
    const rows = list.map(c => {
      const r = h('div.ph-row' + (this.edit ? '.edit' : ''), { onclick: () => { if (!this.edit) this.startCall({ id: c.id, name: c.name, num: c.num }); } },
        this.edit ? h('button.ph-minus', { onclick: e => { e.stopPropagation(); this.favs = this.favs.filter(x => x !== c.id); this.save(); this.renderMain(); } }, h('i')) : null,
        this.avatar(c, 40), h('div.ph-rt', {}, h('b', {}, c.name), h('small', {}, 'mobile')),
        this.edit ? null : this.infoBtn(() => this.openDetail({ id: c.id }, 'Favorites')));
      return r;
    });
    return [
      this.head('Favorites', [this.textBtn(this.edit ? 'Done' : 'Edit', () => { this.edit = !this.edit; this.renderMain(); }), h('button.ph-plus', { onclick: () => this.addFavorite(), 'aria-label': 'Add Favorite' }, icon('plus'))]),
      rows.length ? h('div.ph-grp', {}, ...rows) : this.empty(icon('star'), 'No Favorites', 'Tap + to add a favorite contact.'),
    ];
  }
  addFavorite() {
    const cand = CONTACTS.filter(c => !this.favs.includes(c.id));
    if (!cand.length) { this.toast('All contacts are already favorites'); return; }
    this.openSheet('Add to Favorites', cand.map(c => h('button.ph-row', { onclick: () => { this.favs.push(c.id); this.save(); this.closeSheet(); this.renderMain(); } }, this.avatar(c, 36), h('div.ph-rt', {}, h('b', {}, c.name), h('small', {}, c.num)))));
  }

  pgRecents() {
    const missedOnly = this.filter === 'missed';
    const list = this.recents.filter(r => !missedOnly || r.dir === 'missed');
    const seg = h('div.ph-seg', {}, ...[['all', 'All'], ['missed', 'Missed']].map(([v, l]) => h('button' + (this.filter === v ? '.on' : ''), { onclick: () => { this.filter = v; this.renderMain(); } }, l)));
    const rows = list.map(e => {
      const i = this.entryInfo(e);
      const dirIcon = e.dir === 'out' ? '↗' : e.dir === 'in' ? '↙' : '↙';
      return h('div.ph-row' + (this.edit ? '.edit' : ''), { onclick: () => { if (!this.edit) this.startCall({ id: i.id, name: i.name, num: i.num }); } },
        this.edit ? h('button.ph-minus', { onclick: ev => { ev.stopPropagation(); this.recents = this.recents.filter(x => x !== e); this.save(); this.renderMain(); } }, h('i')) : null,
        this.avatar(i.c, 40),
        h('div.ph-rt', {}, h('b' + (e.dir === 'missed' ? '.missed' : ''), {}, i.name), h('small', {}, h('span.ph-dir' + (e.dir === 'missed' ? '.missed' : ''), {}, dirIcon), ' ', i.c ? 'mobile' : (e.dir === 'missed' ? 'unknown' : 'phone'), e.dir === 'out' ? ' · Outgoing' : e.dir === 'in' ? ' · Incoming' : ' · Missed', e.dur ? ' · ' + dur(e.dur) : '')),
        h('span.ph-when', {}, this.when(e.ts)),
        this.edit ? null : this.infoBtn(() => this.openDetail({ id: i.id, num: i.num }, 'Recents')));
    });
    const acts = this.edit
      ? [this.textBtn('Clear', () => { this.recents = []; this.save(); this.edit = false; this.renderMain(); }, 'red'), this.textBtn('Done', () => { this.edit = false; this.renderMain(); })]
      : [this.textBtn('Edit', () => { this.edit = true; this.renderMain(); })];
    return [
      this.head('Recents', acts), h('div.ph-segw', {}, seg),
      rows.length ? h('div.ph-grp', {}, ...rows) : this.empty(icon('clockic'), missedOnly ? 'No Missed Calls' : 'No Recent Calls', 'Calls you make and receive will appear here.'),
    ];
  }

  pgContacts() {
    const list = h('div.ph-clist');
    const draw = () => {
      const q = this.q.trim().toLowerCase(), dq = digitsOf(this.q);
      const cs = CONTACTS.filter(c => !q || c.name.toLowerCase().includes(q) || (dq && digitsOf(c.num).includes(dq))).sort((a, b) => a.name.localeCompare(b.name));
      const nodes = [];
      if (!q) nodes.push(h('div.ph-grp.ph-me', {}, h('button.ph-row', { onclick: () => this.toast('This is your contact card') }, h('div.ph-av', { style: { width: '54px', height: '54px', fontSize: '22px', background: avatarBg({ hue: 215 }) } }, 'J'), h('div.ph-rt', {}, h('b.big', {}, 'Jurek'), h('small', {}, 'My Card')))));
      const letters = [...new Set(cs.map(c => c.name[0].toUpperCase()))];
      letters.forEach(L => {
        nodes.push(h('div.ph-letter', {}, L));
        nodes.push(h('div.ph-grp', {}, ...cs.filter(c => c.name[0].toUpperCase() === L).map(c =>
          h('button.ph-row', { onclick: () => this.openDetail({ id: c.id }, 'Contacts') }, this.avatar(c, 40), h('div.ph-rt', {}, h('b', {}, c.name), h('small', {}, c.num))))));
      });
      if (!cs.length) nodes.push(this.empty(icon('search'), 'No Results', 'No contacts match “' + this.q + '”.'));
      else nodes.push(h('div.ph-count', {}, cs.length + (cs.length === 1 ? ' Contact' : ' Contacts')));
      list.replaceChildren(...nodes);
    };
    const inp = h('input', { type: 'text', placeholder: 'Search', enterkeyhint: 'search', 'data-autocap': 'off', autocomplete: 'off', spellcheck: 'false', value: this.q });
    inp.addEventListener('input', () => { this.q = inp.value; clr.hidden = !this.q; draw(); });
    const clr = h('button.ph-sclr', { hidden: !this.q, 'data-keepkb': '', onclick: () => { inp.value = ''; this.q = ''; clr.hidden = true; draw(); inp.focus(); } }, icon('xmark'));
    draw();
    return [this.head('Contacts'), h('label.ph-search', {}, icon('search'), inp, clr), list];
  }

  pgVm() {
    const rows = this.vm.map(v => {
      const c = v.cid ? contact(v.cid) : null, name = c ? c.name : fmtNum(v.num), isOpen = this.vmOpen === v.id;
      const el = h('div.ph-vm' + (isOpen ? '.open' : ''), {},
        h('div.ph-vmh', { onclick: () => { this.vmOpen = isOpen ? null : v.id; if (isOpen) this.stopVm(); this.renderMain(); } },
          h('i.ph-dot' + (v.fresh ? '.on' : '')),
          h('div.ph-rt', {}, h('b', {}, name), h('small', {}, c ? 'mobile' : 'unknown')),
          h('span.ph-when', {}, this.when(v.ts)), this.infoBtn(() => this.openDetail({ id: v.cid || null, num: v.num || (c && c.num) }, 'Voicemail'))));
      if (isOpen) {
        const playing = this.playing && this.playing.id === v.id, pos = playing ? this.playing.pos : 0;
        const bar = h('div.ph-vbar', {}, h('i', { style: { width: (pos / v.dur * 100) + '%' } })), tm = h('span', {}, dur(pos)), tr = h('span', {}, '-' + dur(v.dur - pos));
        this.vmRef = { id: v.id, bar: bar.firstChild, tm, tr };
        el.append(h('div.ph-vbody', {},
          h('div.ph-vplay', {},
            h('button.ph-vpb', { onclick: () => this.toggleVm(v) }, icon(playing && !this.playing.paused ? 'pause' : 'play')),
            h('div.ph-vwrap', {}, bar, h('div.ph-vt', {}, tm, tr))),
          v.text ? h('div.ph-vtx', {}, h('small', {}, 'Transcription'), h('p', {}, v.text)) : h('div.ph-vtx', {}, h('small', {}, 'Transcription'), h('p.dim', {}, 'Transcription not available.')),
          h('div.ph-vact', {},
            h('button.ph-pill', { onclick: () => { const i = { id: v.cid || null, name, num: c ? c.num : v.num }; this.startCall(i); } }, icon('phone'), 'Call Back'),
            h('button.ph-pill.red', { onclick: () => { this.stopVm(); this.vm = this.vm.filter(x => x !== v); this.save(); this.renderTabs(); this.renderMain(); } }, icon('trash'), 'Delete'))));
      }
      return el;
    });
    return [this.head('Voicemail'), rows.length ? h('div.ph-grp', {}, ...rows) : this.empty(vmIcon(), 'No Voicemail', 'New voicemail messages will appear here.')];
  }
  toggleVm(v) {
    if (this.playing && this.playing.id === v.id) { this.playing.paused = !this.playing.paused; this.renderMain(); return; }
    this.stopVm(); v.fresh = false; this.save(); this.renderTabs();
    this.playing = { id: v.id, pos: 0, paused: false };
    this.playing.iv = setInterval(() => {
      const p = this.playing; if (!p) return;
      if (p.paused) return;
      p.pos += .25;
      if (p.pos >= v.dur) { this.stopVm(); this.renderMain(); return; }
      const r = this.vmRef; if (r && r.id === v.id) { r.bar.style.width = (p.pos / v.dur * 100) + '%'; r.tm.textContent = dur(p.pos); r.tr.textContent = '-' + dur(v.dur - p.pos); }
    }, 250);
    this.renderMain();
  }
  stopVm() { if (this.playing) { clearInterval(this.playing.iv); this.playing = null; } }

  /* ============================================================ contact card */
  openDetail(o, from = 'Back') {
    const c = o.id ? contact(o.id) : null, num = c ? c.num : o.num, name = c ? c.name : fmtNum(o.num);
    const t = { id: c ? c.id : null, name, num };
    const tile = (ic, label, fn, cls = '') => h('button.ph-tile' + (cls ? '.' + cls : ''), { onclick: fn }, h('span.ph-tile-i', {}, icon(ic)), h('small', {}, label));
    const favBtn = c ? h('button.ph-row.link' + (this.favs.includes(c.id) ? '.red' : ''), { onclick: () => {
      if (this.favs.includes(c.id)) this.favs = this.favs.filter(x => x !== c.id); else this.favs.push(c.id);
      this.save(); this.openDetail(o, from, true); if (this.mainTab() === 'favorites') this.renderMain(); this.detail.classList.add('on');
    } }, this.favs.includes(c.id) ? 'Remove from Favorites' : 'Add to Favorites') : null;
    const sc = h('div.ph-scroll.ph-dsc', {}, h('div.ph-body', {},
      h('div.ph-dhero', {}, this.avatar(c, 92), h('h2', {}, name), h('small', {}, c ? 'mobile' : 'unknown caller')),
      h('div.ph-tiles', {},
        tile('comment', 'message', () => this.os.launch('messages')),
        tile('phone', 'call', () => this.startCall(t), 'green'),
        tile('camflip', 'video', () => this.startCall(t, { video: true })),
        tile('share', 'mail', () => { const em = c ? c.id + '@icloud.com' : 'unknown'; try { navigator.clipboard && navigator.clipboard.writeText(em); } catch { /* */ } this.toast(c ? 'Email address copied' : 'No email address'); })),
      h('div.ph-grp', {}, h('button.ph-row.two', { onclick: () => this.startCall(t) }, h('div.ph-rt', {}, h('small', {}, 'mobile'), h('b.tint', {}, num)))),
      c ? h('div.ph-grp', {}, h('div.ph-row.two', {}, h('div.ph-rt', {}, h('small', {}, 'email'), h('b.tint', {}, c.id + '@icloud.com')))) : null,
      c ? h('div.ph-grp', {}, favBtn) : null));
    dragScroll(sc);
    const back = h('button.ph-dback', { onclick: () => this.closeDetail() }, icon('chevronL'), h('span', {}, from));
    this.detail.replaceChildren(sc, h('div.ph-dnav', {}, back));
    void this.detail.offsetWidth;
    this.detail.classList.add('on');
  }
  closeDetail() { this.detail.classList.remove('on'); }

  /* ============================================================== sheet/toast */
  openSheet(title, nodes) {
    const sb = h('div.ph-sb', {}, h('div', {}, ...nodes)); dragScroll(sb);
    this.sheet.replaceChildren(h('div.ph-sc', { onclick: () => this.closeSheet() }), h('div.ph-sp', {}, h('div.ph-sh', {}, h('b', {}, title), h('button', { onclick: () => this.closeSheet() }, 'Cancel')), sb));
    void this.sheet.offsetWidth; this.sheet.classList.add('on');
  }
  closeSheet() { this.sheet.classList.remove('on'); }
  toast(msg) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('on'); clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove('on'), 1900); this.timers.push(this._tt);
  }

  /* ================================================================== calls */
  startCall(t, opts = {}) {
    if (this.call) return;
    const os = this.os;
    sfx.init && sfx.init();
    const call = { fromKp: !!opts.fromKp, t, state: 'calling', t0: 0, mute: false, spk: false, kp: false, dig: '', video: !!opts.video, extra: [], sec: 0 };
    this.call = call;
    this.closeDetail(); this.closeSheet();
    this.buildCall();
    sfx.ringback(true);
    call.tc = setTimeout(() => this.connect(), 2500);
    call.iv = setInterval(() => this.tickCall(), 500);
    os.setActivity('call', {
      priority: 9, height: 128,
      mount: (sid, mode) => {
        if (mode === 'compact') { const t = h('b.ph-it'); const el = h('div.isl-c.ph-icall', {}, h('span.ph-iph', {}, icon('phone')), t); el._t = t; return el; }
        const tm = h('small.ph-it');
        const el = h('div.ph-iexp', {},
          h('span.ph-iph.big', {}, icon('phone')),
          h('div.ph-imeta', { onclick: () => os.launch('phone') }, h('b', {}, this.callTitle()), tm),
          h('button.ph-iend.isl-ctl', { onclick: e => { e.stopPropagation(); this.endCall(); }, 'aria-label': 'End Call' }, icon('phone')));
        el._t = tm; return el;
      },
      update: node => { if (node && node._t) node._t.textContent = this.callLabel(); },
    });
    this.checkTone();
  }
  callTitle() { const c = this.call; if (!c) return ''; return [c.t.name, ...c.extra.map(x => x.name.split(' ')[0])].join(' & '); }
  callLabel() { const c = this.call; if (!c) return ''; return c.state === 'connected' ? dur(c.sec) : 'calling…'; }
  connect() {
    const c = this.call; if (!c) return;
    sfx.ringback(false); sfx.play('pop');
    c.state = 'connected'; c.t0 = Date.now(); c.sec = 0;
    this.renderCall();
  }
  tickCall() {
    const c = this.call; if (!c) return;
    if (c.state === 'connected') c.sec = Math.floor((Date.now() - c.t0) / 1000);
    if (this.cStat) this.cStat.textContent = this.callLabel();
  }
  endCall() {
    const c = this.call; if (!c) return;
    clearInterval(c.iv); clearTimeout(c.tc); sfx.ringback(false); sfx.play('tick');
    this.os.clearActivity('call');
    const dur0 = c.state === 'connected' ? Math.floor((Date.now() - c.t0) / 1000) : 0;
    this.recents.unshift({ id: c.t.id, num: c.t.num, dir: 'out', ts: Date.now(), dur: dur0 });
    this.recents = this.recents.slice(0, 60); this.save();
    this.call = null;
    const el = this.callEl; this.cStat = null; this.callEl = null;
    if (el) { el.classList.remove('on'); this.timers.push(setTimeout(() => el.remove(), 420)); }
    if (c.fromKp) { this.num = ''; this.renderNum(); }
    this.renderMain(); this.checkTone();
  }
  buildCall() {
    const el = h('div.ph-call'); this.callEl = el;
    this.root.append(el);
    this.renderCall(true);
    void el.offsetWidth; el.classList.add('on');
  }
  renderCall(first) {
    const c = this.call, el = this.callEl; if (!c || !el) return;
    const hue = (contact(c.t.id) || { hue: 215 }).hue;
    el.style.setProperty('--ch', hue);
    const btn = (ic, label, on, fn, cls = '') => h('button.ph-cb' + (on ? '.on' : '') + (cls ? '.' + cls : ''), { onclick: fn }, h('span.ph-cb-i', {}, typeof ic === 'string' ? icon(ic) : ic), h('small', {}, label));
    const mic = svg('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.500 11.500a6.500 6.500 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' + (c.mute ? '<path d="M4 4l16 16" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/>' : ''));
    this.cStat = h('div.ph-cstat', {}, this.callLabel());
    const primary = contact(c.t.id);
    const av = c.video
      ? h('div.ph-cvid', {}, h('div.ph-cvbg', {}, this.avatar(primary, 84)), h('div.ph-cpip', {}, h('span', {}, 'You')), h('small', {}, 'FaceTime'))
      : h('div.ph-cavi', {}, this.avatar(primary, 150));
    const left = h('div.ph-cl', {}, h('div.ph-cname', {}, this.callTitle()), this.cStat, c.kp ? h('div.ph-cdig', {}, c.dig || ' ') : null, h('div.ph-cav', {}, av));
    let mid;
    if (c.kp) {
      mid = h('div.ph-ckp', {}, ...KEYS.map(d => h('button.ph-ckey', { onclick: () => this.callDigit(d) }, h('b', {}, d), h('small', {}, SUBS[d] || ''))),
        h('span'), h('button.ph-chide', { onclick: () => { c.kp = false; this.renderCall(); } }, 'Hide'), h('span'));
    } else {
      mid = h('div.ph-cgrid', {},
        btn(mic, 'mute', c.mute, () => { c.mute = !c.mute; this.renderCall(); }),
        btn('keypad', 'keypad', false, () => { c.kp = true; this.renderCall(); }),
        btn('speaker', 'speaker', c.spk, () => { c.spk = !c.spk; this.renderCall(); }),
        btn('plus', 'add', false, () => this.pickForCall('Add to Call', p => { if (p.id === c.t.id || c.extra.find(x => x.id === p.id)) { this.toast(p.name + ' is already on the call'); return; } c.extra.push(p); this.renderCall(); this.toast('Adding ' + p.name + '…'); })),
        btn('camflip', 'FaceTime', c.video, () => { c.video = !c.video; this.renderCall(); }),
        btn('person', 'contacts', false, () => this.pickForCall('Contacts', p => this.toast(p.name + ' · ' + p.num))));
    }
    const end = h('button.ph-cend', { onclick: () => this.endCall(), 'aria-label': 'End Call' }, icon('phone'));
    const right = h('div.ph-cr', {}, mid, end);
    el.replaceChildren(h('div.ph-cin', {}, left, right));
    this.tickCall();
  }
  callDigit(d) { const c = this.call; if (!c) return; sfx.play('dtmf', d); c.dig = (c.dig + d).slice(-16); const e = this.callEl && this.callEl.querySelector('.ph-cdig'); if (e) e.textContent = c.dig; }
  pickForCall(title, cb) {
    this.openSheet(title, CONTACTS.map(c => h('button.ph-row', { onclick: () => { this.closeSheet(); cb({ id: c.id, name: c.name, num: c.num }); } }, this.avatar(c, 36), h('div.ph-rt', {}, h('b', {}, c.name), h('small', {}, c.num)))));
  }
}
