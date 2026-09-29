// The hardware. iPhone Duo (Apple, Sept 2026): a passport-sized book that opens into one continuous
// 7.6" inner display. Two titanium halves joined by a hinge; the outer display lives on the back of the
// left half, the dual rear camera on the back of the right half.
//
//   fold   0   = open flat (landscape, hinge vertical)   180 = closed (left half lies over the right half,
//   its back — the outer display — faces you, spine on the left).
//
// The DOM has four "surfaces" the OS draws into:
//   flat   896x632 canvas lying in the device plane (only while the display is flat)
//   panelL/panelR  448x632 slots on the two inner faces (used while the display is bent)
//   outer  435x632 slot on the back of the left half
import { h, clamp, Emitter } from './util.js';

export const HW = { BW: 463, BH: 662, T: 29, HALF: 455, SH: 648, OUT_W: 447, ROUT: 50, RSCR: 42, GAP: 0 };
const { BW, BH, T, HALF, SH, OUT_W, ROUT, RSCR, GAP } = HW;
const LAYERS = 29;

const COLORS = {
  night: { name: 'Night Sky', hue: 222, sat: 16, lo: 16, hi: 50, back: 'linear-gradient(155deg,#1c2130 0%,#0e111a 55%,#1a1f2d 100%)', logo: '#5b6378', wm: 'rgba(170,180,205,.45)', ring: '#0a0c12' },
  white: { name: 'Star White', hue: 40, sat: 8, lo: 72, hi: 93, back: 'linear-gradient(155deg,#f5f3ee 0%,#e4e1da 55%,#f1efe9 100%)', logo: '#a9a59b', wm: 'rgba(90,86,78,.5)', ring: '#cfcbc2' },
};

export const POSES = {
  open:   { f: 0,   o: 0,   pitch: 0,  yaw: 0, s: 1,   dy: 0 },
  closed: { f: 180, o: 0,   pitch: 0,  yaw: 0, s: 1,   dy: 0 },
  laptop: { f: 78,  o: 90,  pitch: 58, yaw: 0, s: .8,  dy: 70 },
  tent:   { f: 125, o: -90, pitch: 66, yaw: 0, s: .85, dy: 70 },
};

export class Device extends Emitter {
  constructor(mount) {
    super();
    this.fold = 0; this.target = 0; this.vel = 0;
    this.orient = 0; this.orientT = 0; this.pitch = 0; this.pitchT = 0; this.yaw = 0; this.yawT = 0; this.zs = 1; this.zsT = 1; this.dy = 0; this.dyT = 0;
    this.dragging = false; this.scale = 1; this.color = 'night';
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.lastFold = -1; this.tiltOn = false; // mouse parallax off by default: it forces constant re-rasterisation of the whole 3D scene
    this.build(mount);
    this.bind();
    this.setColor('night');
    this.applyAll();
    requestAnimationFrame(t => this.tick(t));
  }

