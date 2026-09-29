// Notes — folders → notes list → editor. Regular width: 3-pane (>=780) or list+editor with a folder drawer (>=620);
// compact: a navigation stack. The editor is a real <textarea>; first line = title; autosaves to localStorage.
import { App } from './app.js';
import { h, icon, svg, store, fmtTime, MONTHS, DAYS } from '../util.js';
import { dragScroll } from '../scroll.js';
import { sfx } from '../audio.js';

const svgi = inner => svg(inner, '0 0 24 24', 'fill="currentColor"');
const G = {
  folder: () => svgi('<path d="M3 7.500A2.500 2.500 0 0 1 5.500 5H9l2 2.200h7.500A2.500 2.500 0 0 1 21 9.700v7.800a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 17.500v-10Z"/>'),
  pin: () => svgi('<path d="M8.500 3h7l-1.200 6L18 13v2H6v-2l3.700-4L8.500 3Z"/><path d="M12 15v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  chk: () => svgi('<circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.300 12.300 2.700 2.700 4.800-5.400" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  ok: () => svgi('<path d="m4.500 12.500 5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>'),
};
const FOLDERS = [['all', 'All Notes'], ['personal', 'Personal'], ['work', 'Work'], ['deleted', 'Recently Deleted']];
const FNAME = Object.fromEntries(FOLDERS);
const PFX = /^(☐ |☑ |• |(\d+)\. )/;
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function seed() {
  const now = Date.now(), H = 3600e3, D = 24 * H;
  return [
    { id: 'n-groc', folder: 'personal', pinned: true, ts: now - 2 * H, text: 'Groceries\n☐ Oat milk\n☐ Sourdough bread\n☑ Eggs (dozen)\n☐ Avocados x3\n☐ Cherry tomatoes\n☐ Parmesan\n☑ Coffee beans\n☐ Sparkling water' },
    { id: 'n-idea', folder: 'personal', pinned: false, ts: now - 1 * D - 3 * H, text: 'App ideas\n• Pocket weather widget that changes with the colour of the sky\n• A tiny habit tracker — one tap per day, nothing else\n• Split-view sketchpad for the Duo: reference on the left, canvas on the right\n• Voice memos that transcribe themselves into Notes\n\nWeekend project: build a paper prototype of the fold gesture first.' },
    { id: 'n-meet', folder: 'work', pinned: false, ts: now - 3 * D, text: 'Design sync — Sep 27\nAttendees: Maya, Sam, Leo\n\nDecisions\n1. Ship the two-pane layout for the inner display first\n2. Keep the outer display single-column\n3. The Dynamic Island shows one live activity at a time\n\nAction items\n☐ Sam: hinge animation spec by Friday\n☑ Maya: update the icon set\n☐ Me: review the Split View edge cases' },
    { id: 'n-haiku', folder: 'personal', pinned: false, ts: now - 9 * D, text: 'Haiku\nThe screen unfolds wide —\na book made of quiet light,\npages full of sky.' },
  ];
}

export default class Notes extends App {
  constructor(os, win) {
    super(os, win);
    this.notes = store.get('notes:list', null) || seed();
    const cut = Date.now() - 30 * 864e5;
    this.notes = this.notes.filter(n => !(n.del && n.del < cut));   // purge after 30 days
    this.folder = 'all'; this.sel = null; this.q = ''; this.size = store.get('notes:size', 17);
    this.offs = []; this.timers = []; this._tone = null;
  }
  statusTone() { const t = document.getElementById('stage'); return t && t.dataset.ui === 'dark' ? 'light' : 'dark'; }
  checkTone() { const t = this.statusTone(); if (t !== this._tone) { this._tone = t; const s = this.surface; if (s && s.updateTone) s.updateTone(); } }
  mode() { const w = this.root.offsetWidth; return w >= 780 ? 'wide' : w >= 620 ? 'mid' : 'compact'; }
  save() { store.set('notes:list', this.notes); }
  get cur() { return this.notes.find(n => n.id === this.sel) || null; }

  /* ------------------------------------------------------------- selectors */
  inFolder(f) {
    if (f === 'all') return this.notes.filter(n => !n.del);
    if (f === 'deleted') return this.notes.filter(n => n.del);
    return this.notes.filter(n => !n.del && n.folder === f);
  }
  visible() {
    const q = this.q.trim().toLowerCase();
    let l = this.inFolder(this.folder);
    if (q) l = l.filter(n => n.text.toLowerCase().includes(q));
    return l.sort((a, b) => this.folder === 'deleted' ? b.del - a.del : (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.ts - a.ts);
  }
  title(n) { const l = n.text.split('\n').map(x => x.replace(PFX, '').trim()).find(Boolean); return l || 'New Note'; }
  snippet(n) { const ls = n.text.split('\n').map(x => x.replace(PFX, '').trim()).filter(Boolean); return ls[1] || 'No additional text'; }
  dayDiff(ts) { const d = new Date(ts), n = new Date(), f = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); return Math.round((f(n) - f(d)) / 864e5); }
  clock(d) { const h24 = this.os.sys.h24; return fmtTime(d, { h24 }) + (h24 ? '' : d.getHours() < 12 ? ' AM' : ' PM'); }
  listDate(ts) {
    const df = this.dayDiff(ts), d = new Date(ts);
    if (df <= 0) return this.clock(d); if (df === 1) return 'Yesterday'; if (df < 7) return DAYS[d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);
  }
  fullDate(ts) { const d = new Date(ts); return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${this.clock(d)}`; }
  bucket(ts) { const df = this.dayDiff(ts); return df <= 0 ? 'Today' : df === 1 ? 'Yesterday' : df < 8 ? 'Previous 7 Days' : df < 31 ? 'Previous 30 Days' : 'Earlier'; }

  /* ------------------------------------------------------------------ build */
  build() {
    const os = this.os;
    // folders pane
    this.foldBody = h('div.nt-body'); this.foldScroll = h('div.nt-scroll', {}, this.foldBody);
    this.foldEl = h('div.nt-pane.nt-folders', {}, this.foldScroll);
    // list pane
    this.listTitle = h('h1.nt-title'); this.listItems = h('div.nt-items');
    this.searchIn = h('input', { type: 'text', placeholder: 'Search', enterkeyhint: 'search', 'data-autocap': 'off', autocomplete: 'off', spellcheck: 'false' });
    this.searchIn.addEventListener('input', () => { this.q = this.searchIn.value; this.renderList(); });
    this.searchIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.searchIn.blur(); } });
    this.listBody = h('div.nt-body', {}, this.listTitle, h('label.nt-search', {}, icon('search'), this.searchIn), this.listItems);
    this.listScroll = h('div.nt-scroll', {}, this.listBody);
    this.count = h('div.nt-count');
    this.listBack = h('button.nt-back', { onclick: () => this.listBackTap() }, icon('chevronL'), h('span', {}, 'Folders'));
    this.listEl = h('div.nt-pane.nt-list', {}, this.listScroll,
      h('div.nt-nav', {}, this.listBack),
      h('div.nt-bar', {}, h('span.nt-bsp'), this.count, h('button.nt-compose', { onclick: () => this.newNote(), 'aria-label': 'New Note' }, icon('compose'))));
    // editor pane
    this.date = h('div.nt-date');
    this.ta = h('textarea.nt-ta', { placeholder: '', spellcheck: 'false', 'data-autocap': 'on', 'aria-label': 'Note' });
    this.edBack = h('button.nt-back.nt-eback', { onclick: () => { this.leave(); this.root.dataset.view = 'list'; } }, icon('chevronL'), this.edBackLbl = h('span', {}, 'Notes'));
    this.doneBtn = h('button.nt-done', { 'data-keepkb': '', onclick: () => this.ta.blur() }, 'Done');
    this.recBtn = h('button.nt-tb-btn.nt-rec', { onclick: () => this.recover() }, 'Recover');
    this.trashBtn = h('button.nt-ic', { onclick: () => this.confirmDelete(), 'aria-label': 'Delete' }, icon('trash'));
    this.moreBtn = h('button.nt-ic', { onclick: () => this.noteMenu(this.cur), 'aria-label': 'More' }, icon('more'));
    this.placeholder = h('div.nt-none', {}, icon('compose'), h('b', {}, 'No Note Selected'), h('small', {}, 'Choose a note from the list, or start a new one.'), h('button.nt-pill', { onclick: () => this.newNote() }, 'New Note'));
    this.tb = this.buildToolbar();
    this.edEl = h('div.nt-pane.nt-edit', {},
      h('div.nt-nav.nt-enav', {}, this.edBack, h('div.nt-eacts', {}, this.doneBtn, this.recBtn, this.trashBtn, this.moreBtn)),
      h('div.nt-ebody', {}, this.date, this.ta), this.tb, this.placeholder);
    this.sheet = h('div.nt-sheet');
    const root = h('div.nt', { dataset: { view: 'list', fs: 'off' } }, this.foldEl, this.listEl, this.edEl, h('div.nt-fscrim', { onclick: () => { this.root.dataset.fs = 'off'; } }), this.sheet);
    this.root = root;
    dragScroll(this.foldScroll); dragScroll(this.listScroll);
    this.applySize();
    // textarea wiring
    this.ta.addEventListener('input', () => this.onInput());
    this.ta.addEventListener('keydown', e => { if (e.key === 'Enter') this.onEnter(e); });
    this.ta.addEventListener('click', e => this.onTap(e));
    this.ta.addEventListener('focus', () => { this.edEl.classList.add('foc'); this.tb.classList.add('on'); });
    this.ta.addEventListener('blur', () => { this.timers.push(setTimeout(() => { if (document.activeElement !== this.ta) { this.edEl.classList.remove('foc'); this.tb.classList.remove('on'); this.pop.classList.remove('on'); this.flush(); this.dropEmpty(); } }, 120)); });
    this.offs.push(os.on('sys', () => { this.checkTone(); if (this.cur) this.date.textContent = this.fullDate(this.cur.ts); }));
    this.renderFolders(); this.renderList(); this.renderEditor();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => { if (this.mode() !== 'compact' && !this.sel) this.selectFirst(); });
      this.ro.observe(root);
    }
    return root;
  }
  onOpen() { this._tone = this.statusTone(); if (this.mode() !== 'compact' && !this.sel) this.selectFirst(); }
  destroy() { this.flush(); this.offs.forEach(f => f()); if (this.ro) this.ro.disconnect(); this.timers.forEach(clearTimeout); clearTimeout(this._st); }
  onClose() { this.flush(); }
  applySize() { this.ta.style.fontSize = this.size + 'px'; this.ta.style.lineHeight = this.size <= 15 ? '1.4' : this.size >= 20 ? '1.32' : '1.36'; }

  /* ------------------------------------------------------------- navigation */
  listBackTap() {
    if (this.mode() === 'compact') this.root.dataset.view = 'folders';
    else this.root.dataset.fs = this.root.dataset.fs === 'on' ? 'off' : 'on';
  }
  setFolder(f) {
    this.leave(); this.folder = f; this.q = ''; this.sel = null;
    this.root.dataset.fs = 'off';
    if (this.mode() === 'compact') this.root.dataset.view = 'list';
    this.renderFolders(); this.renderList(true);
    if (this.mode() !== 'compact') this.selectFirst(); else this.renderEditor();
  }
  selectFirst() { const l = this.visible(); if (l.length) this.openNote(l[0].id, true); else { this.sel = null; this.renderEditor(); this.renderList(); } }
  openNote(id, quiet) {
    if (this.sel !== id) this.leave();
    this.flush();
    this.sel = id;
    this.renderEditor(); this.markSel();
    if (!quiet && this.mode() === 'compact') this.root.dataset.view = 'edit';
    if (!quiet) this.root.dataset.fs = 'off';
  }
  /** leaving a note: drop it when it is empty (iOS does the same) */
  leave() { this.flush(); this.dropEmpty(); }
  dropEmpty() {
    const n = this.cur;
    if (n && !n.del && !n.text.trim() && document.activeElement !== this.ta) {
      this.notes = this.notes.filter(x => x !== n); this.sel = null; this.save(); this.renderFolders(); this.renderList(); this.renderEditor();
      if (this.mode() !== 'compact') this.selectFirst();
    }
  }
  newNote() {
    this.flush();
    if (this.folder === 'deleted') { this.folder = 'personal'; this.renderFolders(); }
    const cur = this.cur; if (cur && !cur.del && !cur.text.trim()) { this.ta.focus(); return; }  // reuse the blank one
    this.q = '';
    const n = { id: uid(), folder: this.folder === 'all' ? 'personal' : this.folder, pinned: false, ts: Date.now(), text: '' };
    this.notes.unshift(n); this.save(); this.sel = n.id;
    this.renderFolders(); this.renderList(true); this.renderEditor();
    if (this.mode() === 'compact') this.root.dataset.view = 'edit';
    sfx.play('tick');
    this.timers.push(setTimeout(() => this.ta.focus(), this.mode() === 'compact' ? 380 : 60));
  }

  /* ----------------------------------------------------------------- render */
  renderFolders() {
    const row = ([id, name]) => {
      const n = this.inFolder(id).length;
      return h('button.nt-frow' + (this.folder === id ? '.sel' : ''), { onclick: () => this.setFolder(id) },
        h('span.nt-fi' + (id === 'deleted' ? '.tr' : ''), {}, id === 'deleted' ? icon('trash') : G.folder()), h('span.nt-fl', {}, name), h('span.nt-fn', {}, n), h('span.nt-chev', {}, icon('chevronR')));
    };
    this.foldBody.replaceChildren(
      h('h1.nt-title', {}, 'Folders'),
      h('div.nt-sh', {}, 'iCloud'),
      h('div.nt-grp', {}, ...FOLDERS.filter(f => f[0] !== 'deleted').map(row)),
      h('div.nt-grp.nt-gap', {}, row(FOLDERS[3])));
  }
  renderList(reset) {
    const top = this.listScroll.scrollTop;
    const list = this.visible(), del = this.folder === 'deleted';
    if (this.searchIn.value !== this.q) this.searchIn.value = this.q;
    const nodes = [];
    if (!list.length) nodes.push(h('div.nt-empty', {}, h('b', {}, this.q ? 'No Results' : 'No Notes'), h('small', {}, this.q ? `No notes match “${this.q}”.` : del ? 'Deleted notes appear here.' : 'Tap the compose button to write a note.')));
    else {
      const groups = [];
      list.forEach(n => {
        const label = del ? 'Deleted' : n.pinned ? 'Pinned' : this.bucket(n.ts);
        let g = groups[groups.length - 1]; if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
        g.items.push(n);
      });
      groups.forEach(g => nodes.push(h('div.nt-sh', {}, g.label === 'Pinned' ? h('span.nt-pinl', {}, G.pin(), 'Pinned') : g.label), h('div.nt-grp', {}, ...g.items.map(n => this.noteRow(n)))));
    }
    if (del && list.length) nodes.push(h('div.nt-note', {}, 'Notes in Recently Deleted are removed after 30 days.'));
    this.listTitle.textContent = FNAME[this.folder];
    this.listItems.replaceChildren(...nodes);
    this.count.textContent = list.length + (list.length === 1 ? ' Note' : ' Notes');
    this.listScroll.scrollTop = reset ? 0 : top;
  }
  noteRow(n) {
    const el = h('button.nt-row' + (this.sel === n.id ? '.sel' : ''), { dataset: { id: n.id }, onclick: () => this.openNote(n.id), oncontextmenu: e => { e.preventDefault(); this.noteMenu(n); } },
      h('b', {}, this.title(n)),
      h('div.nt-rs', {}, h('span.nt-rd', {}, this.listDate(n.del || n.ts)), h('span.nt-rsn', {}, this.snippet(n))),
      this.folder === 'all' ? h('div.nt-rf', {}, G.folder(), FNAME[n.folder] || 'Notes') : null,
      n.pinned && this.folder !== 'all' ? h('span.nt-pin', {}, G.pin()) : null);
    return el;
  }
  markSel() { this.listItems.querySelectorAll('.nt-row').forEach(r => r.classList.toggle('sel', r.dataset.id === this.sel)); }
  renderEditor() {
    const n = this.cur;
    this.edEl.classList.toggle('empty', !n);
    this.edEl.classList.toggle('del', !!(n && n.del));
    if (!n) { this.ta.value = ''; this.date.textContent = ''; this.ta.readOnly = true; return; }
    this.ta.readOnly = !!n.del;
    if (this.ta.value !== n.text) this.ta.value = n.text;
    this.ta.scrollTop = 0;
    this.date.textContent = this.fullDate(n.ts);
    this.edBackLbl.textContent = FNAME[this.folder] === 'All Notes' ? 'Notes' : FNAME[this.folder];
  }

  /* ------------------------------------------------------------- autosave */
  onInput() {
    const n = this.cur; if (!n || n.del) return;
    n.text = this.ta.value; n.ts = Date.now();
    this.date.textContent = this.fullDate(n.ts);
    if (this.ta.selectionStart === this.ta.value.length) this.ta.scrollTop = this.ta.scrollHeight;
    clearTimeout(this._st); this._dirty = true;
    this._st = setTimeout(() => this.flush(), 450);
  }
  flush() {
    clearTimeout(this._st);
    if (!this._dirty) return; this._dirty = false;
    this.save(); this.renderFolders(); this.renderList();
  }

  /* --------------------------------------------------------------- toolbar */
  buildToolbar() {
    const btn = (content, title, fn, cls = '') => {
      const b = h('button.nt-tbb' + (cls ? '.' + cls : ''), { title, 'data-keepkb': '', onclick: e => { e.preventDefault(); fn(); this.ta.focus(); } }, content);
      b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault());
      return b;
    };
    this.pop = h('div.nt-pop', { 'data-keepkb': '' });
    this.aaBtn = btn(h('span.nt-aa', {}, 'A', h('small', {}, 'a')), 'Format', () => { this.pop.classList.toggle('on'); this.drawPop(); });
    const tb = h('div.nt-tb', { 'data-keepkb': '' }, this.pop,
      this.aaBtn,
      btn(G.chk(), 'Checklist', () => this.prefix('☐ ')),
      btn(icon('list'), 'Bulleted List', () => this.prefix('• ')),
      btn(h('span.nt-num', {}, '1.'), 'Numbered List', () => this.prefix('n')),
      btn(G.ok(), 'Check Off', () => this.tick()),
      h('span.nt-tsp'),
      h('button.nt-tbb.nt-tbdone', { 'data-keepkb': '', onclick: () => this.ta.blur() }, icon('down')));
    tb.querySelectorAll('button').forEach(b => { b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault()); });
    return tb;
  }
  drawPop() {
    this.pop.replaceChildren(...[[15, 'Small'], [17, 'Default'], [20, 'Large']].map(([s, l]) => {
      const b = h('button.nt-po', { 'data-keepkb': '', onclick: () => { this.size = s; store.set('notes:size', s); this.applySize(); this.drawPop(); this.ta.focus(); } }, h('span', { style: { fontSize: s + 'px' } }, l), h('span.nt-pok', {}, this.size === s ? G.ok() : null));
      b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault());
      return b;
    }));
  }
  lineRange() { const ta = this.ta, v = ta.value, s = ta.selectionStart; const a = s > 0 ? v.lastIndexOf('\n', s - 1) + 1 : 0; let b = v.indexOf('\n', s); if (b < 0) b = v.length; return [a, b]; }
  replaceLine(line) {
    const ta = this.ta, [a, b] = this.lineRange(), old = ta.value.slice(a, b), s = ta.selectionStart;
    ta.setRangeText(line, a, b, 'preserve');
    const pos = Math.max(a, s + (line.length - old.length));
    ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  prefix(p) {
    const n = this.cur; if (!n || n.del) return;
    const ta = this.ta, [a, b] = this.lineRange(), line = ta.value.slice(a, b), m = line.match(PFX), body = m ? line.slice(m[0].length) : line;
    if (p === 'n') {
      if (m && m[2]) return this.replaceLine(body);
      let k = 1; const prev = a > 0 ? ta.value.slice(0, a - 1).split('\n').pop() : '', pm = prev.match(/^(\d+)\. /); if (pm) k = +pm[1] + 1;
      return this.replaceLine(k + '. ' + body);
    }
    if (m && m[0] === p) return this.replaceLine(body);
    this.replaceLine(p + body);
  }
  tick() {
    const n = this.cur; if (!n || n.del) return;
    const [a, b] = this.lineRange(), line = this.ta.value.slice(a, b);
    if (line.startsWith('☐ ')) this.replaceLine('☑ ' + line.slice(2));
    else if (line.startsWith('☑ ')) this.replaceLine('☐ ' + line.slice(2));
    else this.replaceLine('☑ ' + line.replace(PFX, ''));
    sfx.play('tick');
  }
  onEnter(e) {
    const n = this.cur; if (!n || n.del) return;
    const ta = this.ta, s = ta.selectionStart; if (s !== ta.selectionEnd) return;
    const [a, b] = this.lineRange(), line = ta.value.slice(a, b), m = line.match(PFX);
    if (!m || s < a + m[0].length) return;
    e.preventDefault();
    if (!line.slice(m[0].length).trim()) { ta.setRangeText('', a, b, 'end'); }   // empty item ends the list
    else {
      let p = m[1]; if (m[2]) p = (+m[2] + 1) + '. '; else if (p === '☑ ') p = '☐ ';
      ta.setRangeText('\n' + p, s, s, 'end');
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.scrollTop = ta.scrollHeight * (ta.selectionStart / Math.max(1, ta.value.length)) - ta.clientHeight / 2;
  }
  /** tapping the leading ☐/☑ glyph of a line toggles it */
  onTap(e) {
    const n = this.cur; if (!n || n.del || this.ta.selectionStart !== this.ta.selectionEnd) return;
    const r = this.ta.getBoundingClientRect(), k = r.width / (this.ta.offsetWidth || 1) || 1;
    const padL = parseFloat(getComputedStyle(this.ta).paddingLeft) || 0;
    if ((e.clientX - r.left) / k > padL + this.size * 1.5) return;
    const [a] = this.lineRange(), line = this.ta.value.slice(a), s = this.ta.selectionStart;
    if (s > a + 1 || !/^[☐☑] /.test(line)) return;
    const g = line[0] === '☐' ? '☑' : '☐';
    this.ta.setRangeText(g, a, a + 1, 'preserve'); this.ta.setSelectionRange(a + 2, a + 2);
    this.ta.dispatchEvent(new Event('input', { bubbles: true })); sfx.play('tick');
  }

  /* ---------------------------------------------------------- note actions */
  pinToggle(n) { n.pinned = !n.pinned; n.ts = n.ts; this.save(); this.renderList(); this.renderFolders(); }
  moveTo(n, f) { n.folder = f; this.save(); this.renderFolders(); this.renderList(); this.renderEditor(); }
  noteMenu(n) {
    if (!n) return;
    if (n.del) { this.actionSheet('Recently Deleted', [{ label: 'Recover Note', fn: () => this.recover(n) }, { label: 'Delete Permanently', red: true, fn: () => this.confirmDelete(n) }]); return; }
    const acts = [{ label: n.pinned ? 'Unpin Note' : 'Pin Note', fn: () => this.pinToggle(n) }];
    ['personal', 'work'].filter(f => f !== n.folder).forEach(f => acts.push({ label: 'Move to ' + FNAME[f], fn: () => this.moveTo(n, f) }));
    acts.push({ label: 'Delete Note', red: true, fn: () => this.confirmDelete(n) });
    this.actionSheet(this.title(n), acts);
  }
  confirmDelete(n = this.cur) {
    if (!n) return;
    const perm = !!n.del;
    this.actionSheet(perm ? 'This note will be deleted permanently.' : 'Delete this note? It moves to Recently Deleted.', [{ label: perm ? 'Delete Permanently' : 'Delete Note', red: true, fn: () => this.doDelete(n) }]);
  }
  doDelete(n) {
    if (n.del) this.notes = this.notes.filter(x => x !== n); else { n.del = Date.now(); n.pinned = false; }
    this.save(); sfx.play('pop');
    if (this.sel === n.id) { this.ta.blur(); this.sel = null; }
    this.renderFolders(); this.renderList(); this.renderEditor();
    if (this.mode() === 'compact') this.root.dataset.view = 'list'; else this.selectFirst();
  }
  recover(n = this.cur) {
    if (!n || !n.del) return; delete n.del; this.save(); sfx.play('pop');
    if (this.sel === n.id) this.sel = null;
    this.renderFolders(); this.renderList(); this.renderEditor();
    if (this.mode() === 'compact') this.root.dataset.view = 'list'; else this.selectFirst();
  }
  actionSheet(title, acts) {
    const close = () => this.sheet.classList.remove('on');
    const list = h('div.nt-as-g', {}, title ? h('div.nt-as-t', {}, title) : null, ...acts.map(a => h('button.nt-as-b' + (a.red ? '.red' : ''), { onclick: () => { close(); a.fn(); } }, a.label)));
    this.sheet.replaceChildren(h('div.nt-as-sc', { onclick: close }), h('div.nt-as', {}, list, h('button.nt-as-c', { onclick: close }, 'Cancel')));
    void this.sheet.offsetWidth; this.sheet.classList.add('on');
  }
}
