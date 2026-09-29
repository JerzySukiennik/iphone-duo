// Small DOM + math helpers shared by everything.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const raf = () => new Promise(r => requestAnimationFrame(r));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const pad = n => String(n).padStart(2, '0');

/** Hyperscript: h('div.foo#bar', {onclick, style:{...}, dataset:{}}, ...children) */
export function h(sel, attrs, ...kids) {
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  const m = sel.match(/^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i);
  const tag = m[1] || 'div';
  const svgTags = 'svg path circle rect g line polyline polygon ellipse defs linearGradient radialGradient stop clipPath mask text use filter feGaussianBlur';
  const isSvg = svgTags.split(' ').includes(tag);
  const el = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  (m[2].match(/[.#][\w-]+/g) || []).forEach(t => {
    if (t[0] === '.') el.classList.add(t.slice(1));
    else el.id = t.slice(1);
  });
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') v.split(' ').filter(Boolean).forEach(c => el.classList.add(c));
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function svg(inner, vb = '0 0 24 24', attrs = '') {
  const s = document.createElement('span');
  s.className = 'svgi';
  s.innerHTML = `<svg viewBox="${vb}" ${attrs}>${inner}</svg>`;
  return s;
}

/** SF-Symbols-ish glyphs (stroke/fill drawn by hand). */
export const ICON = {
  chevronL: '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  chevronR: '<path d="m9 4 8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  xmark: '<path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  heart: '<path d="M12 20.5C5 15.3 2.5 11.8 2.5 8.4 2.5 5.7 4.6 3.6 7.2 3.6c1.9 0 3.6 1 4.8 2.8 1.2-1.8 2.9-2.8 4.8-2.8 2.6 0 4.7 2.1 4.7 4.8 0 3.4-2.5 6.9-9.5 12.1Z" />',
  comment: '<path d="M12 3.2c-5 0-9 3.5-9 8 0 2.3 1 4.3 2.7 5.8-.2 1.4-.9 2.7-1.8 3.6 2 0 3.7-.7 5-1.8.9.3 1.9.4 3.1.4 5 0 9-3.5 9-8s-4-8-9-8Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  share: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4.6-6 4.6v-17Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  more: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  compose: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10-13.5 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  play: '<path d="M7 4.5v15l13-7.5L7 4.5Z"/>',
  pause: '<rect x="6" y="4.5" width="4.4" height="15" rx="1.2"/><rect x="13.6" y="4.5" width="4.4" height="15" rx="1.2"/>',
  next: '<path d="M4 5v14l9-7-9-7Zm9 0v14l9-7-9-7Z"/>',
  prev: '<path d="M20 5v14l-9-7 9-7Zm-9 0v14L2 12l9-7Z"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4v-5Z"/><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>',
  photo: '<rect x="3" y="4.5" width="18" height="15" rx="2.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 18 5.5-5 3.5 3 3-2.5L20 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  camflip: '<path d="M4 8.5h3.2l1.3-2h7l1.3 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9.5 13.5a3 3 0 0 1 5-1.6M14.5 13.5a3 3 0 0 1-5 1.6M14.6 10.6v1.6h-1.6M9.4 16.4v-1.6h1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  flash: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9.5v4l2.5 1.5M9.5 3h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  live: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="1.6 1.9"/><circle cx="12" cy="12" r="9.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  check: '<path d="m4.5 12.5 5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  phone: '<path d="M6.6 3.2 9 3l1.6 4.2-2 1.6a12 12 0 0 0 5.6 5.6l1.6-2L20 13.999l-.2 2.4a2.4 2.4 0 0 1-2.4 2.2C10 18.600 5.400 14 5 6.600a2.400 2.400 0 0 1 1.600-3.400Z"/>',
  plane: '<path d="M21 15.500v-2L13.500 9V4a1.500 1.500 0 0 0-3 0v5L3 13.500v2l7.500-2.300V18l-2 1.500V21l3.500-1 3.500 1v-1.500l-2-1.500v-4.800L21 15.500Z"/>',
  cell: '<rect x="3.500" y="14" width="3.200" height="6" rx="1"/><rect x="8.400" y="10.500" width="3.200" height="9.500" rx="1"/><rect x="13.300" y="7" width="3.200" height="13" rx="1"/><rect x="18.200" y="3.500" width="3.200" height="16.500" rx="1"/>',
  wifi: '<path d="M12 19a1.900 1.900 0 1 0 0 .01M6.500 14.300a8 8 0 0 1 11 0M2.900 10.400a13 13 0 0 1 18.200 0" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/>',
  bt: '<path d="m7 7.500 10 9-5 4.500V3l5 4.500-10 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  bell: '<path d="M12 3.500a5.500 5.500 0 0 0-5.500 5.500v3.500L4.500 16h15l-2-3.500V9A5.500 5.500 0 0 0 12 3.500ZM10 18.500a2 2 0 0 0 4 0"/>',
  moon: '<path d="M20.500 14.500A8.500 8.500 0 1 1 9.500 3.500a7 7 0 0 0 11 11Z"/>',
  rotlock: '<path d="M6 9.500a7 7 0 0 1 12-2.300M18 14.500a7 7 0 0 1-12 2.300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.500 4v3.800h-3.800M5.500 20v-3.800h3.800" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="10.500" width="4" height="4" rx=".8"/>',
  sun: '<circle cx="12" cy="12" r="4.200"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round">' + Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<line x1="${12+Math.cos(a)*7.500}" y1="${12+Math.sin(a)*7.500}" x2="${12+Math.cos(a)*9.800}" y2="${12+Math.sin(a)*9.800}"/>`}).join('') + '</g>',
  calc: '<rect x="4.500" y="3" width="15" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7.500" y="6" width="9" height="3.500" rx=".8"/><circle cx="8.500" cy="13" r="1.200"/><circle cx="12" cy="13" r="1.200"/><circle cx="15.500" cy="13" r="1.200"/><circle cx="8.500" cy="17" r="1.200"/><circle cx="12" cy="17" r="1.200"/><circle cx="15.500" cy="17" r="1.200"/>',
  splitv: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v14" stroke="currentColor" stroke-width="2"/>',
  grid: '<rect x="4" y="4" width="6.500" height="6.500" rx="1.600"/><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.600"/><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.600"/><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.600"/>',
  star: '<path d="m12 3 2.800 5.800 6.200.9-4.500 4.400 1.100 6.200L12 17.300 6.400 20.300l1.100-6.200L3 9.700l6.200-.9L12 3Z"/>',
  list: '<path d="M8 6.500h12M8 12h12M8 17.500h12" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/><circle cx="4.200" cy="6.500" r="1.300"/><circle cx="4.200" cy="12" r="1.300"/><circle cx="4.200" cy="17.500" r="1.300"/>',
  home: '<path d="M3.500 11 12 4l8.500 7v8.500a1 1 0 0 1-1 1H15v-6H9v6H4.500a1 1 0 0 1-1-1V11Z"/>',
  person: '<circle cx="12" cy="8" r="4.200"/><path d="M4 20.500c0-4 3.600-6.500 8-6.500s8 2.500 8 6.500Z"/>',
  keypad: '<g>' + [0,1,2].map(r=>[0,1,2].map(c=>`<circle cx="${6+c*6}" cy="${6+r*6}" r="1.700"/>`).join('')).join('') + '<circle cx="12" cy="20.500" r="1.700"/></g>',
  clockic: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.500l3.500 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  globe: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="3.800" ry="9" fill="none" stroke="currentColor" stroke-width="1.700"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.700"/>',
  down: '<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>',
  up: '<path d="m5 15 7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/>',
  sliders: '<path d="M4 8h9M17 8h3M4 16h3M11 16h9" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"/><circle cx="15" cy="8" r="2.400" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="16" r="2.400" fill="none" stroke="currentColor" stroke-width="2"/>',
  duo: '<rect x="2.500" y="6" width="7.500" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.900"/><rect x="14" y="6" width="7.500" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.900"/><circle cx="17.700" cy="9.500" r="1.100"/>',
  kid: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.900"/><circle cx="9" cy="10" r="1.200"/><circle cx="15" cy="10" r="1.200"/><path d="M8 14.500a4.500 4.500 0 0 0 8 0" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linecap="round"/>',
  pin: '<path d="M12 21.5s-6.5-6.200-6.500-11a6.500 6.500 0 0 1 13 0c0 4.800-6.500 11-6.500 11Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10.500" r="2.400"/>',
};
export const icon = (name, size, extra = '') => {
  const s = svg(ICON[name] || '', '0 0 24 24', 'fill="currentColor" ' + extra);
  if (size) { s.style.width = s.style.height = size + 'px'; }
  return s;
};

export function fmtTime(d = new Date(), opts = {}) {
  let hh = d.getHours(), mm = pad(d.getMinutes());
  if (!opts.h24) hh = hh % 12 || 12;
  return `${hh}:${mm}`;
}
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDate = (d = new Date()) => `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Critically-damped-ish spring stepper for scalar values. */
export class Spring {
  constructor(v = 0, k = 170, c = 26) { this.v = v; this.t = v; this.vel = 0; this.k = k; this.c = c; }
  step(dt) {
    const a = (this.t - this.v) * this.k - this.vel * this.c;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
  get settled() { return Math.abs(this.t - this.v) < 0.02 && Math.abs(this.vel) < 0.05; }
}

/** Simple pub/sub. */
export class Emitter {
  constructor() { this._l = {}; }
  on(e, f) { (this._l[e] ||= []).push(f); return () => this.off(e, f); }
  off(e, f) { this._l[e] = (this._l[e] || []).filter(x => x !== f); }
  emit(e, ...a) { (this._l[e] || []).slice().forEach(f => f(...a)); }
}

/** localStorage with JSON + try/catch. */
export const store = {
  get(k, d) { try { const v = localStorage.getItem('duo:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('duo:' + k, JSON.stringify(v)); } catch { /* quota */ } },
};

/** Tiny IndexedDB key-blob store (photos/videos). */
export const idb = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      const r = indexedDB.open('iphone-duo', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('media', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this._db;
  },
  async all() {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => {
        const q = db.transaction('media').objectStore('media').getAll();
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
    } catch { return []; }
  },
  async put(rec) {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => {
        const q = db.transaction('media', 'readwrite').objectStore('media').put(rec);
        q.onsuccess = () => res(); q.onerror = () => rej(q.error);
      });
    } catch { /* ignore */ }
  },
  async del(id) {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => {
        const q = db.transaction('media', 'readwrite').objectStore('media').delete(id);
        q.onsuccess = () => res(); q.onerror = () => rej(q.error);
      });
    } catch { /* ignore */ }
  },
};
