import { Device } from './device.js';
import { OS } from './os.js';
import { h, icon, svg } from './util.js';
import { sfx } from './audio.js';
import { ensureSquircle } from './icons.js';

ensureSquircle();
const dev = new Device(document.getElementById('scaler'));
dev.fit(); addEventListener('resize', () => dev.fit());

// the product starts closed, like on the shelf
dev.fold = dev.target = 180; dev.applyAll();
const os = new OS(dev);
window.dev = dev; window.os = os;

/* ---------------------------------------------------------------- toolbar */
const tb = document.getElementById('toolbar');
const btn = (ic, label, fn, title) => {
  const b = h('button', { title: title || label, onclick: e => { sfx.init(); fn(b, e); } }, icon(ic), h('span.lbl', {}, label));
  return b;
};
const G = {
  fold: '<path d="M4 5.500h6.500v13H4zM13.500 5.500H20v13h-6.500z" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linejoin="round"/>',
  rotate: '<path d="M4 12a8 8 0 0 1 13.500-5.800M20 12a8 8 0 0 1-13.500 5.800" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4.500h-4.500M6 21v-4.500h4.500" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  laptop: '<path d="M5 4.500h14v9H5zM2.500 18h19l-2 2h-15z" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linejoin="round"/>',
  tent: '<path d="M12 4 4.500 19.500h15L12 4Z" fill="none" stroke="currentColor" stroke-width="1.900" stroke-linejoin="round"/>',
  flip: '<path d="M12 3v18M7 8 3 12l4 4M17 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  color: '<circle cx="12" cy="12" r="8.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.500a8.500 8.500 0 0 1 0 17Z"/>',
  split: '<rect x="3" y="5" width="18" height="14" rx="3.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5v14" stroke="currentColor" stroke-width="2"/>',
  cards: '<rect x="7" y="5" width="10" height="14" rx="2.500" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.500 8v8M20.500 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const ic = k => { const s = svg(G[k]); return s; };
const tbtn = (k, label, fn, title) => {
  const b = h('button', { title: title || label, onclick: e => { sfx.init(); fn(b, e); } }, ic(k), h('span.lbl', {}, label));
  return b;
};

const foldBtn = tbtn('fold', 'Close', () => {
  const closing = dev.target < 90 || dev.posture !== 'closed' && dev.target < 170;
  os.pose(dev.target > 90 && dev.target > 170 ? 'open' : 'closed');
  sfx.play('thunk');
}, 'Open / close the Duo (or drag the left edge)');
const rotBtn = tbtn('rotate', 'Rotate', () => { os.setOrientation(dev.orientT === 0 ? 90 : 0); }, 'Rotate the device');
const lapBtn = tbtn('laptop', 'Laptop', () => os.pose('laptop'), 'Laptop posture: app on top, keyboard below');
const tentBtn = tbtn('tent', 'Tent', () => os.pose('tent'), 'Tent posture');
const flipBtn = tbtn('flip', 'Flip', () => { dev.go({ yaw: dev.yawT === 0 ? 180 : 0 }); setTimeout(() => os.reflow(), 60); }, 'Turn the device over (rear cameras / outer display)');
const colBtn = tbtn('color', 'Colour', () => dev.setColor(dev.color === 'night' ? 'white' : 'night'), 'Night Sky / Star White');
const splitBtn = tbtn('split', 'Split', () => os.startSplit(null, os.focusSurface), 'Split View');
const swBtn = tbtn('cards', 'Apps', () => os.switcher(os.focusSurface), 'App switcher');
tb.append(foldBtn, rotBtn, h('i.sep'), lapBtn, tentBtn, flipBtn, h('i.sep'), splitBtn, swBtn, h('i.sep'), colBtn);

const syncFoldBtn = () => { const closed = dev.target > 170; foldBtn.lastChild.textContent = closed ? 'Open' : 'Close'; };
dev.on('settle', syncFoldBtn); setInterval(syncFoldBtn, 400);
addEventListener('pointerdown', () => sfx.init(), { once: true });

/* ------------------------------------------------------------------ hint */
const hint = document.getElementById('hint');
hint.innerHTML = 'Click <b>Open</b> or drag the left edge · <kbd>Side button</kbd> on the right edge wakes &amp; unlocks';
os.on('unlock', () => { hint.style.opacity = 0; });

/* ------------------------------------------------------------- shortcuts */
addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input,textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'h') { const s = os.focusSurface; if (s && s.switching) s.closeSwitcher(null); else if (s && s.sheets.ccOn || s.sheets.ncOn || s.sheets.spOn) s.sheets.closeAll(); else os.home(s); }
  else if (k === 'o' || k === 'f') foldBtn.click();
  else if (k === 'r') rotBtn.click();
  else if (k === 'l') lapBtn.click();
  else if (k === 't') tentBtn.click();
  else if (k === 'b') flipBtn.click();
  else if (k === 'p') os.pressSide();
});
