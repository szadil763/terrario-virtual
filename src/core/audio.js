// Áudio 100% procedural (WebAudio): nenhum arquivo externo é necessário.
// Canais independentes de música, efeitos e ambiente, com músicas diferentes
// para exploração, área segura, combate, minichefe e áreas secretas.

const TRACKS = {
  explore: {
    bpm: 82, pad: [57, 64, 69], padWave: 'triangle', padGain: 0.05,
    bass: [45, -1, 45, -1, 43, -1, 43, -1, 41, -1, 41, -1, 43, -1, 45, -1],
    lead: [69, -1, 72, 76, -1, 74, 72, -1, 69, -1, 67, 69, -1, 71, 72, -1],
    leadWave: 'sine', perc: 'soft', leadGain: 0.075,
  },
  safe: {
    bpm: 66, pad: [60, 64, 67], padWave: 'sine', padGain: 0.06,
    bass: [48, -1, -1, -1, 55, -1, -1, -1, 53, -1, -1, -1, 48, -1, -1, -1],
    lead: [72, 74, 76, -1, 79, -1, 76, 74, 72, -1, 74, -1, 76, -1, -1, -1],
    leadWave: 'triangle', perc: 'none', leadGain: 0.06,
  },
  combat: {
    bpm: 124, pad: [50, 57], padWave: 'sawtooth', padGain: 0.035,
    bass: [38, 38, -1, 38, 41, 41, -1, 41, 36, 36, -1, 36, 43, 43, 41, 41],
    lead: [74, -1, 77, 74, 79, -1, 77, 74, 72, -1, 74, 77, -1, 76, 74, -1],
    leadWave: 'square', perc: 'beat', leadGain: 0.06,
  },
  boss: {
    bpm: 132, pad: [45, 52], padWave: 'sawtooth', padGain: 0.045,
    bass: [33, 33, 40, 33, 35, 35, 42, 35, 33, 33, 40, 33, 31, 31, 38, 38],
    lead: [69, 72, 76, 79, 76, 72, 69, 72, 71, 74, 78, 81, 78, 74, 71, 74],
    leadWave: 'square', perc: 'beat', leadGain: 0.07,
  },
  secret: {
    bpm: 92, pad: [60, 67, 72], padWave: 'triangle', padGain: 0.055,
    bass: [48, -1, 53, -1, 55, -1, 53, -1, 52, -1, 55, -1, 57, -1, 52, -1],
    lead: [84, 86, 88, 91, 88, 86, 84, 86, 83, 86, 88, 91, 88, 91, 93, 96],
    leadWave: 'sine', perc: 'none', leadGain: 0.055,
  },
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioManager {
  constructor(settings, events) {
    this.settings = settings;
    this.events = events;
    this.ctx = null;
    this.ready = false;
    this.track = 'none';
    this.step = 0;
    this.stepTime = 0.18;
    this.timer = 0;
    this.pendingTrack = null;
    events?.on('settings:change', (c) => {
      if (!this.ready) return;
      if (!c || c.key === '*' || ['music', 'sfx', 'ambient'].includes(c.key)) this.applyVolumes();
    });
  }

  /** Chamado no primeiro gesto do usuário (política de autoplay dos navegadores). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.ambientGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.ambientGain.connect(this.master);
    this.ambientGain.gain.value = 0;

    this._startAmbientBed();
    this.ready = true;
    this.applyVolumes();
    if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.setTrack(t); }
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = this.settings;
    this.musicGain.gain.value = s.get('music') * 0.6;
    this.sfxGain.gain.value = s.get('sfx') * 0.85;
    const amb = s.get('ambient');
    this.ambientGain.gain.setTargetAtTime(amb * 0.35, this.ctx.currentTime, 0.4);
  }

  _startAmbientBed() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 420;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    src.connect(filter).connect(this.ambientGain);
    src.start(); lfo.start();
  }

  setTrack(name) {
    if (this.track === name) return;
    this.track = name;
    const t = TRACKS[name];
    this.step = 0;
    this.timer = 0;
    if (t) this.stepTime = 60 / t.bpm / 4;
    if (!this.ready) { this.pendingTrack = name; return; }
    this.events?.emit('audio:track', name);
  }

  update(dt) {
    if (!this.ready || !TRACKS[this.track]) return;
    this.timer -= dt;
    let guard = 0;
    while (this.timer <= 0 && guard++ < 4) {
      this.timer += this.stepTime;
      this._playStep(TRACKS[this.track], this.step++ % 16);
    }
  }

  _playStep(t, step) {
    const now = this.ctx.currentTime;
    const bass = t.bass?.[step];
    if (bass > 0) this._tone({ freq: midiToFreq(bass), dur: this.stepTime * 1.8, type: 'triangle', gain: 0.11, when: now, bus: this.musicGain });
    const lead = t.lead?.[step];
    if (lead > 0) this._tone({ freq: midiToFreq(lead), dur: this.stepTime * 1.4, type: t.leadWave || 'sine', gain: t.leadGain ?? 0.06, when: now, bus: this.musicGain });
    if (step % 8 === 0 && t.pad) {
      t.pad.forEach((n, i) => this._tone({
        freq: midiToFreq(n + (step % 16 === 0 ? 0 : 0)) * (1 + i * 0.001),
        dur: this.stepTime * 16, type: t.padWave || 'triangle', gain: t.padGain ?? 0.04, when: now, attack: 0.6, bus: this.musicGain,
      }));
    }
    if (t.perc === 'beat' && (step % 4 === 2 || step % 8 === 0)) this._noise({ dur: 0.09, gain: step % 8 === 0 ? 0.1 : 0.05, freq: 160, when: now, bus: this.musicGain });
    if (t.perc === 'soft' && step % 8 === 4) this._noise({ dur: 0.14, gain: 0.03, freq: 900, when: now, bus: this.musicGain });
  }

  // ------------------------------------------------------------- efeitos
  sfx(name, opts = {}) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const bus = this.sfxGain;
    const t = (o) => this._tone({ bus, when: now, ...o });
    const n = (o) => this._noise({ bus, when: now, ...o });
    switch (name) {
      case 'beam': t({ freq: 900, to: 300, dur: 0.22, type: 'sine', gain: 0.12 }); break;
      case 'charge': t({ freq: 220, to: 1200, dur: 1.1, type: 'triangle', gain: 0.09 }); break;
      case 'chargedShot': t({ freq: 1400, to: 180, dur: 0.5, type: 'sawtooth', gain: 0.1 }); break;
      case 'pulse': t({ freq: 300, to: 90, dur: 0.5, type: 'sine', gain: 0.14 }); break;
      case 'shield': t({ freq: 520, to: 780, dur: 0.35, type: 'sine', gain: 0.1 }); break;
      case 'shieldHit': t({ freq: 1200, to: 600, dur: 0.18, type: 'triangle', gain: 0.1 }); break;
      case 'dash': n({ dur: 0.28, gain: 0.09, freq: 1200, q: 0.7 }); t({ freq: 700, to: 1500, dur: 0.22, type: 'sine', gain: 0.07 }); break;
      case 'jump': t({ freq: 420, to: 760, dur: 0.18, type: 'sine', gain: 0.09 }); break;
      case 'land': n({ dur: 0.12, gain: 0.07, freq: 300 }); break;
      case 'hit': t({ freq: 260, to: 120, dur: 0.16, type: 'square', gain: 0.09 }); break;
      case 'hurt': t({ freq: 180, to: 90, dur: 0.4, type: 'sawtooth', gain: 0.1 }); break;
      case 'coin': t({ freq: 1180, dur: 0.08, type: 'sine', gain: 0.1 }); t({ freq: 1560, dur: 0.14, type: 'sine', gain: 0.08, delay: 0.07 }); break;
      case 'crystal': t({ freq: 1320, dur: 0.5, type: 'sine', gain: 0.09 }); t({ freq: 1980, dur: 0.6, type: 'sine', gain: 0.05, delay: 0.05 }); break;
      case 'chest': [523, 659, 784, 1046].forEach((f, i) => t({ freq: f, dur: 0.4, type: 'triangle', gain: 0.08, delay: i * 0.09 })); break;
      case 'secret': [784, 988, 1174, 1568].forEach((f, i) => t({ freq: f, dur: 0.5, type: 'sine', gain: 0.07, delay: i * 0.12 })); break;
      case 'purify': [660, 880, 1100].forEach((f, i) => t({ freq: f, dur: 0.6, type: 'sine', gain: 0.07, delay: i * 0.1 })); break;
      case 'trick': t({ freq: 900, to: 1800, dur: 0.3, type: 'triangle', gain: 0.07 }); break;
      case 'step': n({ dur: 0.07, gain: 0.03, freq: 500 }); break;
      case 'ui': t({ freq: 660, dur: 0.09, type: 'sine', gain: 0.07 }); break;
      case 'door': n({ dur: 0.7, gain: 0.07, freq: 200 }); t({ freq: 120, to: 70, dur: 0.8, type: 'sawtooth', gain: 0.05 }); break;
      case 'lever': t({ freq: 300, to: 500, dur: 0.2, type: 'square', gain: 0.07 }); break;
      case 'crystalHit': t({ freq: 1800, to: 900, dur: 0.35, type: 'sine', gain: 0.08 }); break;
      case 'grapple': t({ freq: 500, to: 1400, dur: 0.3, type: 'triangle', gain: 0.08 }); break;
      case 'quest': [659, 784, 1046].forEach((f, i) => t({ freq: f, dur: 0.5, type: 'triangle', gain: 0.07, delay: i * 0.12 })); break;
      case 'heal': [523, 698, 880].forEach((f, i) => t({ freq: f, dur: 0.7, type: 'sine', gain: 0.06, delay: i * 0.1 })); break;
      case 'levelup': [523, 659, 784, 1046, 1318].forEach((f, i) => t({ freq: f, dur: 0.6, type: 'triangle', gain: 0.08, delay: i * 0.1 })); break;
      case 'bossAlert': t({ freq: 140, to: 90, dur: 1.1, type: 'sawtooth', gain: 0.12 }); break;
      case 'bossSlam': n({ dur: 0.4, gain: 0.14, freq: 120 }); break;
      case 'save': t({ freq: 880, dur: 0.2, type: 'sine', gain: 0.08 }); t({ freq: 1320, dur: 0.3, type: 'sine', gain: 0.06, delay: 0.12 }); break;
      case 'hurtSoft': t({ freq: 400, to: 240, dur: 0.2, type: 'sine', gain: 0.06 }); break;
      default: break;
    }
    if (opts.pitch) { /* reservado para variações */ }
  }

  _tone({ freq, to, dur = 0.2, type = 'sine', gain = 0.08, when, delay = 0, attack = 0.01, bus = null, detune = 0 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const start = (when ?? ctx.currentTime) + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(30, freq), start);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + dur);
    if (detune) osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(bus || this.master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  _noise({ dur = 0.2, gain = 0.08, freq = 800, q = 1, when, delay = 0, bus = null }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const start = (when ?? ctx.currentTime) + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = freq < 400 ? 'lowpass' : 'bandpass';
    filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(filter).connect(g).connect(bus || this.master);
    src.start(start);
  }
}
