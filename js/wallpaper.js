// Wallpapers, generated per display size (inner 896x632, outer 435x632, panels 448x632 and rotations).
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

const BLOB_PALETTES = {
  aurora:   { bg: ['#07061a', '#0d0a3a'], blobs: ['#4b3bff', '#a13cff', '#1fb5ff', '#ff3fa4', '#2b6cff'], seed: 7, dark: true },
  sunset:   { bg: ['#2a0a3f', '#7a1f5c'], blobs: ['#ff8a3d', '#ff4d6d', '#ffc857', '#c23fd8', '#ff6a4d'], seed: 21, dark: true },
  ocean:    { bg: ['#021a2e', '#043b57'], blobs: ['#00c2ff', '#1f6bff', '#00e0b0', '#5b4bff', '#00a0d8'], seed: 33, dark: true },
  bloom:    { bg: ['#f6e7dd', '#f1c9d0'], blobs: ['#ff9a8a', '#ffc27a', '#ff7aa8', '#ffd9a0', '#c99bff'], seed: 5, dark: false },
  forest:   { bg: ['#04140e', '#0a2b1f'], blobs: ['#16a34a', '#0d9488', '#65a30d', '#22d3ee', '#166534'], seed: 12, dark: true },
  graphite: { bg: ['#0b0b0d', '#1c1c20'], blobs: ['#3a3a44', '#5a5a68', '#2a2a30', '#6c6c7c', '#44444e'], seed: 3, dark: true },
};
export const WALLPAPERS = [
  { id: 'dunes', name: 'Dunes', kind: 'gen', light: true },
  ...Object.keys(BLOB_PALETTES).map(k => ({ id: k, name: k[0].toUpperCase() + k.slice(1), kind: 'gen', light: !BLOB_PALETTES[k].dark })),
  ...['p1015', 'p1035', 'p1043', 'p1062', 'p1074', 'p110', 'p152', 'p190'].map((k, i) => ({ id: k, name: 'Photo ' + (i + 1), kind: 'photo', light: false })),
];
export const isLightWallpaper = id => !!(WALLPAPERS.find(w => w.id === id) || {}).light;

const cache = {};

function grain(g, w, h, r, amt = 5) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

function dunes(g, w, h) {
  const r = rng(11);
  const sky = g.createLinearGradient(0, 0, 0, h * .62);
  sky.addColorStop(0, '#8fa9cf'); sky.addColorStop(.45, '#c3cbd6'); sky.addColorStop(.8, '#e6dccb'); sky.addColorStop(1, '#efe4d0');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // soft sun bloom
  const sun = g.createRadialGradient(w * .72, h * .5, 0, w * .72, h * .5, w * .6);
  sun.addColorStop(0, 'rgba(255,240,215,.55)'); sun.addColorStop(1, 'rgba(255,240,215,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const ridge = (base, amp, freqs, fill, alpha = 1, rough = 0) => {
    g.beginPath(); g.moveTo(0, h);
    const ph = freqs.map(() => r() * 6.28);
    for (let x = 0; x <= w; x += 3) {
      let y = base;
      freqs.forEach((f, i) => { y += Math.sin(x * f + ph[i]) * amp / (i + 1); });
      if (rough) y += (r() - .5) * rough;
      g.lineTo(x, y);
    }
    g.lineTo(w, h); g.closePath(); g.globalAlpha = alpha; g.fillStyle = fill; g.fill(); g.globalAlpha = 1;
  };
  const mount = (base, amp, col, alpha) => {
    const gr = g.createLinearGradient(0, base - amp * 2, 0, base + 40);
    gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]);
    ridge(base, amp, [.006, .017, .043, .11], gr, alpha, 2.5);
  };
  mount(h * .5, 34, ['#7d8ca2', '#b9bcc0'], 1);
  mount(h * .545, 26, ['#8f97a0', '#cbc6bb'], 1);
  mount(h * .585, 16, ['#a8a59f', '#dcd2c0'], 1);
  // dunes: back → front, each with a lit crest and a shadowed flank
  const layers = [
    { base: .64, amp: 22, f: [.004, .011], a: '#e7d9c0', b: '#d3c09e' },
    { base: .72, amp: 34, f: [.0032, .009], a: '#eadcc4', b: '#cdb994' },
    { base: .82, amp: 46, f: [.0025, .007], a: '#efe2cb', b: '#c6b08a' },
    { base: .93, amp: 58, f: [.002, .0055], a: '#f3e8d3', b: '#c0a882' },
  ];
  layers.forEach(L => {
    const gr = g.createLinearGradient(0, h * L.base - L.amp * 1.5, 0, h);
    gr.addColorStop(0, L.a); gr.addColorStop(.5, L.b); gr.addColorStop(1, L.a);
    ridge(h * L.base, L.amp, L.f, gr);
    // wind ripples
    g.globalAlpha = .07; g.strokeStyle = '#7a5f3a'; g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const y0 = h * L.base + 10 + r() * (h * (1 - L.base) - 20), x0 = r() * w;
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + 40, y0 - 6, x0 + 90, y0 + 5, x0 + 150 + r() * 60, y0 - 2); g.stroke();
    }
    g.globalAlpha = 1;
  });
  // atmospheric haze at the horizon
  const haze = g.createLinearGradient(0, h * .46, 0, h * .7);
  haze.addColorStop(0, 'rgba(240,232,215,0)'); haze.addColorStop(.5, 'rgba(240,232,215,.22)'); haze.addColorStop(1, 'rgba(240,232,215,0)');
  g.fillStyle = haze; g.fillRect(0, h * .46, w, h * .24);
}

function blobs(g, w, h, p) {
  const r = rng(p.seed);
  const bg = g.createLinearGradient(0, 0, w * .4, h);
  bg.addColorStop(0, p.bg[0]); bg.addColorStop(1, p.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  const n = Math.max(6, Math.round(w / 110));
  for (let i = 0; i < n; i++) {
    const col = p.blobs[i % p.blobs.length];
    const x = r() * w, y = r() * h, rad = 160 + r() * 300;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col + 'cc'); gr.addColorStop(.5, col + '44'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalCompositeOperation = 'source-over';
}

/** CSS `background` values for a display of the given size. */
export function wallpaperCSS(id, w, h) {
  const meta = WALLPAPERS.find(x => x.id === id) || WALLPAPERS[0];
  if (meta.kind === 'photo') return { image: `url(assets/img/${meta.id}.jpg)`, size: 'cover', pos: 'center' };
  const key = `${id}|${w}x${h}`;
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (id === 'dunes') dunes(g, w, h); else blobs(g, w, h, BLOB_PALETTES[id] || BLOB_PALETTES.aurora);
  grain(g, w, h, rng(99), 5);
  return (cache[key] = { image: `url(${c.toDataURL('image/jpeg', .9)})`, size: '100% 100%', pos: '0 0' });
}

export function applyWallpaper(el, id, w, h) {
  const p = wallpaperCSS(id, w, h);
  el.style.backgroundImage = p.image; el.style.backgroundSize = p.size; el.style.backgroundPosition = p.pos; el.style.backgroundRepeat = 'no-repeat';
}
