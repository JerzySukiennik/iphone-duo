// Shared fake-world data: contacts, calendar, music library, reels, weather.
import { store, pick, rand } from './util.js';

export const ME = { name: 'Jurek', initials: 'J' };

export const CONTACTS = [
  { id: 'alex', name: 'Alex Rivera', num: '+1 (415) 555-0142', hue: 210, mood: 'gaming' },
  { id: 'maya', name: 'Maya Chen', num: '+1 (415) 555-0187', hue: 330 },
  { id: 'mom', name: 'Mom', num: '+1 (415) 555-0100', hue: 20 },
  { id: 'leo', name: 'Leo Novak', num: '+48 22 555 01 34', hue: 150 },
  { id: 'sam', name: 'Sam Okafor', num: '+1 (415) 555-0165', hue: 270 },
  { id: 'zoe', name: 'Zoe Larsson', num: '+46 8 555 01 21', hue: 45 },
  { id: 'dad', name: 'Dad', num: '+1 (415) 555-0101', hue: 195 },
  { id: 'kim', name: 'Coach Kim', num: '+1 (415) 555-0111', hue: 0 },
];
export const contact = id => CONTACTS.find(c => c.id === id);
export const avatarBg = c => `linear-gradient(180deg, hsl(${c.hue} 25% 68%), hsl(${c.hue} 12% 52%))`;
export const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/* ---------- music ---------- */
export const TRACKS = [
  { id: 't1', title: 'Isolated', artist: 'Kevin MacLeod', album: 'Ambient Collection', src: 'assets/music/Kevin_MacLeod_-_Isolated.m4a', hue: 232, hue2: 280 },
  { id: 't2', title: 'The North', artist: 'Kevin MacLeod', album: 'Cinematic Suite', src: 'assets/music/Kevin_MacLeod_-_The_North.m4a', hue: 190, hue2: 220 },
  { id: 't3', title: 'Hamster March', artist: 'Kevin MacLeod', album: 'Comedic Works', src: 'assets/music/Kevin_MacLeod_-_Hamster_March.m4a', hue: 20, hue2: 340 },
  { id: 't4', title: 'Anachronist', artist: 'Kevin MacLeod', album: 'Dark Strings', src: 'assets/music/Kevin_MacLeod_-_Anachronist.m4a', hue: 345, hue2: 20 },
];
export const artBg = t => `radial-gradient(120% 90% at 20% 10%, hsl(${t.hue2} 85% 65%), transparent 60%), linear-gradient(150deg, hsl(${t.hue} 80% 52%), hsl(${t.hue2} 75% 28%))`;

/* ---------- photos that ship with the phone ---------- */
export const LIBRARY = ['p1015', 'p1018', 'p1025', 'p1035', 'p1043', 'p1062', 'p1069', 'p1074', 'p1084', 'p110', 'p129', 'p152', 'p177', 'p190', 'p200', 'p237', 'p244', 'p274', 'p287', 'p292']
  .map((k, i) => ({ id: 'lib-' + k, src: `assets/img/${k}.jpg`, ts: Date.now() - Math.floor(i / 6) * 86400000 * 2.2 - (i % 6 + 1) * 5400000, lib: true }));

