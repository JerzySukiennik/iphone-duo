// On-screen iOS keyboard. Works alongside the physical keyboard (typed keys flash the virtual ones).
import { h, svg, ICON } from './util.js';
import { sfx } from './audio.js';

const WORDS = ('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been has had did said each great where help through much before line right too mean old same tell boy follow came want show also around form three small set put end does another large must big even such because turn here why ask went men read need land different home move try kind hand picture again change off play spot air away animal house point page letter mother answer found study still learn should world high every near add food between own below country plant last school father keep tree never start city earth eye light thought head under story saw left dont few while along might close something seem next hard open example begin life always those both paper together got group often run important until children side feet car mile night walk white sea began grow took river four carry state once book hear stop without second later miss idea enough eat face watch far indian real almost let above girl sometimes mountain cut young talk soon list song being leave family hello thanks thank please sorry love okay sure yes yeah lol what\'s how\'s i\'m i\'ll it\'s that\'s can\'t don\'t won\'t message tonight tomorrow today morning weekend dinner lunch coffee movie photo camera music call text send meet party birthday awesome amazing great nice cool haha maybe definitely actually really pretty very').split(' ');

const L1 = 'qwertyuiop'.split(''), L2 = 'asdfghjkl'.split(''), L3 = 'zxcvbnm'.split('');
const N1 = '1234567890'.split(''), N2 = ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'], N3 = ['.', ',', '?', '!', "'"];
const S1 = ['[', ']', '{', '}', '#', '%', '^', '*', '+', '='], S2 = ['_', '\\', '|', '~', '<', '>', '€', '£', '¥', '•'];

export class Keyboard {
  constructor(display) {
    this.display = display;
    this.mode = 'abc'; this.shift = 'once'; this.target = null; this.shown = false;
    this.el = h('div.kb');
    this.bar = h('div.kb-suggest');
    this.rows = h('div.kb-keys');
    this.foot = h('div.kb-foot');
    this.pop = h('div.kb-pop');
    this.el.append(this.bar, this.rows, this.foot, this.pop);
    this.render();
    this.el.addEventListener('pointerdown', e => e.preventDefault()); // keep focus in the field
    this.el.addEventListener('mousedown', e => e.preventDefault());
  }

  get height() { return 44 + 8 + 4 * 42 + 3 * 11 + 40; }

  attach(target) {
    this.target = target;
    this.returnLabel = { send: 'send', search: 'search', go: 'go', done: 'done', next: 'next' }[target.enterKeyHint || target.getAttribute('enterkeyhint')] || 'return';
    if (target.dataset.autocap !== 'off' && (target.value === '' || /[.!?]\s$/.test(target.value.slice(0, target.selectionStart)))) this.shift = 'once';
    else if (this.shift === 'once') this.shift = 'off';
    this.mode = target.inputMode === 'numeric' || target.dataset.kb === 'num' ? 'num' : 'abc';
    this.render(); this.suggest();
  }

