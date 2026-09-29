// App icons drawn as inline SVG on a superellipse ("squircle") mask, iOS style.
import { h } from './util.js';

let sqDone = false;
export function ensureSquircle() {
  if (sqDone) return; sqDone = true;
  const n = 5, pts = [];
  for (let i = 0; i < 120; i++) {
    const t = i / 120 * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push(`${(.5 + .5 * x).toFixed(4)},${(.5 + .5 * y).toFixed(4)}`);
  }
  const d = 'M' + pts.join('L') + 'Z';
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.innerHTML = `<svg width="0" height="0"><clipPath id="sq" clipPathUnits="objectBoundingBox"><path d="${d}"/></clipPath></svg>`;
  document.body.append(holder);
}

const grad = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
let uid = 0;

const ART = {
  phone: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#62e070', '#1fb636')}</defs><rect width="60" height="60" fill="url(#${g})"/>
    <g transform="translate(13 13) scale(1.4)" fill="#fff"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></g>`; },
  messages: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#68e779', '#17b532')}</defs><rect width="60" height="60" fill="url(#${g})"/>
    <path d="M30 12c-11.600 0-21 7-21 15.800 0 5 3 9.400 7.700 12.300-.6 2.400-2 4.700-3.900 6.400 4.200-.4 7.600-2.200 9.700-4 2.200.7 4.600 1 7.500 1 11.600 0 21-7.200 21-15.700S41.600 12 30 12Z" fill="#fff"/>`; },
  safari: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#ffffff', '#e8eaef')}<linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ea0ff"/><stop offset="1" stop-color="#0a5fe3"/></linearGradient></defs>
    <rect width="60" height="60" fill="url(#${g})"/><circle cx="30" cy="30" r="21.500" fill="url(#${g}b)"/><circle cx="30" cy="30" r="21.500" fill="none" stroke="#fff" stroke-width="1.400" opacity=".6"/>
    ${Array.from({ length: 60 }, (_, i) => { const a = i * 6 * Math.PI / 180, r1 = i % 5 ? 19.600 : 18.400, r2 = 20.600; return `<line x1="${30 + Math.sin(a) * r1}" y1="${30 - Math.cos(a) * r1}" x2="${30 + Math.sin(a) * r2}" y2="${30 - Math.cos(a) * r2}" stroke="#fff" stroke-width="${i % 5 ? .4 : .9}" opacity=".85"/>`; }).join('')}
    <g transform="rotate(45 30 30)"><path d="M30 12 35 30H25Z" fill="#ff3b30"/><path d="M30 48 25 30H35Z" fill="#fff"/></g><circle cx="30" cy="30" r="1.600" fill="#fff"/>`; },
  music: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#ff7a90', '#fa1f3d')}</defs><rect width="60" height="60" fill="url(#${g})"/>
    <path d="M40 11.500v22.200c0 3.400-2.900 5.800-6.400 5.800-2.900 0-5.100-1.700-5.100-4.200 0-2.600 2.300-4.500 5.600-4.500 1.200 0 2.200.2 3 .6V20l-11 2.500v15c0 3.400-2.900 5.800-6.400 5.800-2.900 0-5.100-1.700-5.100-4.200 0-2.600 2.300-4.500 5.600-4.500 1.200 0 2.200.2 3 .6V18.200c0-1.100.7-2 1.800-2.300l13.100-3.400c.8-.2 1.500.3 1.500 1Z" fill="#fff" transform="translate(6 3) scale(.86)"/>`; },
  camera: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#d4d5d9', '#8a8b91')}</defs><rect width="60" height="60" fill="url(#${g})"/>
    <path d="M12 21h7.500l2.400-4.500h16.200L40.500 21H48a3.500 3.500 0 0 1 3.500 3.500v19A3.500 3.500 0 0 1 48 47H12a3.500 3.500 0 0 1-3.500-3.500v-19A3.500 3.500 0 0 1 12 21Z" fill="#1c1c1e"/>
    <circle cx="30" cy="33.500" r="9.500" fill="#2c2c2e" stroke="#4a4a4e" stroke-width="1.200"/><circle cx="30" cy="33.500" r="6.200" fill="#0a0e1a"/><circle cx="27.600" cy="31" r="1.800" fill="#5a6fb0" opacity=".8"/>
    <circle cx="44.500" cy="26" r="1.700" fill="#ffd60a"/>`; },
  photos: () => { const cols = ['#ff453a', '#ff9f0a', '#ffd60a', '#a3e635', '#30d158', '#32ade6', '#5e5ce6', '#bf5af2']; return `<rect width="60" height="60" fill="#fff"/>
    <g style="mix-blend-mode:multiply">${cols.map((c, i) => `<ellipse cx="30" cy="19.500" rx="7.800" ry="12" fill="${c}" opacity=".92" transform="rotate(${i * 45} 30 30)"/>`).join('')}</g>`; },
  reels: () => { const g = 'g' + uid++; return `<defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffb02e"/><stop offset=".35" stop-color="#ff3e6c"/><stop offset=".7" stop-color="#c026d3"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>
    <rect width="60" height="60" fill="url(#${g})"/><rect x="13" y="13" width="34" height="34" rx="9.500" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M13.500 23.500h33M23 13.500l6 10M33 13.500l6 10" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M26 30.500v10l8.600-5-8.600-5Z" fill="#fff"/>`; },
  clock: () => `<rect width="60" height="60" fill="#000"/><circle cx="30" cy="30" r="26" fill="#fff"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<line x1="${30 + Math.sin(a) * 22.500}" y1="${30 - Math.cos(a) * 22.500}" x2="${30 + Math.sin(a) * 24.500}" y2="${30 - Math.cos(a) * 24.500}" stroke="#1c1c1e" stroke-width="${i % 3 ? 1 : 1.800}"/>`; }).join('')}
    <line class="hh" x1="30" y1="30" x2="30" y2="17" stroke="#1c1c1e" stroke-width="2.600" stroke-linecap="round"/>
    <line class="mh" x1="30" y1="30" x2="30" y2="10.500" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"/>
    <line class="sh" x1="30" y1="36" x2="30" y2="8.500" stroke="#ff9f0a" stroke-width="1" stroke-linecap="round"/><circle cx="30" cy="30" r="2" fill="#ff9f0a"/>`,
  calculator: () => `<rect width="60" height="60" fill="#1c1c1e"/><rect x="9" y="9" width="42" height="12" rx="3" fill="#3a3a3c"/><text x="47" y="19" text-anchor="end" font-size="10" fill="#fff" font-family="-apple-system,sans-serif" font-weight="300">0</text>
    ${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<rect x="${9 + c * 11}" y="${25 + r * 10.500}" width="9" height="8.500" rx="4.250" fill="${c === 3 ? '#ff9f0a' : (r === 0 ? '#a5a5a5' : '#333336')}"/>`).join('')).join('')}`,
  notes: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#ffe066', '#ffcc00')}</defs><rect width="60" height="60" fill="#fffdf5"/><rect width="60" height="17" fill="url(#${g})"/>
    ${[0, 1, 2, 3].map(i => `<line x1="8" y1="${26 + i * 8.500}" x2="52" y2="${26 + i * 8.500}" stroke="#e2dfd0" stroke-width="1.100"/>`).join('')}<path d="M8 8.500h5M8 8.500h0" stroke="none"/>`; },
  weather: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#2f7bf0', '#7cc8ff')}<radialGradient id="${g}s"><stop offset="0" stop-color="#fff4b0"/><stop offset="1" stop-color="#ffc21a"/></radialGradient></defs><rect width="60" height="60" fill="url(#${g})"/>
    <circle cx="24" cy="24" r="10.500" fill="url(#${g}s)"/><path d="M22 47a9 9 0 0 1 1.500-17.900A12 12 0 0 1 46 33a7 7 0 0 1-1 14H22Z" fill="#fff" opacity=".96"/>`; },
  calendar: () => { const d = new Date(); return `<rect width="60" height="60" fill="#fff"/><text x="30" y="14.500" text-anchor="middle" font-size="8.500" font-weight="600" fill="#ff3b30" font-family="-apple-system,sans-serif" letter-spacing=".3">${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}</text>
    <text x="30" y="46" text-anchor="middle" font-size="34" font-weight="300" fill="#1c1c1e" font-family="-apple-system,'SF Pro Display',sans-serif">${d.getDate()}</text>`; },
  settings: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#b5b7bd', '#7a7c83')}</defs><rect width="60" height="60" fill="url(#${g})"/>
    <g transform="translate(30 30)"><g fill="#e9eaee">${Array.from({ length: 8 }, (_, i) => `<rect x="-3.400" y="-21" width="6.800" height="9" rx="1.800" transform="rotate(${i * 45})"/>`).join('')}<circle r="15.500"/></g><circle r="14.200" fill="none" stroke="#9a9ca4" stroke-width=".8"/><circle r="7.200" fill="#7f8189"/><circle r="5" fill="#d0d2d8"/></g>`; },
  voicememos: () => `<rect width="60" height="60" fill="#111"/><g fill="#ff453a">${[8, 14, 22, 30, 20, 12, 26, 16, 9].map((v, i) => `<rect x="${8 + i * 4.900}" y="${31 - v / 2}" width="2.600" height="${v}" rx="1.300"/>`).join('')}</g><rect x="9" y="46" width="42" height="1.600" rx=".8" fill="#5a5a5e"/>`,
  files: () => { const g = 'g' + uid++; return `<defs>${grad(g, '#46a9ff', '#0a6cf0')}</defs><rect width="60" height="60" fill="#fff"/><path d="M11 19a3 3 0 0 1 3-3h10.500l4 4H46a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V19Z" fill="url(#${g})"/>`; },
  maps: () => `<rect width="60" height="60" fill="#e8f0d8"/><path d="M0 40 60 22v12L0 52Z" fill="#fff"/><path d="M30 0v60" stroke="#fff" stroke-width="7"/><path d="M0 14 60 44" stroke="#f7d774" stroke-width="5"/><path d="M30 12a9 9 0 0 1 9 9c0 7-9 15-9 15s-9-8-9-15a9 9 0 0 1 9-9Z" fill="#ff3b30"/><circle cx="30" cy="21" r="3.500" fill="#fff"/>`,
};

