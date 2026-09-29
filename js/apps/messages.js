// Messages — iMessage-style conversations with typing indicators, read receipts, tapbacks, photo attachments,
// incoming notifications (the OS schedules a couple), split list/thread on the wide display.
import { h, icon, svg, ICON, clamp, store, idb, DAYS } from '../util.js';
import { App } from './app.js';
import { CONTACTS, contact, avatarBg, initials, botReply, LIBRARY } from '../data.js';
import { sfx } from '../audio.js';
import { dragScroll } from '../scroll.js';

const KEY = 'messages.v1';
const TAPBACKS = [['❤️', 'Love'], ['👍', 'Like'], ['👎', 'Dislike'], ['😂', 'Haha'], ['‼️', 'Emphasize'], ['❓', 'Question']];
const now = () => Date.now();
const mins = m => now() - m * 60000;

function seed() {
  const d = {
    maya: [{ f: 'maya', t: 'omg did you see the duo announcement', ts: mins(1800) }, { f: 'me', t: 'YES. it opens like a book 🤯', ts: mins(1795), st: 'read' }, { f: 'maya', t: 'i need one immediately', ts: mins(1790) }],
    mom: [{ f: 'mom', t: 'Don’t forget dinner on Sunday ❤️', ts: mins(4300) }, { f: 'me', t: 'I won’t! What time?', ts: mins(4290), st: 'read' }, { f: 'mom', t: '6:30. Bring the dessert you promised 😄', ts: mins(4288) }],
    leo: [{ f: 'me', t: 'are we still on for climbing thursday?', ts: mins(9000), st: 'read' }, { f: 'leo', t: 'yep! 7pm. bring water', ts: mins(8990) }],
    zoe: [{ f: 'zoe', t: 'sent you the playlist', ts: mins(12000) }, { f: 'me', t: 'thanks!! listening now', ts: mins(11990), st: 'read' }],
    sam: [{ f: 'sam', t: 'gg last night 🎮', ts: mins(20000) }],
    alex: [{ f: 'alex', t: 'hey, you around later?', ts: mins(26000) }],
  };
  return d;
}
let data = null;
const load = () => (data ||= store.get(KEY, null) || seed());
const save = () => store.set(KEY, data);

/** Called by the OS to simulate an incoming iMessage. */
export function receive(os, id, text) {
  load(); const arr = (data[id] ||= []); if (arr.length && arr[arr.length - 1].t === text) return; arr.push({ f: id, t: text, ts: now() }); save();
  const c = contact(id);
  os.notify({ app: 'messages', title: c ? c.name : id, body: text, sound: 'recv', thread: id });
  os.emit('msg', id);
}

export default class Messages extends App {
  constructor(os, win) { super(os, win); load(); this.cur = null; this.view = 'list'; this.q = ''; this.typing = new Set(); this.timers = []; this.attach = null; }
  statusTone() { return 'dark'; }
  ids() { return Object.keys(data).sort((a, b) => this.lastTs(b) - this.lastTs(a)); }
  lastTs(id) { const m = data[id]; return m && m.length ? m[m.length - 1].ts : 0; }

