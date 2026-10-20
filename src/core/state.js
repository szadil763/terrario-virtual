// Máquina de estados e barramento de eventos compartilhados.
// Cada sistema (jogo, jogador, lanterna, inimigos) pode usar sua própria máquina
// de estados com o mesmo utilitário, mantendo a arquitetura previsível.

export class StateMachine {
  /** @param {string} initial @param {Object<string,{enter?:Function,exit?:Function,update?:Function}>} states */
  constructor(initial, states = {}) {
    this.states = states;
    this.current = initial;
    this.time = 0;
    this.previous = null;
    this.changeListeners = [];
  }

  define(name, def) { this.states[name] = def; return this; }

  is(name) { return this.current === name; }

  on(event, cb) {
    if (event !== 'change') return () => {};
    this.changeListeners.push(cb);
    return () => { this.changeListeners = this.changeListeners.filter((c) => c !== cb); };
  }

  set(name, payload = {}) {
    if (!this.states[name]) {
      console.warn(`[state] estado desconhecido: ${name}`);
      return;
    }
    if (this.current === name && !payload.force) return;
    const prev = this.current;
    this.states[prev]?.exit?.(name, this);
    this.previous = prev;
    this.current = name;
    this.time = 0;
    this.states[name]?.enter?.(prev, this, payload);
    this.changeListeners.forEach((cb) => cb(name, prev));
  }

  update(dt) {
    this.time += dt;
    this.states[this.current]?.update?.(dt, this);
  }
}

/** Emissor mínimo de eventos (usado para HUD, áudio, missões). */
export class Emitter {
  constructor() { this.map = new Map(); }
  on(type, cb) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(cb);
    return () => this.off(type, cb);
  }
  off(type, cb) { this.map.get(type)?.delete(cb); }
  emit(type, payload) {
    const set = this.map.get(type);
    if (!set) return;
    for (const cb of [...set]) {
      try { cb(payload); } catch (err) { console.error(`[events:${type}]`, err); }
    }
  }
}

/** Utilidades numéricas usadas por vários sistemas. */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
