import { h } from '../util.js';
import { App } from './app.js';
import { sfx } from '../audio.js';

const fmt = n => {
  if (!isFinite(n)) return 'Error';
  let s = Math.abs(n) >= 1e9 || (Math.abs(n) < 1e-6 && n !== 0) ? n.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'e') : String(+n.toPrecision(10));
  if (!/e/.test(s)) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
  return s;
};
const fact = n => { if (n < 0 || n !== Math.floor(n) || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };

export default class Calculator extends App {
  constructor(os, win) { super(os, win); this.reset(); this.mem = 0; this.deg = true; }
  statusTone() { return 'light'; }
  reset() { this.cur = '0'; this.acc = null; this.op = null; this.fresh = true; this.lastOp = null; this.lastVal = null; }

  build() {
    const num = () => parseFloat(this.cur.replace(/,/g, ''));
    this.disp = h('div.c-disp');
    const key = (label, cls, fn, wide) => h('button.ck' + (cls ? '.' + cls : '') + (wide ? '.wide' : ''), { onclick: () => { sfx.play('tick'); fn(); this.render(); } }, label);
    const digit = d => key(d, 'num', () => this.digit(d));
    const opk = (label, o) => key(label, 'op', () => this.setOp(o));
    this.acKey = key('AC', 'fn', () => this.clear());
    const sci = h('div.c-sci', {},
      key('(', 'csf', () => { }), key(')', 'csf', () => { }), key('mc', 'csf', () => { this.mem = 0; }), key('m+', 'csf', () => { this.mem += num(); this.fresh = true; }), key('m−', 'csf', () => { this.mem -= num(); this.fresh = true; }), key('mr', 'csf', () => { this.cur = String(this.mem); this.fresh = true; }),
      key('2ⁿᵈ', 'csf', () => { }), key('x²', 'csf', () => this.un(x => x * x)), key('x³', 'csf', () => this.un(x => x ** 3)), key('xʸ', 'csf', () => this.setOp('pow')), key('eˣ', 'csf', () => this.un(Math.exp)), key('10ˣ', 'csf', () => this.un(x => 10 ** x)),
      key('¹⁄ₓ', 'csf', () => this.un(x => 1 / x)), key('²√x', 'csf', () => this.un(Math.sqrt)), key('³√x', 'csf', () => this.un(Math.cbrt)), key('ʸ√x', 'csf', () => this.setOp('root')), key('ln', 'csf', () => this.un(Math.log)), key('log₁₀', 'csf', () => this.un(Math.log10)),
      key('x!', 'csf', () => this.un(fact)), key('sin', 'csf', () => this.un(x => Math.sin(this.rad(x)))), key('cos', 'csf', () => this.un(x => Math.cos(this.rad(x)))), key('tan', 'csf', () => this.un(x => Math.tan(this.rad(x)))), key('e', 'csf', () => { this.cur = String(Math.E); this.fresh = true; }), key('EE', 'csf', () => this.setOp('ee')),
      key('Rand', 'csf', () => { this.cur = String(Math.random()); this.fresh = true; }), key('sinh', 'csf', () => this.un(Math.sinh)), key('cosh', 'csf', () => this.un(Math.cosh)), key('tanh', 'csf', () => this.un(Math.tanh)), key('π', 'csf', () => { this.cur = String(Math.PI); this.fresh = true; }),
      this.degKey = key('Deg', 'csf', () => { this.deg = !this.deg; }));
    const pad = h('div.c-pad', {},
      this.acKey, key('⁺⁄₋', 'fn', () => { this.cur = this.cur.startsWith('-') ? this.cur.slice(1) : (this.cur === '0' ? '0' : '-' + this.cur); }), key('%', 'fn', () => this.un(x => x / 100)), opk('÷', 'div'),
      digit('7'), digit('8'), digit('9'), opk('×', 'mul'),
      digit('4'), digit('5'), digit('6'), opk('−', 'sub'),
      digit('1'), digit('2'), digit('3'), opk('+', 'add'),
      key('0', 'num', () => this.digit('0'), true), key('.', 'num', () => this.digit('.')), key('=', 'op', () => this.equals()));
    this.pad = pad;
    this.opKeys = [...pad.querySelectorAll('.op')];
    const root = h('div.calc', {}, this.disp, h('div.c-body', {}, sci, pad));
    this.root = root; this.render();
    // physical keyboard support while this window is focused
    root.tabIndex = -1;
    root.addEventListener('keydown', e => {
      if (/^[0-9.]$/.test(e.key)) this.digit(e.key); else if (e.key === '+') this.setOp('add'); else if (e.key === '-') this.setOp('sub'); else if (e.key === '*') this.setOp('mul'); else if (e.key === '/') { e.preventDefault(); this.setOp('div'); }
      else if (e.key === 'Enter' || e.key === '=') this.equals(); else if (e.key === 'Backspace') this.cur = this.cur.length > 1 ? this.cur.slice(0, -1) : '0'; else if (e.key === 'Escape') this.clear(); else return;
      this.render();
    });
    root.addEventListener('pointerdown', () => root.focus({ preventScroll: true }));
    return root;
  }
  rad(x) { return this.deg ? x * Math.PI / 180 : x; }
  digit(d) {
    if (this.fresh) { this.cur = d === '.' ? '0.' : d; this.fresh = false; }
    else if (d === '.') { if (!this.cur.includes('.')) this.cur += '.'; }
    else if (this.cur.replace(/[-.]/g, '').length < 9) this.cur = this.cur === '0' ? d : this.cur + d;
  }
  un(fn) { const v = fn(parseFloat(this.cur)); this.cur = String(isFinite(v) ? +v.toPrecision(12) : NaN); this.fresh = true; }
  calc(a, o, b) {
    return { add: a + b, sub: a - b, mul: a * b, div: a / b, pow: a ** b, root: b ** (1 / a) , ee: a * 10 ** b }[o];
  }
  setOp(o) {
    if (this.op && !this.fresh) this.equalsChain();
    this.acc = parseFloat(this.cur); this.op = o; this.fresh = true; this.lastOp = null;
  }
  equalsChain() { const v = this.calc(this.acc, this.op, parseFloat(this.cur)); this.cur = String(+(+v).toPrecision(12)); this.acc = parseFloat(this.cur); }
  equals() {
    if (this.op) { const b = parseFloat(this.cur); this.lastOp = this.op; this.lastVal = b; const v = this.calc(this.acc, this.op, b); this.cur = String(+(+v).toPrecision(12)); this.op = null; }
    else if (this.lastOp) { const v = this.calc(parseFloat(this.cur), this.lastOp, this.lastVal); this.cur = String(+(+v).toPrecision(12)); }
    this.fresh = true;
  }
  clear() { if (this.cur === '0' || this.acKey.textContent === 'AC') this.reset(); else { this.cur = '0'; } }
  render() {
    const shown = /^-?\d*\.?\d*$/.test(this.cur) && !this.fresh ? (this.cur.includes('.') ? (() => { const [a, b] = this.cur.split('.'); return fmt(parseFloat(a || '0')).replace(/^-?0$/, this.cur.startsWith('-') ? '-0' : '0') + '.' + b; })() : fmt(parseFloat(this.cur))) : fmt(parseFloat(this.cur));
    this.disp.textContent = this.cur === 'NaN' ? 'Error' : shown;
    const len = this.disp.textContent.length;
    this.disp.style.fontSize = Math.max(34, Math.min(92, 560 / Math.max(len, 5))) + 'px';
    this.acKey.textContent = this.cur === '0' && this.acc == null ? 'AC' : 'C';
    this.opKeys.forEach(k => k.classList.toggle('active', !!this.op && this.fresh && k.textContent === { add: '+', sub: '−', mul: '×', div: '÷' }[this.op]));
    if (this.degKey) this.degKey.textContent = this.deg ? 'Deg' : 'Rad';
  }
}
