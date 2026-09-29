// Music engine shared by the Music app, widgets, Control Center and the Dynamic Island.
import { TRACKS } from './data.js';
import { store } from './util.js';

export class Player {
  constructor(os) {
    this.os = os; this.tracks = TRACKS; this.idx = 0; this.playing = false; this.shuffle = false; this.repeat = false;
    this.audio = new Audio(); this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.next(true));
    this.audio.addEventListener('timeupdate', () => os.emit('musictime'));
    this.audio.addEventListener('play', () => { this.playing = true; this.changed(); });
    this.audio.addEventListener('pause', () => { this.playing = false; this.changed(); });
    this.track = null;
    this.liked = new Set(store.get('liked', []));
  }
  get duration() { return this.audio.duration || 0; }
  get time() { return this.audio.currentTime || 0; }
  changed() { this.os.emit('music'); this.os.syncMusicActivity(); }
  load(i) {
    this.idx = (i + this.tracks.length) % this.tracks.length;
    this.track = this.tracks[this.idx];
    this.audio.src = this.track.src;
    this.changed();
  }
  play(i) { if (i != null || !this.track) this.load(i ?? 0); this.audio.play().catch(() => { }); }
  pause() { this.audio.pause(); }
  toggle() { if (!this.track) return this.play(0); this.playing ? this.pause() : this.audio.play().catch(() => { }); }
  next(auto = false) {
    if (auto && this.repeat) { this.audio.currentTime = 0; this.audio.play(); return; }
    const n = this.shuffle ? Math.floor(Math.random() * this.tracks.length) : this.idx + 1;
    this.play(n);
  }
  prev() { if (this.time > 3) { this.audio.currentTime = 0; return; } this.play(this.idx - 1); }
  seek(t) { if (isFinite(t)) this.audio.currentTime = t; }
  toggleLike(id) { this.liked.has(id) ? this.liked.delete(id) : this.liked.add(id); store.set('liked', [...this.liked]); this.os.emit('music'); }
}
