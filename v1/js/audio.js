// System sounds: synthesised with WebAudio (so they are instant and tiny) plus a fetched real shutter.
import { store } from './util.js';

class Sfx {
  constructor() {
    this.ctx = null; this.master = null;
    this.volume = store.get('volume', 0.7);   // 0..1 (ringer/system)
    this.silent = store.get('silent', false); // ring/silent switch
    this.buffers = {};
    this.ring = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.load('shutter', 'assets/sfx/shutter-holga.m4a');
    this.load('shutter2', 'assets/sfx/shutter-canon.m4a');
  }
  async load(name, url) {
    try {
      const r = await fetch(url); const b = await r.arrayBuffer();
      this.buffers[name] = await new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej));
    } catch { /* falls back to synth */ }
  }
  setVolume(v) { this.volume = v; store.set('volume', v); if (this.master) this.master.gain.value = v; }
  setSilent(s) { this.silent = s; store.set('silent', s); }

  get ok() { return this.ctx && !this.silent; }

  // ---- primitives ----
  tone({ f = 440, f2 = null, dur = .2, type = 'sine', gain = .2, at = 0, attack = .004, curve = 'exp' }) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + .02);
  }
  noise({ dur = .05, gain = .2, at = 0, filter = 'highpass', freq = 2000, freq2 = null, q = 1 }) {
    const c = this.ctx, t = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  bell(f, at = 0, gain = .16, dur = .9) { // sine + inharmonic partial = glassy ding
    this.tone({ f, dur, gain, at, attack: .002 });
    this.tone({ f: f * 2.76, dur: dur * .4, gain: gain * .25, at, attack: .002 });
    this.tone({ f: f * 5.4, dur: dur * .2, gain: gain * .08, at, attack: .002 });
  }

  // ---- named sounds ----
  play(name, arg) {
    this.init();
    if (!this.ok && name !== 'media') return;
    const c = this.ctx; if (!c) return;
    switch (name) {
      case 'key': this.noise({ dur: .022, gain: .35, freq: 2600, filter: 'bandpass', q: 1.2 }); this.tone({ f: 1500, f2: 900, dur: .03, gain: .05, type: 'triangle' }); break;
      case 'keyDel': this.noise({ dur: .025, gain: .35, freq: 1500, filter: 'bandpass', q: 1 }); this.tone({ f: 900, f2: 500, dur: .035, gain: .06, type: 'triangle' }); break;
      case 'keyMod': this.noise({ dur: .03, gain: .3, freq: 1100, filter: 'bandpass', q: 1 }); this.tone({ f: 700, f2: 420, dur: .04, gain: .06, type: 'triangle' }); break;
      case 'tick': this.noise({ dur: .012, gain: .25, freq: 3500, filter: 'bandpass', q: 2 }); break;
      case 'lock': this.tone({ f: 260, f2: 70, dur: .11, gain: .35, type: 'sine' }); this.noise({ dur: .03, gain: .3, freq: 1800, filter: 'bandpass' }); break;
      case 'unlock': this.tone({ f: 320, f2: 120, dur: .07, gain: .18 }); this.noise({ dur: .02, gain: .25, freq: 2800, filter: 'bandpass', at: .001 }); this.tone({ f: 520, f2: 260, dur: .06, gain: .12, at: .07 }); break;
      case 'thunk': this.tone({ f: 150, f2: 45, dur: .16, gain: .5 }); this.noise({ dur: .05, gain: .35, freq: 900, filter: 'lowpass' }); break;
      case 'click': this.noise({ dur: .02, gain: .4, freq: 2200, filter: 'bandpass', q: 3 }); this.tone({ f: 1100, f2: 700, dur: .03, gain: .08, type: 'square' }); break;
      case 'power': this.tone({ f: 200, f2: 90, dur: .08, gain: .3 }); this.noise({ dur: .02, gain: .3, freq: 2000, filter: 'bandpass' }); break;
      case 'sent': this.noise({ dur: .22, gain: .16, freq: 500, freq2: 4200, filter: 'bandpass', q: .8 }); this.tone({ f: 1250, f2: 1900, dur: .12, gain: .07, at: .1, type: 'triangle' }); break;
      case 'recv': [1046.5, 1318.5].forEach((f, i) => this.bell(f, i * .11, .13, .55)); break;
      case 'notif': [1318.5, 1568, 2093].forEach((f, i) => this.bell(f, i * .12, .13, .7)); break;
      case 'tapback': this.tone({ f: 600, f2: 1200, dur: .09, gain: .14, type: 'triangle' }); this.tone({ f: 1800, dur: .12, gain: .05, at: .06 }); break;
      case 'like': this.tone({ f: 480, f2: 900, dur: .1, gain: .16, type: 'triangle' }); this.tone({ f: 1350, dur: .09, gain: .07, at: .07 }); break;
      case 'pop': this.tone({ f: 700, f2: 250, dur: .08, gain: .22 }); break;
      case 'vol': this.noise({ dur: .015, gain: .3, freq: 3000, filter: 'bandpass', q: 3 }); this.tone({ f: 1300, dur: .05, gain: .08 }); break;
      case 'rec': this.tone({ f: 880, dur: .1, gain: .16 }); this.tone({ f: 1318, dur: .16, gain: .13, at: .1 }); break;
      case 'recStop': this.tone({ f: 1318, dur: .1, gain: .16 }); this.tone({ f: 880, dur: .16, gain: .13, at: .1 }); break;
      case 'timer': for (let i = 0; i < 8; i++) { this.tone({ f: 1567, dur: .1, gain: .13, at: i * .16, type: 'triangle' }); this.tone({ f: 2093, dur: .08, gain: .06, at: i * .16 + .05, type: 'triangle' }); } break;
      case 'error': this.tone({ f: 220, f2: 180, dur: .18, gain: .16, type: 'sawtooth' }); break;
      case 'swoosh': this.noise({ dur: .3, gain: .08, freq: 400, freq2: 2600, filter: 'bandpass', q: .6 }); break;
      case 'faceid': this.tone({ f: 660, dur: .06, gain: .06, type: 'triangle' }); this.tone({ f: 880, dur: .08, gain: .06, at: .09, type: 'triangle' }); break;
      case 'shutter': {
        const buf = this.buffers.shutter;
        if (buf) { const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = 1.4; s.connect(g); g.connect(this.master); s.start(); }
        else { this.noise({ dur: .03, gain: .5, freq: 2500, filter: 'bandpass' }); this.noise({ dur: .05, gain: .4, freq: 1400, filter: 'bandpass', at: .06 }); }
        break;
      }
      case 'dtmf': {
        const T = { 1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336], 6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], '*': [941, 1209], 0: [941, 1336], '#': [941, 1477] }[arg];
        if (T) T.forEach(f => this.tone({ f, dur: .16, gain: .07, attack: .01 }));
        break;
      }
    }
  }

  ringtone(on) {
    this.init(); if (!this.ctx) return;
    clearInterval(this.ring); this.ring = null;
    if (!on || this.silent) return;
    const phrase = () => { // "Reflection"-ish marimba arpeggio
      [659.3, 784, 987.8, 1174.7, 987.8, 784, 987.8, 1318.5].forEach((f, i) => this.bell(f, i * .13, .12, .5));
    };
    phrase(); this.ring = setInterval(phrase, 2400);
  }
  ringback(on) {
    this.init(); if (!this.ctx) return;
    clearInterval(this._rb); this._rb = null;
    if (!on) return;
    const b = () => { this.tone({ f: 440, dur: 1.1, gain: .06, attack: .02, curve: 'lin' }); this.tone({ f: 480, dur: 1.1, gain: .06, attack: .02 }); };
    b(); this._rb = setInterval(b, 3400);
  }
}
export const sfx = new Sfx();
