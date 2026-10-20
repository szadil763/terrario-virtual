// Entrada unificada: teclado, mouse (M1..M4 configuráveis) e toque.
// Todas as ações passam por aqui, então o remapeamento e o suporte a
// dispositivos sem os botões extras funcionam de graça para todo o jogo.

import { DEFAULT_BINDINGS, DEFAULT_MOUSE, ACTION_LABELS } from './settings.js';
import { clamp } from './state.js';

export const ACTIONS = Object.keys(DEFAULT_BINDINGS);
export { ACTION_LABELS };
export const MOUSE_ACTIONS = ['attack', 'defense', 'special', 'toggle'];

export class Input {
  constructor(canvas, settings, events) {
    this.canvas = canvas;
    this.settings = settings;
    this.events = events;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, dx: 0, dy: 0, wheel: 0 };
    this.touchAxis = { x: 0, z: 0 };
    this.touchDir = { x: 0, y: 0, active: false };
    this.capture = null; // ação aguardando novo comando (remapeamento)
    this.enabled = true;
    this.pointerActive = false;
    this._bind();
  }

  _bind() {
    this.onKeyDown = (e) => {
      if (this.capture) {
        this._finishCapture(e.code);
        e.preventDefault();
        return;
      }
      if (!this.enabled) return;
      const action = this.actionForCode(e.code);
      if (action) {
        if (!this.down.has(action)) this.pressed.add(action);
        this.down.add(action);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        if (e.code === 'Escape') e.preventDefault();
      }
      this.events?.emit('input:key', e.code);
    };
    this.onKeyUp = (e) => {
      const action = this.actionForCode(e.code);
      if (action) { this.down.delete(action); this.released.add(action); }
    };
    this.onMouseDown = (e) => {
      if (this.capture) { this._finishCapture(`mouse:${e.button}`); e.preventDefault(); return; }
      if (!this.enabled) return;
      this.pointerActive = true;
      const action = this.actionForButton(e.button);
      if (action) {
        if (!this.down.has(action)) this.pressed.add(action);
        this.down.add(action);
      }
      if (e.button === 2 || e.button === 1) e.preventDefault();
    };
    this.onMouseUp = (e) => {
      const action = this.actionForButton(e.button);
      if (action) { this.down.delete(action); this.released.add(action); }
    };
    this.onMouseMove = (e) => {
      const w = window.innerWidth, h = window.innerHeight;
      this.mouse.nx = (e.clientX / w) * 2 - 1;
      this.mouse.ny = (e.clientY / h) * 2 - 1;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      this.pointerActive = true;
    };
    this.onWheel = (e) => { this.mouse.wheel += e.deltaY; e.preventDefault(); };
    this.onBlur = () => { this.down.clear(); this.touchAxis.x = 0; this.touchAxis.z = 0; };
    this.onContext = (e) => e.preventDefault();

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContext);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContext);
  }

  actionForCode(code) {
    const b = this.settings.bindings;
    for (const action of ACTIONS) if (b[action] === code) return action;
    return null;
  }

  actionForButton(button) {
    const m = this.settings.mouse;
    for (const action of MOUSE_ACTIONS) if (m[action] === button) return action;
    return null;
  }

  isDown(action) { return this.down.has(action) || this.touchDown?.has(action); }
  justPressed(action) { return this.pressed.has(action); }
  justReleased(action) { return this.released.has(action); }

  /** Direção de movimento desejada (WASD + analógico de toque), normalizada. */
  moveAxis() {
    let x = 0, z = 0;
    if (this.isDown('forward')) z -= 1;
    if (this.isDown('back')) z += 1;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    x += Number.isFinite(this.touchAxis.x) ? this.touchAxis.x : 0;
    z += Number.isFinite(this.touchAxis.z) ? this.touchAxis.z : 0;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z, magnitude: Math.min(1, len) };
  }

  consumeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0; this.mouse.dy = 0;
  }

  /** Marca ações como já tratadas neste quadro (evita que a mesma tecla seja lida duas vezes). */
  consume(...actions) {
    for (const a of actions) { this.pressed.delete(a); this.released.delete(a); }
  }

  // ------------------------------------------------------------- toque
  ensureTouchSet() { if (!this.touchDown) this.touchDown = new Set(); }

  setTouchAxis(x, y, active = true) {
    // alguns dispositivos/eventos sintéticos chegam sem coordenadas válidas:
    // um valor não numérico aqui contaminaria a posição do jogador.
    this.touchAxis.x = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
    this.touchAxis.z = Number.isFinite(y) ? clamp(y, -1, 1) : 0;
    this.touchDir.active = active;
  }

  touchPress(action) {
    this.ensureTouchSet();
    if (!this.touchDown.has(action)) this.pressed.add(action);
    this.touchDown.add(action);
  }

  touchRelease(action) {
    this.ensureTouchSet();
    this.touchDown.delete(action);
    this.released.add(action);
  }

  // --------------------------------------------------- remapeamento
  beginCapture(action) {
    this.capture = action;
    this.events?.emit('input:capture', action);
  }

  cancelCapture() { this.capture = null; this.events?.emit('input:capture', null); }

  _finishCapture(code) {
    const action = this.capture;
    this.capture = null;
    if (!action) return;
    if (code.startsWith('mouse:')) this.settings.setMouseBinding(action, Number(code.split(':')[1]));
    else this.settings.setBinding(action, code);
    this.events?.emit('input:capture', null);
    this.events?.emit('input:rebound', { action, code });
  }
}

export { DEFAULT_BINDINGS, DEFAULT_MOUSE };