  /* ---------------------------------------------------------------- build */
  build(mount) {
    const half = side => {
      const isL = side === 'L';
      // outer corners round, hinge-side corners nearly square
      const rad = isL ? `${ROUT}px 0 0 ${ROUT}px` : `0 ${ROUT}px ${ROUT}px 0`;
      const radScr = isL ? `${RSCR}px 0 0 ${RSCR}px` : `0 ${RSCR}px ${RSCR}px 0`;
      const layers = Array.from({ length: LAYERS }, (_, i) => {
        const z = -T / 2 + 0.5 + (T - 1) * (i / (LAYERS - 1));
        return h('i.layer', { style: { borderRadius: rad, transform: `translateZ(${z.toFixed(2)}px)` } });
      });
      const slot = h('div.slot', { style: { left: (isL ? BW - HALF : 0) + 'px', top: (BH - SH) / 2 + 'px', width: HALF + 'px', height: SH + 'px', borderRadius: radScr } });
      const glass = h('div.glass');
      const front = h('div.face.front', { style: { borderRadius: rad, transform: `translateZ(${T / 2}px)` } }, slot, glass);
      const radBack = isL ? `0 ${ROUT}px ${ROUT}px 0` : `${ROUT}px 0 0 ${ROUT}px`; // back faces read mirrored
      const back = h('div.face.back', { style: { borderRadius: radBack, transform: `rotateY(180deg) translateZ(${T / 2}px)` } });
      const el = h('div.half.' + (isL ? 'left' : 'right'), { style: { borderRadius: rad } }, ...layers, back, front);
      return { el, layers, slot, front, back, rad };
    };
    this.L = half('L'); this.R = half('R');

    /* Left back = outer display. Bezel 14px sides / 15px top, hinge edge flat. Viewed from behind, the spine is on the LEFT. */
    this.outerSlot = h('div.slot.outer', { style: { left: (BW - OUT_W) / 2 + 'px', top: (BH - SH) / 2 + 'px', width: OUT_W + 'px', height: SH + 'px', borderRadius: `0 ${RSCR}px ${RSCR}px 0` } });
    this.L.back.append(this.outerSlot, h('div.glass'));

    /* Right back = ceramic glass with the dual Fusion camera plateau. */
    this.R.back.append(
      h('div.plateau', {}, h('i.lens.a'), h('i.lens.b'), h('i.flash'), h('i.mic')),
      h('div.logo', { html: `<svg viewBox="0 0 24 24"><path d="M16.400 12.600c0-2.500 2-3.700 2.100-3.800-1.100-1.700-2.900-1.900-3.500-1.900-1.500-.15-2.900.9-3.700.9-.8 0-1.900-.9-3.200-.85-1.600 0-3.100.95-4 2.400-1.700 3-.45 7.400 1.200 9.800.8 1.200 1.800 2.500 3 2.450 1.200-.05 1.700-.8 3.100-.8 1.500 0 1.900.8 3.200.75 1.300 0 2.200-1.200 3-2.400.9-1.400 1.300-2.700 1.300-2.800-.05 0-2.500-1-2.500-3.750ZM14 5.300c.65-.8 1.100-1.900.95-3-.95.05-2.100.65-2.800 1.450-.6.700-1.150 1.850-1 2.900 1.050.1 2.150-.5 2.850-1.350Z"/></svg>` }),
      h('div.wordmark', 'iPhone Duo')
    );

    /* Physical buttons (slivers on the frame). Landscape/open view: volume on the top edge of the right half,
       side button (Touch ID) + Camera Control on its right edge, Action button on the left half's left edge. */
    this.btn = {
      power: h('i.hw.side', { title: 'Side button · Touch ID' }),
      cam: h('i.hw.camctl', { title: 'Camera Control' }),
      vup: h('i.hw.vup', { title: 'Volume up' }),
      vdn: h('i.hw.vdn', { title: 'Volume down' }),
      action: h('i.hw.action', { title: 'Action button' }),
    };
    this.R.el.append(this.btn.power, this.btn.cam, this.btn.vup, this.btn.vdn);
    this.L.el.append(this.btn.action);

    // grip on the outer edge of the left half: drag it to fold / unfold
    this.grip = h('div.grip', { title: 'Drag to fold' });
    this.L.el.append(this.grip);

    // the seamless inner canvas (lives in the device plane; only visible while flat)
    this.flat = h('div.flatcanvas', { style: { left: -HALF + 'px', top: -SH / 2 + 'px', width: HALF * 2 + 'px', height: SH + 'px', borderRadius: RSCR + 'px', transform: `translateZ(${T / 2 + 0.8}px)` } });
    this.crease = h('div.crease');
    this.flat.append(h('div.flat-inner'), this.crease);

    // hinge knuckles (top and bottom) + closed-state spine
    this.hingeTop = h('i.knuckle.top'); this.hingeBot = h('i.knuckle.bot');
    this.spine = h('div.spine');
    this.shadow = h('div.shadow', {}, h('i'));

    this.device = h('div#device', {}, this.shadow, this.spine, this.hingeTop, this.hingeBot, this.R.el, this.L.el, this.flat);
    this.world = h('div#world', {}, this.device);
    this.tiltEl = h('div#tilt', {}, this.world);
    mount.append(this.tiltEl);

    this.mounts = { flat: this.flat.firstChild, panelL: this.L.slot, panelR: this.R.slot, outer: this.outerSlot };
  }