  build() {
    this.search = h('input', { placeholder: 'Search', 'data-autocap': 'off' });
    this.search.addEventListener('input', () => { this.q = this.search.value.toLowerCase(); this.renderList(); });
    this.list = h('div.ms-rows'); dragScroll(this.list);
    this.listPane = h('div.ms-listpane', {},
      h('div.ms-lhead', {}, h('h1', {}, 'Messages'), h('button.ms-compose', { onclick: () => this.openCompose() }, icon('compose', 22))),
      h('div.ms-search', {}, icon('search', 15), this.search), this.list);

    this.tHead = h('div.ms-thead');
    this.tScroll = h('div.ms-thread'); dragScroll(this.tScroll);
    this.input = h('input', { placeholder: 'iMessage', enterkeyhint: 'send' });
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.send(); } });
    this.input.addEventListener('input', () => this.syncSend());
    this.sendBtn = h('button.ms-send', { onclick: () => this.send(), 'data-keepkb': '' }, icon('up', 17));
    this.plus = h('button.ms-plus', { onclick: () => this.openPicker(), 'data-keepkb': '' }, icon('plus', 18));
    this.attachPrev = h('div.ms-attach');
    this.composer = h('div.ms-comp', {}, this.plus, h('div.ms-pill', {}, this.attachPrev, this.input, this.sendBtn));
    this.empty = h('div.ms-empty', {}, icon('comment', 46), h('div', {}, 'No Conversation Selected'));
    this.threadPane = h('div.ms-threadpane', {}, this.tHead, this.tScroll, this.composer, this.empty);
    this.picker = this.buildPicker(); this.compose = this.buildCompose();
    this.root = h('div.ms', { dataset: { view: 'list' } }, this.listPane, this.threadPane, this.picker, this.compose);
    this.renderList();
    this.os.on('msg', id => this.incoming(id));
    // wide: open the newest conversation by default
    if (this.win.el.clientWidth >= 700 || true) { /* decided lazily in onOpen */ }
    return this.root;
  }

  /* ------------------------------------------------------------------ list */
  renderList() {
    const rows = this.ids().filter(id => { const c = contact(id); return !this.q || (c && c.name.toLowerCase().includes(this.q)) || data[id].some(m => (m.t || '').toLowerCase().includes(this.q)); }).map(id => {
      const c = contact(id) || { name: id, hue: 200 }, m = data[id][data[id].length - 1];
      const unread = this.unread(id);
      const row = h('button.ms-row' + (this.cur === id ? '.on' : ''), { onclick: () => { sfx.play('tick'); this.openThread(id); } },
        h('div.ms-dot' + (unread ? '.on' : '')),
        h('div.ms-av', { style: { background: avatarBg(c) } }, initials(c.name)),
        h('div.ms-rb', {}, h('div.ms-rt', {}, h('b', {}, c.name), h('small', {}, this.stamp(m.ts))), h('div.ms-rp' + (unread ? '.u' : ''), {}, m.img ? '📷 Photo' : m.t)));
      return row;
    });
    this.list.replaceChildren(...(rows.length ? rows : [h('div.ms-none', {}, 'No Results')]));
  }
  unread(id) { const m = data[id]; return !!(m && m.length && m[m.length - 1].f !== 'me' && !m[m.length - 1].seen && this.cur !== id); }
  stamp(ts) {
    const d = new Date(ts), n = new Date(), diff = (n - d) / 86400000;
    if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (diff < 2) return 'Yesterday'; if (diff < 7) return DAYS[d.getDay()];
    return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  }

  /* ---------------------------------------------------------------- thread */
  openThread(id) {
    this.cur = id; this.root.dataset.view = 'thread'; this.root.classList.add('has-thread');
    (data[id] || []).forEach(m => { m.seen = true; }); save(); this.os.clearBadge('messages');
    const c = contact(id) || { name: id, hue: 200 };
    this.tHead.replaceChildren(
      h('button.ms-back', { onclick: () => { this.root.dataset.view = 'list'; this.cur = null; this.renderList(); } }, icon('chevronL', 22), h('span', {}, 'Messages')),
      h('div.ms-hc', {}, h('div.ms-av.big', { style: { background: avatarBg(c) } }, initials(c.name)), h('div.ms-hn', {}, c.name, icon('chevronR', 11))),
      h('button.ms-call', { onclick: () => this.os.launch('phone', this.surface) }, icon('phone', 18)));
    this.renderThread(true); this.renderList();
    setTimeout(() => this.input.focus({ preventScroll: true }), 380);
  }
  renderThread(scroll) {
    const msgs = data[this.cur] || [], kids = []; let last = 0;
    msgs.forEach((m, i) => {
      if (m.ts - last > 3600000 || i === 0) { const d = new Date(m.ts); kids.push(h('div.ms-time', {}, h('b', {}, this.stamp(m.ts).replace(/^\d+:\d+ [AP]M$/, 'Today')), ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))); }
      last = m.ts;
      const mine = m.f === 'me', prev = msgs[i - 1], next = msgs[i + 1];
      const tail = !next || next.f !== m.f || next.ts - m.ts > 60000;
      const emoji = m.t && /^(\p{Extended_Pictographic}|\s){1,3}$/u.test(m.t);
      const b = h('div.ms-b' + (mine ? '.me' : '.them') + (tail ? '.tail' : '') + (emoji ? '.emoji' : '') + (m.img ? '.img' : ''), { dataset: { i } },
        m.img ? h('img', { src: m.img }) : null, m.t ? h('span', {}, m.t) : null,
        m.tb ? h('i.ms-tb' + (mine ? '.l' : '.r'), {}, m.tb) : null);
      b.addEventListener('contextmenu', e => { e.preventDefault(); this.tapbackMenu(b, m); });
      let hold; b.addEventListener('pointerdown', () => { hold = setTimeout(() => this.tapbackMenu(b, m), 520); }); ['pointerup', 'pointerleave', 'pointermove'].forEach(ev => b.addEventListener(ev, () => clearTimeout(hold)));
      kids.push(b);
      if (mine && !next) kids.push(h('div.ms-rcpt', {}, m.st === 'read' ? 'Read ' + new Date(m.ts + 4000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Delivered'));
    });
    if (this.typing.has(this.cur)) kids.push(h('div.ms-b.them.tail.typing', {}, h('i'), h('i'), h('i')));
    this.tScroll.replaceChildren(...kids);
    if (scroll) requestAnimationFrame(() => { this.tScroll.scrollTop = this.tScroll.scrollHeight; });
    else this.tScroll.scrollTo({ top: this.tScroll.scrollHeight, behavior: 'smooth' });
    this.syncSend();
  }
  syncSend() { this.sendBtn.classList.toggle('on', !!(this.input.value.trim() || this.attach)); }
  send() {
    const t = this.input.value.trim(); if (!t && !this.attach) return;
    const id = this.cur; if (!id) return;
    const m = { f: 'me', t: t || '', ts: now(), st: 'delivered' }; if (this.attach) { m.img = this.attach; this.attach = null; this.attachPrev.replaceChildren(); this.attachPrev.classList.remove('on'); }
    (data[id] ||= []).push(m); save(); this.input.value = ''; sfx.play('sent'); this.renderThread(false); this.renderList(); this.syncSend();
    this.scheduleReply(id, t);
  }
  scheduleReply(id, text) {
    const delay = 900 + Math.random() * 900;
    this.timers.push(setTimeout(() => {
      this.typing.add(id); if (this.cur === id) this.renderThread(false);
      this.timers.push(setTimeout(() => {
        this.typing.delete(id);
        const msgs = data[id]; msgs.forEach(x => { if (x.f === 'me') x.st = 'read'; });
        const reply = text ? botReply(text) : 'nice pic!!';
        msgs.push({ f: id, t: reply, ts: now(), seen: this.cur === id }); save();
        if (this.cur === id) { sfx.play('recv'); this.renderThread(false); } else this.notifyIncoming(id, reply);
        this.renderList();
      }, 1300 + Math.random() * 1500));
    }, delay));
  }
  notifyIncoming(id, text) { const c = contact(id); this.os.notify({ app: 'messages', title: c ? c.name : id, body: text, sound: 'recv', thread: id }); }
  incoming(id) { this.renderList(); if (this.cur === id) { data[id].forEach(m => { m.seen = true; }); this.renderThread(false); } }
  onNotification(n) { if (n.thread) this.openThread(n.thread); }
  onOpen() { if (!this.cur && this.win.el.clientWidth >= 700) { const first = this.ids()[0]; if (first) this.openThread(first); } }

  tapbackMenu(bubble, m) {
    this.menu && this.menu.remove();
    const r = bubble.getBoundingClientRect(), pr = this.threadPane.getBoundingClientRect(), k = window.__scale || 1;
    const menu = h('div.ms-menu', { style: { top: Math.max(8, (r.top - pr.top) / k - 52) + 'px', [m.f === 'me' ? 'right' : 'left']: '16px' } },
      ...TAPBACKS.map(([e, n]) => h('button', { title: n, onclick: ev => { ev.stopPropagation(); m.tb = m.tb === e ? null : e; save(); sfx.play('tapback'); menu.remove(); this.renderThread(false); } }, e)));
    this.threadPane.append(menu); this.menu = menu;
    const close = () => { menu.remove(); window.removeEventListener('pointerdown', close, true); };
    setTimeout(() => window.addEventListener('pointerdown', close, true), 0);
  }

  /* ------------------------------------------------------ picker + compose */
  buildPicker() {
    const grid = h('div.ms-pgrid');
    const el = h('div.ms-picker', {}, h('div.ms-phead', {}, h('b', {}, 'Photos'), h('button', { onclick: () => el.classList.remove('on') }, icon('xmark', 16))), grid);
    el._grid = grid; dragScroll(grid); return el;
  }
  async openPicker() {
    if (!this.cur) return;
    const mine = (await idb.all()).filter(r => r.type === 'photo').sort((a, b) => b.ts - a.ts).map(r => URL.createObjectURL(r.blob));
    const srcs = [...mine, ...LIBRARY.slice(0, 15).map(l => l.src)];
    this.picker._grid.replaceChildren(...srcs.map(s => h('button.ms-pc', { onclick: () => { this.attach = s; this.attachPrev.replaceChildren(h('img', { src: s }), h('button', { onclick: () => { this.attach = null; this.attachPrev.replaceChildren(); this.attachPrev.classList.remove('on'); this.syncSend(); } }, icon('xmark', 10))); this.attachPrev.classList.add('on'); this.picker.classList.remove('on'); this.syncSend(); sfx.play('pop'); } }, h('img', { src: s }))));
    this.picker.classList.add('on');
  }
  buildCompose() {
    const to = h('input', { placeholder: 'To:', 'data-autocap': 'off' });
    const res = h('div.ms-cres');
    const draw = () => { const q = to.value.toLowerCase(); res.replaceChildren(...CONTACTS.filter(c => !q || c.name.toLowerCase().includes(q)).map(c => h('button.ms-row', { onclick: () => { el.classList.remove('on'); (data[c.id] ||= []); this.openThread(c.id); this.renderList(); } }, h('div.ms-av', { style: { background: avatarBg(c) } }, initials(c.name)), h('div.ms-rb', {}, h('b', {}, c.name), h('small', {}, c.num))))); };
    to.addEventListener('input', draw);
    const el = h('div.ms-newmsg', {}, h('div.ms-phead', {}, h('b', {}, 'New Message'), h('button', { onclick: () => el.classList.remove('on') }, 'Cancel')), h('div.ms-to', {}, to), res);
    el._draw = draw; el._to = to; return el;
  }
  openCompose() { this.compose._to.value = ''; this.compose._draw(); this.compose.classList.add('on'); setTimeout(() => this.compose._to.focus(), 300); }

  destroy() { this.timers.forEach(clearTimeout); }
}
