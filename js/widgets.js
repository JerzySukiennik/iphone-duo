// Home & lock-screen widgets, plus the weather glyph set (shared with the Weather app).
import { h, icon, DAYS, pad } from './util.js';
import { WEATHER, todaysEvents, wxKind, artBg, TRACKS, LIBRARY } from './data.js';
export const LIB_FEATURED = ['assets/img/p1062.jpg', 'assets/img/p1043.jpg', 'assets/img/p1015.jpg', 'assets/img/p190.jpg'];

export function wxIcon(kind, size = 28, night = false) {
  const sun = `<circle cx="16" cy="16" r="7.500" fill="url(#sg)"/><g stroke="#ffd60a" stroke-width="2.200" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${16 + Math.cos(a) * 11}" y1="${16 + Math.sin(a) * 11}" x2="${16 + Math.cos(a) * 14}" y2="${16 + Math.sin(a) * 14}"/>`; }).join('')}</g>`;
  const moon = '<path d="M21 4.500A11.500 11.500 0 1 0 27.500 21 9 9 0 0 1 21 4.500Z" fill="#e8ecff"/>';
  const cloud = (fill = '#fff', dx = 0, dy = 0) => `<path transform="translate(${dx} ${dy})" d="M9.500 26a6.200 6.200 0 0 1-.6-12.400A8.200 8.200 0 0 1 24.800 12.300 6.900 6.900 0 0 1 24 26H9.500Z" fill="${fill}"/>`;
  const drops = '<g stroke="#5ac8fa" stroke-width="2.200" stroke-linecap="round"><line x1="11" y1="27" x2="9.500" y2="30.500"/><line x1="17" y1="27" x2="15.500" y2="30.500"/><line x1="23" y1="27" x2="21.500" y2="30.500"/></g>';
  const flakes = '<g fill="#fff"><circle cx="11" cy="28.500" r="1.600"/><circle cx="17" cy="30" r="1.600"/><circle cx="23" cy="28.500" r="1.600"/></g>';
  const bolt = '<path d="M17.500 21.500 13 28h3.500l-1.500 5 6-8h-3.800l2-3.500Z" fill="#ffd60a"/>';
  const fog = '<g stroke="#dfe3ea" stroke-width="2.400" stroke-linecap="round"><line x1="6" y1="12" x2="26" y2="12"/><line x1="4" y1="18" x2="24" y2="18"/><line x1="8" y1="24" x2="28" y2="24"/></g>';
  const body = {
    sun: night ? moon : sun,
    partly: (night ? '<g transform="translate(-2 -3) scale(.8)">' + moon + '</g>' : '<g transform="translate(-3 -4) scale(.85)">' + sun + '</g>') + cloud('#fff', 2, -1),
    cloud: cloud('#e8ecf3', 0, -1),
    rain: cloud('#c8d0dc', 0, -3) + drops,
    snow: cloud('#e6ebf3', 0, -3) + flakes,
    storm: cloud('#9aa3b2', 0, -3) + bolt,
    fog,
  }[kind] || cloud();
  const el = h('span.svgi', { style: { width: size + 'px', height: size + 'px' } });
  el.innerHTML = `<svg viewBox="0 0 32 32" width="100%" height="100%"><defs><radialGradient id="sg"><stop offset="0" stop-color="#fff2a8"/><stop offset="1" stop-color="#ffc21a"/></radialGradient></defs>${body}</svg>`;
  return el;
}
const isNight = () => { const hr = new Date().getHours(); return hr >= 20 || hr < 6; };
export const skyBg = () => isNight() ? 'linear-gradient(180deg,#141b3a,#2c3f78)' : 'linear-gradient(180deg,#3a7be0,#7fbcf5)';

export function weatherWidget(size = 's') {
  const w = h('div.widget.weather.' + size, { style: { background: skyBg() } });
  let sig = '';
  const upd = () => {
    const ns = [WEATHER.temp, WEATHER.code, WEATHER.hi, WEATHER.lo, WEATHER.hourly[0] && WEATHER.hourly[0].h, isNight()].join('|');
    if (ns === sig) return; sig = ns;
    w.style.background = skyBg();
    const kind = wxKind(WEATHER.code);
    if (size === 's') w.replaceChildren(
      h('div.w-loc', {}, h('span.loc', {}, '➤ '), WEATHER.city),
      h('div.w-temp', {}, WEATHER.temp + '°'),
      h('div.w-cond', {}, wxIcon(kind, 18, isNight()), h('span', {}, WEATHER.cond)),
      h('div.w-hl', {}, `H:${WEATHER.hi}°  L:${WEATHER.lo}°`));
    else w.replaceChildren(
      h('div.w-top', {}, h('div', {}, h('div.w-loc', {}, h('span.loc', {}, '➤ '), WEATHER.city), h('div.w-temp', {}, WEATHER.temp + '°')), h('div.w-right', {}, wxIcon(kind, 26, isNight()), h('div.w-cond2', {}, WEATHER.cond), h('div.w-hl', {}, `H:${WEATHER.hi}°  L:${WEATHER.lo}°`))),
      h('div.w-hours', {}, ...WEATHER.hourly.slice(0, 6).map((x, i) => h('div', {}, h('small', {}, i === 0 ? 'Now' : ((x.h % 12) || 12) + (x.h < 12 ? 'AM' : 'PM')), wxIcon(wxKind(x.code), 22, x.h >= 20 || x.h < 6), h('b', {}, x.t + '°')))));
  };
  upd(); w._upd = upd;
  return w;
}

export function calendarWidget(size = 's') {
  const w = h('div.widget.calw.' + size);
  let sig = '';
  const upd = () => {
    const d = new Date(), ev = todaysEvents().filter(e => e.end > d).slice(0, size === 's' ? 2 : 3);
    const ns = d.getDate() + '|' + ev.map(e => e.title).join(',');
    if (ns === sig) return; sig = ns;
    w.replaceChildren(
      h('div.cw-head', {}, h('span.cw-day', {}, DAYS[d.getDay()].toUpperCase()), h('span.cw-num', {}, d.getDate())),
      h('div.cw-ev', {}, ...(ev.length ? ev.map(e => h('div.cw-e', { style: { '--c': e.color } }, h('i'), h('div', {}, h('b', {}, e.title), h('small', {}, e.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))))) : [h('div.cw-none', {}, 'No more events today')])));
  };
  upd(); w._upd = upd;
  return w;
}

export function clockWidget() {
  const w = h('div.widget.clockw.s');
  w.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1c1c1e"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180, r1 = i % 3 ? 40 : 37; return `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 43}" y2="${50 - Math.cos(a) * 43}" stroke="#fff" stroke-width="${i % 3 ? 1.400 : 2.800}" stroke-linecap="round"/>`; }).join('')}
    <line class="hh" x1="50" y1="50" x2="50" y2="28" stroke="#fff" stroke-width="4.600" stroke-linecap="round"/><line class="mh" x1="50" y1="50" x2="50" y2="14" stroke="#fff" stroke-width="3.400" stroke-linecap="round"/>
    <line class="sh" x1="50" y1="58" x2="50" y2="12" stroke="#ff9f0a" stroke-width="1.800" stroke-linecap="round"/><circle cx="50" cy="50" r="3.400" fill="#ff9f0a"/><circle cx="50" cy="50" r="1.400" fill="#1c1c1e"/></svg>`;
  const hh = w.querySelector('.hh'), mh = w.querySelector('.mh'), sh = w.querySelector('.sh');
  w._upd = () => {
    const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
    hh.setAttribute('transform', `rotate(${hr * 30} 50 50)`); mh.setAttribute('transform', `rotate(${m * 6} 50 50)`); sh.setAttribute('transform', `rotate(${s * 6} 50 50)`);
  };
  w._fast = true; w._upd();
  return w;
}

export function musicWidget(os) {
  const w = h('div.widget.musicw.s');
  let sig = '';
  const upd = () => {
    const p = os.player, t = p.track || TRACKS[0];
    const ns = t.id + '|' + p.playing; if (ns === sig) return; sig = ns;
    w.style.background = artBg(t);
    w.replaceChildren(
      h('div.mw-top', {}, h('span.mw-note', {}, icon('play', 12)), h('span', {}, p.playing ? 'Playing' : 'Music')),
      h('div.mw-spacer'),
      h('div.mw-title', {}, t.title), h('div.mw-artist', {}, t.artist),
      h('button.mw-btn', { onclick: e => { e.stopPropagation(); os.player.toggle(); } }, icon(p.playing ? 'pause' : 'play', 16)));
  };
  upd(); w._upd = upd; w._ev = ['music'];
  w.addEventListener('click', () => os.launch('music', w._disp ?? 0));
  return w;
}

export function photosWidget(os) {
  const w = h('div.widget.photow.s');
  let i = Math.floor(Math.random() * LIBRARY.length);
  const a = h('img'), b = h('img.b');
  w.append(a, b, h('div.pw-cap', {}, 'Featured Photo'));
  const set = el => { el.src = LIBRARY[i % LIBRARY.length].src; };
  set(a);
  let front = a;
  w._upd = () => { }; w._every = 6000;
  w._tick = () => { i++; const nxt = front === a ? b : a; set(nxt); nxt.style.opacity = 1; front.style.opacity = 0; front = nxt; };
  a.style.opacity = 1; b.style.opacity = 0;
  w.addEventListener('click', () => os.launch('photos', w._disp ?? 1));
  return w;
}

export function featuredWidget(os) {
  const w = h('div.widget.feat');
  const a = h('img', { src: LIB_FEATURED[0] }), b = h('img');
  b.style.opacity = 0;
  const d = new Date();
  w.append(a, b,
    h('div.feat-cap', {}, h('b', {}, 'On This Day'), h('small', {}, d.toLocaleDateString([], { month: 'long', day: 'numeric' }) + ', ' + (d.getFullYear() - 1))),
    h('div.feat-play', {}, icon('play', 14)));
  let i = 0, front = a;
  w._every = 7000;
  w._tick = () => { i = (i + 1) % LIB_FEATURED.length; const nxt = front === a ? b : a; nxt.src = LIB_FEATURED[i]; nxt.style.opacity = 1; front.style.opacity = 0; front = nxt; };
  return w;
}

export const WIDGETS = { weather: weatherWidget, weatherM: () => weatherWidget('m'), calendar: calendarWidget, calendarM: () => calendarWidget('m'), clock: clockWidget, music: musicWidget, photos: photosWidget };
export const pad2 = pad;
