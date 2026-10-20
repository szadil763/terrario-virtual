// Configurações, acessibilidade e remapeamento de comandos.

const KEY = 'luzdobosque.settings.v1';

export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', dash: 'KeyQ', trick: 'KeyR', sprint: 'ShiftLeft',
  attack: 'KeyJ', defense: 'KeyK', special: 'KeyU', toggle: 'KeyI',
  interact: 'KeyE', map: 'KeyM', pause: 'Escape',
  camLeft: 'ArrowLeft', camRight: 'ArrowRight', camUp: 'ArrowUp', camDown: 'ArrowDown',
};

export const DEFAULT_MOUSE = { attack: 0, defense: 2, special: 1, toggle: 3 };

export const ACTION_LABELS = {
  forward: 'Ir para frente', back: 'Ir para trás', left: 'Esquerda', right: 'Direita',
  jump: 'Pular', dash: 'Dash (Q)', sprint: 'Correr (Shift)',
  trick: 'Manobra da lanterna (R)',
  attack: 'Ataque da lanterna (M1)', defense: 'Defesa / mira (M2)',
  special: 'Habilidade especial (M3)', toggle: 'Alternar poder (M4)',
  interact: 'Interagir', map: 'Mapa', pause: 'Pausa',
  camLeft: 'Câmera ←', camRight: 'Câmera →', camUp: 'Câmera ↑', camDown: 'Câmera ↓',
};

const MOUSE_NAMES = { 0: 'M1 esquerdo', 1: 'M3 meio', 2: 'M2 direito', 3: 'M4 extra' };
// no navegador o botão 1 é o do meio e o 2 é o direito — o rótulo precisa seguir essa ordem
const MOUSE_SHORT = { 0: 'M1', 1: 'M3', 2: 'M2', 3: 'M4' };

export const DEFAULTS = {
  brightness: 1,       // brilho geral da cena
  fx: 1,               // intensidade dos efeitos/partículas
  music: 0.55,
  sfx: 0.8,
  ambient: 0.5,
  textScale: 1,
  calm: false,         // exploração tranquila: inimigos menos agressivos
  difficulty: 1,       // 0.6 fácil · 1 normal · 1.5 desafiador
  tutorials: true,
  touch: 'auto',       // auto | on | off
  sensitivity: 1,
  invertY: false,
  bindings: { ...DEFAULT_BINDINGS },
  mouse: { ...DEFAULT_MOUSE },
};

export class Settings {
  constructor(events) {
    this.events = events;
    this.values = { ...DEFAULTS, bindings: { ...DEFAULT_BINDINGS }, mouse: { ...DEFAULT_MOUSE } };
    this.load();
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    this.values[key] = value;
    this.persist();
    this.events?.emit('settings:change', { key, value });
    return value;
  }

  patch(obj) {
    for (const [k, v] of Object.entries(obj)) this.values[k] = v;
    this.persist();
    this.events?.emit('settings:change', obj);
  }

  get bindings() { return this.values.bindings; }
  get mouse() { return this.values.mouse; }

  setBinding(action, code) {
    this.values.bindings[action] = code;
    this.persist();
    this.events?.emit('settings:change', { key: 'bindings' });
  }

  setMouseBinding(action, button) {
    this.values.mouse[action] = button;
    this.persist();
    this.events?.emit('settings:change', { key: 'mouse' });
  }

  /** Nome legível do comando atual (tecla ou botão do mouse). */
  label(action) {
    const mouseAction = ['attack', 'defense', 'special', 'toggle'].includes(action);
    const btn = this.values.mouse[action];
    const key = this.values.bindings[action];
    const keyLabel = key ? key.replace('Key', '').replace('Digit', '').replace('Arrow', '←→↑↓') : '—';
    if (mouseAction) return `${MOUSE_NAMES[btn] ?? 'M?'} / ${keyLabel}`;
    return keyLabel;
  }

  /** Rótulo curto para os ícones do HUD (ex.: "M1·J"). */
  shortLabel(action) {
    const mouseAction = ['attack', 'defense', 'special', 'toggle'].includes(action);
    const key = this.keyLabel(action);
    if (mouseAction) {
      const btn = this.values.mouse[action] ?? 0;
      return `${MOUSE_SHORT[btn] || `M${btn + 1}`}·${key}`;
    }
    return key;
  }

  keyLabel(action) {
    const key = this.values.bindings[action] || '';
    if (key.startsWith('Key')) return key.slice(3);
    if (key === 'Space') return 'Espaço';
    if (key === 'Escape') return 'Esc';
    if (key === 'ShiftLeft') return 'Shift';
    if (key.startsWith('Digit')) return key.slice(5);
    return key || '—';
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.values = {
        ...DEFAULTS,
        ...parsed,
        bindings: { ...DEFAULT_BINDINGS, ...(parsed.bindings || {}) },
        mouse: { ...DEFAULT_MOUSE, ...(parsed.mouse || {}) },
      };
    } catch (err) { console.warn('[settings] falha ao ler', err); }
  }

  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (err) { /* modo privado */ }
  }

  reset() {
    this.values = { ...DEFAULTS, bindings: { ...DEFAULT_BINDINGS }, mouse: { ...DEFAULT_MOUSE } };
    this.persist();
    this.events?.emit('settings:change', { key: '*' });
  }
}

export const mouseButtonName = (b) => MOUSE_NAMES[b] ?? `M${b + 1}`;