  /** rim highlight only on the outer edges (no line down the hinge side) */
  rim(hi, lo, sides) {
    const off = { t: [0, 1], b: [0, -1], l: [1, 0], r: [-1, 0] };
    const one = (w, col) => sides.map(sd => `inset ${off[sd][0] * w}px ${off[sd][1] * w}px 0 0 ${col}`);
    return [...one(1.5, hi), ...one(2.5, lo)].join(', ');
  }

  setColor(c) {
    this.color = c; const k = COLORS[c];
    document.getElementById('stage').dataset.color = c;
    [this.L, this.R].forEach(hf => hf.layers.forEach((l, i) => {
      const m = 1 - Math.abs(i / (LAYERS - 1) - 0.5) * 2; // 0 at the faces, 1 at mid-edge
      const L = k.lo + (k.hi - k.lo) * Math.pow(m, 1.6);
      l.style.background = `linear-gradient(180deg, hsl(${k.hue} ${k.sat}% ${Math.min(96, L + 6)}%), hsl(${k.hue} ${k.sat}% ${L - 5}%) 50%, hsl(${k.hue} ${k.sat}% ${L + 2}%))`;
    }));
    this.R.back.style.background = k.back;
    this.R.back.style.setProperty('--logo', k.logo); this.R.back.style.setProperty('--wm', k.wm);
    this.L.back.style.background = '#000';
    const hi = `hsl(${k.hue} ${k.sat}% ${k.hi}%)`, lo = `hsl(${k.hue} ${k.sat}% ${k.lo + 6}%)`;
    this.L.back.style.boxShadow = this.rim(hi, lo, ['t', 'r', 'b']);       // viewed from behind: spine on the left
    this.L.front.style.boxShadow = this.rim(hi, lo, ['t', 'l', 'b']);
    this.R.front.style.boxShadow = this.rim(hi, lo, ['t', 'r', 'b']);
    this.R.back.style.boxShadow = this.rim(hi, lo, ['t', 'l', 'b', 'r']);
    document.querySelectorAll('.hw').forEach(b => b.style.setProperty('--ti', `hsl(${k.hue} ${k.sat}% ${k.hi - 8}%)`));
    this.spine.style.setProperty('--sp1', `hsl(${k.hue} ${k.sat}% ${k.lo + 4}%)`); this.spine.style.setProperty('--sp2', `hsl(${k.hue} ${k.sat}% ${k.hi}%)`);
    [this.hingeTop, this.hingeBot].forEach(kn => { kn.style.setProperty('--sp1', `hsl(${k.hue} ${k.sat}% ${k.lo + 4}%)`); kn.style.setProperty('--sp2', `hsl(${k.hue} ${k.sat}% ${k.hi}%)`); });
    this.emit('color', c);
  }