  render() {
    const shifted = this.shift !== 'off';
    const key = (label, opts = {}) => {
      const clsStr = (opts.cls || '').trim().split(/\s+/).filter(Boolean).join('.');
      const k = h('button.key' + (clsStr ? '.' + clsStr : ''), { dataset: { k: opts.code || label }, style: opts.flex ? { flex: opts.flex } : {} });
      if (opts.icon) k.append(opts.icon); else k.textContent = label;
      k.addEventListener('pointerdown', ev => this.press(ev, k, opts.action || (() => this.type(label)), opts));
      return k;
    };
    const mod = (label, action, cls = '', flex = 1.3, icon) => key(label, { cls: 'mod ' + cls, flex, action, icon, code: label });
    const shiftIcon = () => { const s = svg(`<path d="M12 4 3.500 13h4.800v6h7.400v-6h4.800L12 4Z" ${this.shift === 'off' ? 'fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"' : 'fill="currentColor"'}/>${this.shift === 'lock' ? '<rect x="8.300" y="20.300" width="7.400" height="1.800" fill="currentColor"/>' : ''}`); return s; };
    const delIcon = () => svg('<path d="M9 5h11a1.500 1.500 0 0 1 1.500 1.500v11A1.500 1.500 0 0 1 20 19H9l-6.500-7L9 5Z" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/><path d="m12.500 9.500 5 5m0-5-5 5" stroke="currentColor" stroke-width="1.800" stroke-linecap="round"/>');
    const row = (...k) => h('div.kb-row', {}, ...k);
    const letters = arr => arr.map(c => key(shifted ? c.toUpperCase() : c, { code: c }));
    const del = mod('⌫', () => this.del(), 'del', 1.35, delIcon());
    del.dataset.k = 'Backspace';
    this.rows.replaceChildren();
    if (this.mode === 'abc') {
      this.rows.append(
        row(...letters(L1)),
        h('div.kb-row.pad', {}, ...letters(L2)),
        row(mod('⇧', () => this.toggleShift(), this.shift !== 'off' ? 'on' : '', 1.35, shiftIcon()), h('div.sp'), ...letters(L3), h('div.sp'), del)
      );
    } else if (this.mode === 'num') {
      this.rows.append(row(...N1.map(c => key(c))), row(...N2.map(c => key(c))),
        row(mod('#+=', () => { this.mode = 'sym'; this.render(); }, '', 1.35), h('div.sp'), ...N3.map(c => key(c, { flex: 1.5 })), h('div.sp'), del));
    } else {
      this.rows.append(row(...S1.map(c => key(c))), row(...S2.map(c => key(c))),
        row(mod('123', () => { this.mode = 'num'; this.render(); }, '', 1.35), h('div.sp'), ...N3.map(c => key(c, { flex: 1.5 })), h('div.sp'), del));
    }
    const ret = key(this.returnLabel || 'return', { cls: 'mod ret' + (this.returnLabel && this.returnLabel !== 'return' ? ' blue' : ''), flex: 2.1, action: () => this.enter(), code: 'Enter' });
    const space = key('space', { cls: 'space', flex: 5, action: () => this.space(), code: ' ' });
    const swap = mod(this.mode === 'abc' ? '123' : 'ABC', () => { this.mode = this.mode === 'abc' ? 'num' : 'abc'; this.render(); }, '', 1.35);
    this.rows.append(row(swap, space, ret));
    this.foot.replaceChildren(
      h('span.kb-globe', {}, svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.700"/><ellipse cx="12" cy="12" rx="3.800" ry="9" fill="none" stroke="currentColor" stroke-width="1.500"/><path d="M3 12h18M4.500 7.500h15M4.500 16.500h15" stroke="currentColor" stroke-width="1.400" fill="none"/>')),
      h('span.kb-mic', {}, svg(ICON.mic))
    );
  }

  press(ev, k, action, opts) {
    ev.preventDefault(); ev.stopPropagation();
    if (!this.target) return;
    k.classList.add('down');
    const isLetter = !opts.cls || !/mod|space/.test(opts.cls);
    sfx.play(opts.code === 'Backspace' ? 'keyDel' : (isLetter ? 'key' : 'keyMod'));
    if (isLetter && k.textContent.length === 1) this.showPop(k);
    action();
    let rep = null;
    if (opts.code === 'Backspace') {
      rep = setTimeout(() => { rep = setInterval(() => { this.del(); sfx.play('keyDel'); }, 55); }, 380);
    }
    const up = () => {
      k.classList.remove('down'); this.hidePop();
      clearTimeout(rep); clearInterval(rep);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  showPop(k) {
    const kr = k.getBoundingClientRect(), er = this.el.getBoundingClientRect();
    const s = er.width / this.el.offsetWidth || 1;
    this.pop.textContent = k.textContent;
    this.pop.style.left = ((kr.left - er.left) / s + kr.width / s / 2) + 'px';
    this.pop.style.top = ((kr.top - er.top) / s - 6) + 'px';
    this.pop.classList.add('on');
  }
  hidePop() { this.pop.classList.remove('on'); }

  // ---- text editing ----
  insert(text) {
    const t = this.target; if (!t) return;
    if (t.maxLength > 0 && t.value.length + text.length > t.maxLength) return;
    const s = t.selectionStart ?? t.value.length, e = t.selectionEnd ?? t.value.length;
    t.setRangeText(text, s, e, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }
  type(c) {
    this.insert(this.shift !== 'off' && this.mode === 'abc' ? c.toUpperCase() : c);
    if (this.shift === 'once') { this.shift = 'off'; this.render(); }
    this.lastSpace = 0;
    this.suggest();
  }
  del() {
    const t = this.target; if (!t) return;
    const s = t.selectionStart, e = t.selectionEnd;
    if (s !== e) t.setRangeText('', s, e, 'end');
    else if (s > 0) t.setRangeText('', s - 1, s, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
    this.autoCap(); this.suggest();
  }
  space() {
    const t = this.target; if (!t) return;
    const now = performance.now();
    const before = t.value.slice(0, t.selectionStart);
    if (this.lastSpace && now - this.lastSpace < 450 && /\S $/.test(before) && !/[.!?] $/.test(before)) {
      t.setRangeText('', t.selectionStart - 1, t.selectionStart, 'end'); this.insert('. '); this.shift = 'once'; this.render();
    } else this.insert(' ');
    this.lastSpace = now; this.autoCap(); this.suggest();
  }
  enter() {
    const t = this.target; if (!t) return;
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    const handled = !t.dispatchEvent(ev);
    if (!handled && t.tagName === 'TEXTAREA') { this.insert('\n'); this.shift = 'once'; this.render(); }
  }
  toggleShift() {
    const now = performance.now();
    if (this.shift === 'once' && this._lastShift && now - this._lastShift < 350) this.shift = 'lock';
    else this.shift = this.shift === 'off' ? 'once' : 'off';
    this._lastShift = now; this.render();
  }
  autoCap() {
    const t = this.target; if (!t || this.shift === 'lock' || t.dataset.autocap === 'off') return;
    const before = t.value.slice(0, t.selectionStart);
    const want = before === '' || /[.!?]\s+$/.test(before) || /\n$/.test(before);
    const now = want ? 'once' : 'off';
    if (now !== this.shift) { this.shift = now; this.render(); }
  }

  // ---- predictive bar ----
  suggest() {
    const t = this.target; if (!t) return;
    const before = t.value.slice(0, t.selectionStart);
    const m = before.match(/([A-Za-z']+)$/);
    const word = m ? m[1] : '';
    let sug = [];
    if (word) {
      const lw = word.toLowerCase();
      sug = WORDS.filter(w => w.startsWith(lw) && w !== lw).slice(0, 2);
      if (WORDS.includes(lw) || sug.length === 0) sug = [word, ...sug].slice(0, 3); else sug = [`"${word}"`, ...sug];
    } else {
      const prev = (before.trim().split(/\s+/).pop() || '').toLowerCase();
      const next = { i: ['am', 'think', "'m"], the: ['best', 'same', 'first'], you: ['are', 'can', 'know'], hello: ['there', 'how', 'world'], thank: ['you', 'you!', 'goodness'], how: ['are', 'is', 'do'], what: ['do', 'is', 'time'] }[prev];
      sug = next || (before.trim() ? ['and', 'the', 'I'] : ['I', 'The', "I'm"]);
    }
    this.bar.replaceChildren(...sug.map((w, i) => {
      const b = h('button.sg', {}, w.replace(/^"|"$/g, ''));
      if (i === 0 && /^"/.test(w)) b.classList.add('lit');
      b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation(); sfx.play('keyMod');
        const clean = w.replace(/^"|"$/g, '');
        if (word) t.setRangeText(clean + ' ', t.selectionStart - word.length, t.selectionStart, 'end');
        else this.insert(clean + ' ');
        t.dispatchEvent(new Event('input', { bubbles: true }));
        this.autoCap(); this.suggest();
      });
      return b;
    }));
  }

  /** Flash a virtual key when the physical keyboard is used. */
  physical(e) {
    if (!this.shown) return;
    const code = e.key === 'Backspace' ? 'Backspace' : e.key === 'Enter' ? 'Enter' : e.key === ' ' ? ' ' : e.key.length === 1 ? e.key.toLowerCase() : null;
    if (!code) return;
    sfx.play(code === 'Backspace' ? 'keyDel' : /[ \n]/.test(code) || code === 'Enter' ? 'keyMod' : 'key');
    const k = this.rows.querySelector(`[data-k="${CSS.escape(code)}"]`);
    if (k) { k.classList.add('down'); if (code.length === 1 && code !== ' ') this.showPop(k); setTimeout(() => { k.classList.remove('down'); this.hidePop(); }, 90); }
    setTimeout(() => { this.suggest(); this.autoCap(); }, 0);
  }
}