/* ---------- reels ---------- */
export const REELS = [
  { id: 'r1', kind: 'video', src: 'assets/video/space0.mp4', user: 'nasa.viz', name: 'NASA Scientific Visualization', caption: 'Thousands of worlds beyond our sun, mapped 🪐 #exoplanets #space', audio: 'Original audio · nasa.viz', likes: 48210, comments: 1204, hue: 250 },
  { id: 'r2', kind: 'kb', src: 'assets/img/p1015.jpg', user: 'lena.wanders', name: 'Lena', caption: 'chasing the last light before the fog rolls in 🌫️', audio: 'Isolated · Kevin MacLeod', track: 't1', likes: 12904, comments: 233, hue: 200 },
  { id: 'r3', kind: 'gen', gen: 'aurora', user: 'glitchgarden', name: 'Glitch Garden', caption: 'generative aurora, 40 lines of canvas ✨', audio: 'Original audio · glitchgarden', likes: 8301, comments: 96, hue: 280 },
  { id: 'r4', kind: 'kb', src: 'assets/img/p1043.jpg', user: 'tobias.trails', name: 'Tobias', caption: 'quiet mornings > everything. #slowliving', audio: 'The North · Kevin MacLeod', track: 't2', likes: 20441, comments: 412, hue: 30 },
  { id: 'r5', kind: 'video', src: 'assets/video/space20.mp4', user: 'nasa.viz', name: 'NASA Scientific Visualization', caption: 'The universe is not just big — it is *organised* 🌌', audio: 'Original audio · nasa.viz', likes: 91820, comments: 3310, hue: 220 },
  { id: 'r6', kind: 'gen', gen: 'rain', user: 'lofi.window', name: 'lofi window', caption: 'rain on glass. press play, get to work 🎧', audio: 'Anachronist · Kevin MacLeod', track: 't4', likes: 33107, comments: 741, hue: 215 },
  { id: 'r7', kind: 'kb', src: 'assets/img/p1074.jpg', user: 'mira.eats', name: 'Mira', caption: 'this ramen was worth the 40 min queue 🍜🔥', audio: 'Hamster March · Kevin MacLeod', track: 't3', likes: 5120, comments: 88, hue: 12 },
  { id: 'r8', kind: 'gen', gen: 'waves', user: 'sinewave.club', name: 'sinewave club', caption: 'three sines walk into a bar 📈', audio: 'Original audio · sinewave.club', likes: 2210, comments: 31, hue: 300 },
  { id: 'r9', kind: 'kb', src: 'assets/img/p110.jpg', user: 'jonas.bikes', name: 'Jonas', caption: 'sunday ride. no phone. (filmed on phone) 🚲', audio: 'Isolated · Kevin MacLeod', track: 't1', likes: 15873, comments: 190, hue: 100 },
  { id: 'r10', kind: 'kb', src: 'assets/img/p152.jpg', user: 'studio.nim', name: 'Nim', caption: 'new desk setup tour ☕️🖥️ link in bio', audio: 'The North · Kevin MacLeod', track: 't2', likes: 9044, comments: 156, hue: 260 },
  { id: 'r11', kind: 'gen', gen: 'stars', user: 'orbit.kid', name: 'orbit kid', caption: 'warp speed at 60fps 🚀', audio: 'Original audio · orbit.kid', likes: 41200, comments: 902, hue: 240 },
  { id: 'r12', kind: 'kb', src: 'assets/img/p190.jpg', user: 'salt.and.sea', name: 'Salt & Sea', caption: 'sunrise swim club 🌊 who’s in?', audio: 'Anachronist · Kevin MacLeod', track: 't4', likes: 27300, comments: 505, hue: 190 },
];
export const COMMENT_POOL = [
  ['maya.c', 'okay this is unreal 😍'], ['leo.n', 'sending this to everyone i know'], ['dev.anna', 'how is this even possible??'], ['sam_o', 'the ending 😭😭'], ['zoe.l', 'saved for later 🔖'], ['marcus', 'more of this please'],
  ['riley', 'goosebumps fr'], ['tinaaa', 'not me watching this 6 times'], ['k.park', 'the audio!!! what is it'], ['omar_j', 'W content'], ['priya', 'this is so calming'], ['jules', '10/10 would watch again'],
  ['nico', '🔥🔥🔥'], ['ella.m', 'i can’t stop watching'], ['hank', 'underrated account'], ['ivy', 'you just made my day ☀️'],
];

/* ---------- calendar ---------- */
export function todaysEvents() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const at = (h, m = 0, len = 60) => ({ start: new Date(+d + (h * 60 + m) * 60000), end: new Date(+d + (h * 60 + m + len) * 60000) });
  return [
    { title: 'Design review', place: 'Studio B', color: '#ff9f0a', ...at(9, 30, 60) },
    { title: 'Lunch with Maya', place: 'Blue Bottle', color: '#30d158', ...at(12, 30, 60) },
    { title: 'Piano practice', place: 'Home', color: '#bf5af2', ...at(16, 0, 45) },
    { title: 'Dinner at Leo’s', place: 'Leo’s place', color: '#ff375f', ...at(19, 30, 120) },
  ];
}

