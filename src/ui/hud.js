// Interface do jogo: barras de vida/energia, ícones das habilidades com recarga,
// minimapa com bússola, indicador de interação, missões, avisos e controles de toque.

import { clamp } from '../core/state.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor({ events, settings, input, audio }) {
    this.events = events;
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.lastAbility = '';
    this.hintTimer = 0;
    this.promptVisible = false;
    this.toastCount = 0;

    this.el = {
      hud: $('hud'), healthFill: $('health-fill'), healthText: $('health-text'),
      energyFill: $('energy-fill'), energyText: $('energy-text'), abilities: $('ability-bar'),
      minimap: $('minimap'), compass: $('compass'), quest: $('quest-tracker'), questText: $('quest-text'),
      prompt: $('prompt'), promptKey: $('prompt-key'), promptText: $('prompt-text'),
      bossbar: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      toasts: $('toasts'), hint: $('hint'), safe: $('safe-badge'), vignette: $('vignette'),
      touch: $('touch'), joy: $('joy'), joyKnob: $('joy-knob'), gear: $('gear'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.bindEvents();
    this.bindTouch();
    this.el.gear.addEventListener('click', () => this.events.emit('ui:pause-request', {}));
  }

  bindEvents() {
    this.events.on('prompt:show', ({ key, text, usable }) => {
      this.el.prompt.classList.remove('hidden');
      this.el.promptKey.textContent = key;
      this.el.promptText.textContent = text + (usable === false ? ' 🔒' : '');
    });
    this.events.on('prompt:hide', () => this.el.prompt.classList.add('hidden'));
    this.events.on('ui:toast', ({ text, icon }) => this.toast(text, icon));
  }

  bindTouch() {
    const joy = this.el.joy;
    if (!joy) return;
    let active = null;
    const radius = 46;
    const setFromEvent = (e) => {
      const rect = joy.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Number.isFinite(e.clientX) ? e.clientX : rect.left + rect.width / 2;
      const py = Number.isFinite(e.clientY) ? e.clientY : rect.top + rect.height / 2;
      let dx = px - (rect.left + rect.width / 2);
      let dy = py - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      this.el.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setTouchAxis(clamp(dx / radius, -1, 1), clamp(dy / radius, -1, 1), true);
    };
    joy.addEventListener('pointerdown', (e) => {
      active = e.pointerId;
      try { joy.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ }
      setFromEvent(e);
    });
    joy.addEventListener('pointermove', (e) => { if (active === e.pointerId) setFromEvent(e); });
    const end = (e) => {
      if (active !== e.pointerId) return;
      active = null;
      this.el.joyKnob.style.transform = 'translate(0px, 0px)';
      this.input.setTouchAxis(0, 0, false);
    };
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);

    document.querySelectorAll('.tbtn').forEach((btn) => {
      const action = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.classList.add('on'); this.input.touchPress(action); });
      const release = (e) => { e.preventDefault(); btn.classList.remove('on'); this.input.touchRelease(action); };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  /** Mostra/oculta os controles de toque conforme dispositivo e opção. */
  applyTouchPreference() {
    const pref = this.settings.get('touch');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const show = pref === 'on' || (pref === 'auto' && coarse);
    this.el.touch.classList.toggle('hidden', !show);
    return show;
  }

  setVisible(visible) {
    this.el.hud.classList.toggle('hidden', !visible);
  }

  toast(text, icon = '✨') {
    if (!text) return;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = `${icon} ${text}`.trim();
    this.el.toasts.appendChild(div);
    this.toastCount += 1;
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transition = 'opacity .4s';
      setTimeout(() => div.remove(), 420);
    }, 3200);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstChild.remove();
  }

  hint(text, seconds = 6) {
    if (!this.settings.get('tutorials')) return;
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('hidden');
    this.hintTimer = seconds;
  }

  hideHint() { this.el.hint.classList.add('hidden'); }

  update(dt, ctx) {
    const { player, lantern, world, quests } = ctx;

    // barras
    const hp = clamp(player.health / player.maxHealth, 0, 1);
    this.el.healthFill.style.transform = `scaleX(${hp})`;
    this.el.healthText.textContent = `${Math.ceil(player.health)} / ${player.maxHealth}`;
    const en = clamp(player.energy / player.maxEnergy, 0, 1);
    this.el.energyFill.style.transform = `scaleX(${en})`;
    this.el.energyText.textContent = `⚡ ${Math.ceil(player.energy)}`;

    // habilidades
    const abilities = lantern.abilityState(this.settings);
    const signature = abilities.map((a) => `${a.id}${a.locked ? 'L' : ''}${a.cooldown.toFixed(2)}${a.active ? 'A' : ''}`).join('|');
    if (signature !== this.lastAbility) {
      this.lastAbility = signature;
      if (this.el.abilities.children.length !== abilities.length) {
        this.el.abilities.innerHTML = '';
        for (const a of abilities) {
          const div = document.createElement('div');
          div.className = 'ability';
          div.dataset.action = a.id;
          div.innerHTML = `<span class="ico">${a.icon}</span><span class="lbl">${a.label}</span><span class="cd"></span><span class="key"></span>`;
          this.el.abilities.appendChild(div);
        }
      }
      abilities.forEach((a, i) => {
        const div = this.el.abilities.children[i];
        if (!div) return;
        div.classList.toggle('locked', !!a.locked);
        div.classList.toggle('active', !!a.active);
        div.querySelector('.ico').textContent = a.icon;
        div.querySelector('.lbl').textContent = a.label;
        div.querySelector('.key').textContent = a.key;
        div.querySelector('.cd').style.transform = `scaleY(${clamp(a.cooldown, 0, 1)})`;
      });
    }

    // missão
    const tracker = quests?.trackerText?.();
    if (tracker) {
      this.el.quest.classList.remove('hidden');
      this.el.questText.textContent = `${tracker.title} — ${tracker.text}`;
    } else {
      this.el.quest.classList.add('hidden');
    }

    // área segura
    const safe = world?.isSafe?.(player.position);
    this.el.safe.classList.toggle('hidden', !safe);

    // dica contextual
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hideHint();
    }

    // vinheta de dano
    const v = clamp(player.invulnerable / 0.85, 0, 1) * (player.health < player.maxHealth ? 0.7 : 0.4);
    this.el.vignette.style.opacity = player.hurtTimer > 0 ? String(clamp(v, 0, 0.85)) : '0';

    this.drawMinimap(ctx);
  }

  setBoss(visible, name, ratio) {
    this.el.bossbar.classList.toggle('hidden', !visible);
    if (visible) {
      if (name) this.el.bossName.textContent = name;
      this.el.bossFill.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;
    }
  }

  drawMinimap(ctx) {
    const { player, world, enemies, miniboss } = ctx;
    const canvas = this.el.minimap;
    const size = canvas.width;
    const g = this.mm;
    g.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const scale = 2.4; // pixels por unidade de mundo
    const radius = size / 2 - 6;

    g.save();
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(8,14,26,.85)';
    g.fillRect(0, 0, size, size);

    // anéis de referência
    g.strokeStyle = 'rgba(140,200,255,.14)';
    for (let r = 12; r < radius; r += 26) {
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    }
    g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, size); g.moveTo(0, cy); g.lineTo(size, cy);
    g.strokeStyle = 'rgba(140,200,255,.10)'; g.stroke();

    // pontos de interesse
    for (const p of world.mapData()) {
      if (p.hidden) continue;
      const dx = (p.x - player.position.x) * scale;
      const dz = (p.z - player.position.z) * scale;
      if (Math.hypot(dx, dz) > radius) continue;
      g.font = '14px serif';
      g.textAlign = 'center';
      g.fillText(p.icon, cx + dx, cy + dz + 5);
    }

    // zona segura
    for (const z of world.safeZones || []) {
      const dx = (z.x - player.position.x) * scale;
      const dz = (z.z - player.position.z) * scale;
      g.beginPath();
      g.arc(cx + dx, cy + dz, z.radius * scale, 0, Math.PI * 2);
      g.fillStyle = 'rgba(126,242,176,.10)';
      g.fill();
      g.strokeStyle = 'rgba(126,242,176,.35)';
      g.stroke();
    }

    // inimigos
    for (const e of enemies?.list || []) {
      const dx = (e.position.x - player.position.x) * scale;
      const dz = (e.position.z - player.position.z) * scale;
      if (Math.hypot(dx, dz) > radius - 4) continue;
      g.beginPath();
      g.arc(cx + dx, cy + dz, 4.4, 0, Math.PI * 2);
      g.fillStyle = e.corrupted ? 'rgba(190,150,255,.9)' : 'rgba(255,140,140,.9)';
      g.fill();
    }
    // minichefe
    if (miniboss?.alive && miniboss.awake) {
      const dx = (miniboss.position.x - player.position.x) * scale;
      const dz = (miniboss.position.z - player.position.z) * scale;
      if (Math.hypot(dx, dz) < radius) {
        g.beginPath(); g.arc(cx + dx, cy + dz, 6.5, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,200,90,.95)'; g.fill();
      }
    }

    // jogador
    g.save();
    g.translate(cx, cy);
    g.rotate(-player.facing + Math.PI);
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8);
    g.closePath();
    g.fillStyle = '#bff6ff';
    g.fill();
    g.restore();
    g.restore();

    // borda e bússola
    this.el.compass.textContent = 'N';
  }
}