  /* ---------------------------------------------------------------- input */
  bind() {
    const stage = document.getElementById('stage');
    stage.addEventListener('pointermove', e => {
      if (!this.tiltOn || this.dragging || e.buttons) { this.tilt.tx = this.tilt.ty = 0; return; }
      const nx = (e.clientX / innerWidth - .5) * 2, ny = (e.clientY / innerHeight - .5) * 2;
      this.tilt.ty = nx * 3.4; this.tilt.tx = -ny * 2.4;
    });
    stage.addEventListener('pointerleave', () => { this.tilt.tx = this.tilt.ty = 0; });
    stage.addEventListener('pointerdown', () => { this.tilt.tx = this.tilt.ty = 0; });

    // drag the outer edge of the left half to fold it (only while upright)
    const g = this.grip;
    g.addEventListener('pointerdown', e => {
      if (this.orientT !== 0 || this.yawT !== 0 || this.pitchT !== 0) return;
      e.preventDefault(); e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      this.dragging = true; this.vel = 0; this.poseName = null;
      const r = BW + GAP / 2, f0 = this.fold, startX = e.clientX;
      const x0 = -r * Math.cos(f0 * Math.PI / 180);
      const move = ev => {
        const dx = (ev.clientX - startX) / this.scale;
        const x = clamp(x0 + dx * 1.15, -r, r);
        const f = Math.acos(clamp(-x / r, -1, 1)) * 180 / Math.PI;
        this.fold = this.target = f; this.applyAll();
      };
      const up = () => {
        try { g.releasePointerCapture(e.pointerId); } catch { /* */ }
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        this.dragging = false;
        const f = this.fold;
        if (f < 10) this.target = 0; else if (f > 165) this.target = 180; else this.target = f;
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
  }

  torch(on) { this.R.back.classList.toggle('torch', on); }

  /* --------------------------------------------------------------- poses */
  pose(name) { const p = POSES[name]; this.go(p); this.emit('pose', name); this.poseName = name; }
  go({ f, o, pitch, yaw, s, dy }) {
    if (s != null) this.zsT = s; if (dy != null) this.dyT = dy;
    if (f != null) this.target = f;
    if (o != null) this.orientT = o;
    if (pitch != null) this.pitchT = pitch;
    if (yaw != null) this.yawT = yaw;
  }
  setFold(f) { this.target = f; this.poseName = null; }
  get posture() {
    const f = this.fold;
    if (f > 165) return 'closed';
    if (f < 3) return 'flat';
    return 'bent';
  }

  /* --------------------------------------------------------------- render */
  applyAll() {
    const f = this.fold;
    // the left half swings over the front; pivot sits on the front plane so the stacked halves never intersect
    this.L.el.style.transformOrigin = `${BW + GAP / 2}px 50% ${T / 2 + 1.5}px`;
    this.L.el.style.transform = `rotateY(${f}deg)`;
    const shift = -(BW + GAP) / 2 * Math.min(1, f / 180);
    this.device.style.transform = `rotateZ(${this.orient}deg) translateX(${shift}px)`;
    this.world.style.transform = `translateY(${this.dy}px) scale(${this.zs}) rotateX(${this.pitch}deg) rotateY(${this.yaw}deg)`;
    const spineV = clamp((f - 120) / 40, 0, 1);
    this.spine.style.opacity = spineV;
    this.hingeTop.style.opacity = this.hingeBot.style.opacity = f > 8 ? 1 : 0;
    this.flat.style.visibility = f < 3.5 ? 'visible' : 'hidden';
    if (Math.abs(f - this.lastFold) > 0.05) this.emit('fold', f);
    this.lastFold = f;
  }

  applyTilt() {
    const t = this.tilt;
    t.x += (t.tx - t.x) * .07; t.y += (t.ty - t.y) * .07;
    if (Math.abs(t.x - (t.lx ?? 99)) < .004 && Math.abs(t.y - (t.ly ?? 99)) < .004) return; // nothing to repaint
    t.lx = t.x; t.ly = t.y;
    this.tiltEl.style.transform = `rotateX(${t.x.toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg)`;
  }

  tick(t) {
    const dt = Math.min(0.033, (t - (this._t || t)) / 1000 || 0.016); this._t = t;
    let moving = false;
    if (!this.dragging) {
      const a = (this.target - this.fold) * 82 - this.vel * 14.5; // slightly under-damped: a hinge-detent settle
      this.vel += a * dt; this.fold += this.vel * dt;
      this.fold = clamp(this.fold, -1, 181);
      if (Math.abs(this.target - this.fold) < 0.06 && Math.abs(this.vel) < 0.5) {
        this.fold = this.target; this.vel = 0;
        if (!this._settled) { this._settled = true; this.emit('settle', this.fold); }
      } else { this._settled = false; moving = true; }
    } else this._settled = false;
    // orientation / pitch / yaw ease
    for (const [k, kt] of [['orient', 'orientT'], ['pitch', 'pitchT'], ['yaw', 'yawT'], ['zs', 'zsT'], ['dy', 'dyT']]) {
      const d = this[kt] - this[k];
      if (Math.abs(d) > 0.02) { this[k] += d * Math.min(1, dt * 7); moving = true; } else this[k] = this[kt];
    }
    if (moving || this._m) this.applyAll();
    this._m = moving;
    this.applyTilt();
    requestAnimationFrame(t2 => this.tick(t2));
  }

  fit() {
    const w = innerWidth - 48, hgt = innerHeight - 130;
    const s = Math.min(w / (BW * 2 + 30), hgt / (BH + 30), 1.3);
    this.scale = s; window.__scale = s;
    document.getElementById('scaler').style.setProperty('--s', s.toFixed(4));
  }
}