export const APP_ART = ART;

/** Build an icon element (size in px). */
export function appIcon(id, size = 60) {
  ensureSquircle();
  const art = ART[id];
  const el = h('div.ico', { style: { width: size + 'px', height: size + 'px' } });
  el.innerHTML = `<svg viewBox="0 0 60 60" width="100%" height="100%">${art ? art() : '<rect width="60" height="60" fill="#666"/>'}</svg>`;
  if (id === 'clock') startClockHands(el);
  return el;
}

const clocks = new Set();
let clockTimer = 0;
function paintClock(el) {
  const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
  el._hh.setAttribute('transform', `rotate(${hr * 30} 30 30)`);
  el._mh.setAttribute('transform', `rotate(${m * 6} 30 30)`);
  el._sh.setAttribute('transform', `rotate(${s * 6} 30 30)`);
}
function startClockHands(el) {
  el._hh = el.querySelector('.hh'); el._mh = el.querySelector('.mh'); el._sh = el.querySelector('.sh');
  paintClock(el); clocks.add(el);
  if (!clockTimer) clockTimer = setInterval(() => {
    for (const c of clocks) { if (!c.isConnected) { if (c._seen) clocks.delete(c); continue; } c._seen = true; if (c.closest('.ui') && c.closest('.ui').style.visibility === 'hidden') continue; paintClock(c); }
  }, 1000);
}