/* ---------- weather (synthetic by default, refined by open-meteo when online) ---------- */
export const WEATHER = {
  city: 'Warsaw', temp: 18, cond: 'Partly Cloudy', code: 2, hi: 21, lo: 12, feels: 17, humidity: 58, wind: 14, uv: 4, vis: 16, pressure: 1016,
  hourly: [], daily: [], live: false,
};
function condName(code) {
  if (code === 0) return ['Clear', 'sun'];
  if (code <= 2) return ['Partly Cloudy', 'partly'];
  if (code === 3) return ['Cloudy', 'cloud'];
  if (code >= 45 && code < 50) return ['Fog', 'fog'];
  if (code >= 51 && code < 68) return ['Rain', 'rain'];
  if (code >= 71 && code < 78) return ['Snow', 'snow'];
  if (code >= 80 && code < 83) return ['Showers', 'rain'];
  if (code >= 95) return ['Thunderstorm', 'storm'];
  return ['Cloudy', 'cloud'];
}
export const wxKind = code => condName(code)[1];
function synth() {
  const now = new Date(), h0 = now.getHours();
  const base = 14 + Math.sin((now.getMonth() - 3) / 12 * Math.PI * 2) * 8; // seasonal
  const temp = h => Math.round(base + Math.sin((h - 9) / 24 * Math.PI * 2) * 5);
  WEATHER.hourly = Array.from({ length: 24 }, (_, i) => { const hr = (h0 + i) % 24; return { h: hr, t: temp(hr), code: hr > 20 || hr < 6 ? 0 : (i % 7 === 3 ? 3 : 2) }; });
  WEATHER.temp = WEATHER.hourly[0].t; WEATHER.hi = Math.max(...WEATHER.hourly.map(x => x.t)); WEATHER.lo = Math.min(...WEATHER.hourly.map(x => x.t));
  WEATHER.daily = Array.from({ length: 10 }, (_, i) => ({ d: (now.getDay() + i) % 7, hi: WEATHER.hi + Math.round(Math.sin(i * 1.3) * 3), lo: WEATHER.lo + Math.round(Math.cos(i * 1.1) * 2), code: [2, 1, 3, 61, 2, 0, 1, 3, 80, 2][i] }));
  [WEATHER.cond] = condName(WEATHER.code);
}
synth();
export async function refreshWeather() {
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=52.23&longitude=21.01&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=10', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const c = j.current;
    WEATHER.temp = Math.round(c.temperature_2m); WEATHER.feels = Math.round(c.apparent_temperature); WEATHER.humidity = c.relative_humidity_2m;
    WEATHER.code = c.weather_code; WEATHER.wind = Math.round(c.wind_speed_10m); WEATHER.pressure = Math.round(c.surface_pressure);
    [WEATHER.cond] = condName(c.weather_code);
    const now = new Date(); const i0 = j.hourly.time.findIndex(t => new Date(t) >= now);
    WEATHER.hourly = j.hourly.time.slice(Math.max(0, i0), Math.max(0, i0) + 24).map((t, i) => ({ h: new Date(t).getHours(), t: Math.round(j.hourly.temperature_2m[Math.max(0, i0) + i]), code: j.hourly.weather_code[Math.max(0, i0) + i] }));
    WEATHER.daily = j.daily.time.map((t, i) => ({ d: new Date(t).getDay(), hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i] }));
    WEATHER.hi = WEATHER.daily[0].hi; WEATHER.lo = WEATHER.daily[0].lo; WEATHER.live = true;
    return true;
  } catch { return false; }
}

/* ---------- sms bot ---------- */
export const BOT = {
  greet: ['hey!', 'hi 👋', 'yo', 'hey you'],
  how: ['pretty good, you?', 'can’t complain 😄', 'busy day but good!', 'tired but okay lol'],
  thanks: ['anytime!', 'no worries 🙌', 'of course!'],
  food: ['okay now i’m hungry 🍕', 'yes!! where though?', 'i could eat. 12:30?'],
  photo: ['ooh send it!', 'that looks amazing 😍', 'wait that’s gorgeous'],
  yes: ['perfect, see you then', 'sounds like a plan 👌', 'deal!'],
  no: ['aw okay, next time', 'all good!', 'no stress 🙂'],
  lol: ['😂😂', 'lmaooo', 'stoppp'],
  love: ['❤️', 'aw 🥹', 'you’re the best'],
  time: () => `it’s ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} on my end`,
  fallback: ['haha true', 'wait really?', 'tell me more', 'omg', 'lol okay', 'hmm interesting 🤔', 'ok wait, call me later?', 'for real?', 'love that'],
};
export function botReply(text) {
  const t = text.toLowerCase();
  if (/^(hi|hey|hello|yo|sup)\b/.test(t)) return pick(BOT.greet);
  if (/how are|how's it|how r u|what's up|whats up/.test(t)) return pick(BOT.how);
  if (/thank|thx/.test(t)) return pick(BOT.thanks);
  if (/pizza|lunch|dinner|eat|food|hungry|coffee/.test(t)) return pick(BOT.food);
  if (/photo|pic|picture|selfie/.test(t)) return pick(BOT.photo);
  if (/haha|lol|lmao|😂/.test(t)) return pick(BOT.lol);
  if (/love|miss you|❤/.test(t)) return pick(BOT.love);
  if (/time/.test(t)) return BOT.time();
  if (/\b(yes|yeah|yep|sure|ok|okay)\b/.test(t)) return pick(BOT.yes);
  if (/\b(no|nope|can't|cant|sorry)\b/.test(t)) return pick(BOT.no);
  return pick(BOT.fallback);
}
export const stored = { get: (k, d) => store.get(k, d), set: (k, v) => store.set(k, v) };
export { pick, rand };
