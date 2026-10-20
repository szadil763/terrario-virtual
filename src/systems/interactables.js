// Objetos interativos do mundo: baús, caixas destrutíveis, alavancas, portas,
// cristais que refletem luz, flores luminosas, paredes secretas, pontos de
// gancho, inscrições, pontos de descanso e itens coletáveis.

import * as THREE from 'three';
import { clamp, rand } from '../core/state.js';
import { rollChest, ITEMS } from './loot.js';

let nextId = 1;

export class Interactable {
  constructor({ id, type, position, radius = 2.4, label = 'Objeto', hidden = false, requires = null }) {
    this.id = id || `${type}-${nextId++}`;
    this.type = type;
    this.position = position.clone();
    this.radius = radius;
    this.label = label;
    this.hidden = hidden;
    this.revealed = !hidden;
    this.requires = requires; // ex.: {mode:'revelacao'} ou {item:'chave_ruina'}
    this.done = false;
    this.mesh = null;
    this.glow = null;
  }

  get available() { return this.revealed && !this.done; }

  hint() {
    if (this.requires?.item) return `Precisa de ${ITEMS[this.requires.item]?.name || 'um item'}`;
    if (this.requires?.mode) return 'Use o poder Revelação';
    return this.label;
  }

  canUse(ctx) {
    if (!this.available) return false;
    if (this.requires?.item && ctx.inventory && !ctx.inventory.has(this.requires.item)) return false;
    if (this.requires?.mode && ctx.lantern?.mode !== this.requires.mode) return false;
    return true;
  }

  reveal(ctx) {
    if (this.revealed) return false;
    this.revealed = true;
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.scale.setScalar(0.2);
      if (this.mesh.material) {
        this.mesh.material.transparent = false;
        this.mesh.material.opacity = 1;
      }
    }
    this.onReveal?.(ctx);
    ctx?.effects?.ring(this.position, { color: '#e8dcff', from: 0.3, to: 3, life: 0.6 });
    ctx?.effects?.burst(this.position, { color: '#e8dcff', count: 16, speed: 3.5, size: 0.3, life: 0.7, gravity: 1 });
    ctx?.toast?.('Passagem secreta revelada!', '👁');
    ctx?.audio?.sfx('secret');
    ctx?.quests?.event('reveal', { id: this.id, type: this.type });
    return true;
  }

  update(dt, ctx) {
    if (this.mesh && this.revealed && this.mesh.scale.x < 1) {
      this.mesh.scale.setScalar(Math.min(1, this.mesh.scale.x + dt * 2.5));
    }
    this._animate?.(dt, ctx);
  }
}

export class Chest extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'chest', label: `Abrir ${opts.tier === 'secreto' ? 'baú secreto' : opts.tier === 'raro' ? 'baú raro' : 'baú'}` });
    this.tier = opts.tier || 'comum';
    this.depth = opts.depth || 0;
    this.opened = false;
    this.doubleKey = !!opts.needsKey;
  }

  canUse(ctx) {
    if (this.opened) return false;
    if (this.hidden && !this.revealed) return false;
    if (this.doubleKey && ctx.inventory && !ctx.inventory.has('chave_ruina')) return false;
    return true;
  }

  interact(ctx) {
    this.opened = true;
    this.done = true;
    const loot = rollChest(this.tier, this.depth);
    for (const { id, amount } of loot) ctx.give(id, amount);
    ctx.audio?.sfx('chest');
    ctx.effects?.burst(this.position.clone().add(new THREE.Vector3(0, 0.7, 0)), { color: '#ffd479', count: 30, speed: 5, size: 0.36, life: 1, gravity: -2 });
    ctx.effects?.flash(this.position, '#ffd479', 3, 8);
    ctx.toast?.(loot.map((l) => `${ITEMS[l.id]?.icon || '•'} ${ITEMS[l.id]?.name || l.id} ×${l.amount}`).join('  '), '🎁');
    ctx.quests?.event('chest', { id: this.id, tier: this.tier });
    if (this.lid) this.lid.rotation.x = -1.9;
    ctx.events?.emit('chest:opened', { id: this.id, tier: this.tier, loot });
    return true;
  }
}

export class Breakable extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'breakable', label: 'Quebrar com luz', radius: 2.0 });
    this.hp = opts.hp || 20;
    this.loot = opts.loot || [['moeda', 4, 9]];
    this.requires = { mode: undefined };
  }

  // caixotes são alvos de luz, não objetos de interação com E
  get available() { return false; }
  canUse() { return false; }

  takeDamage(amount, opts, ctx) {
    this.hp -= amount;
    if (opts?.position) ctx?.effects?.burst(opts.position, { color: '#d9b98a', count: 8, speed: 3, size: 0.24, life: 0.45 });
    if (this.hp <= 0) {
      this.done = true;
      if (this.mesh) this.mesh.visible = false;
      ctx?.audio?.sfx('crystalHit');
      ctx?.effects?.burst(this.position, { color: '#e6cf9b', count: 24, speed: 5, size: 0.32, life: 0.8, gravity: -3 });
      for (const [id, min, max] of this.loot) ctx?.give?.(id, Math.round(rand(min, max)));
      ctx?.toast?.('Você encontrou algo escondido!', '🧱');
      return true;
    }
    return false;
  }
}

export class Lever extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'lever', label: opts.label || 'Puxar alavanca', radius: 2.4 });
    this.pulled = false;
    this.onPull = opts.onPull;
    this.group = opts.group;
  }

  interact(ctx) {
    this.pulled = !this.pulled;
    if (this.handle) this.handle.rotation.x = this.pulled ? -0.9 : 0.9;
    ctx.audio?.sfx('lever');
    ctx.effects?.ring(this.position, { color: '#ffd479', from: 0.3, to: 2.4, life: 0.5 });
    ctx.events?.emit('lever:pulled', { id: this.id, group: this.group, pulled: this.pulled, count: ctx.world?.leversPulled?.(this.group) });
    this.onPull?.(this.pulled, ctx);
    return true;
  }
}

export class Door extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'door', label: opts.label || 'Abrir porta', radius: 3 });
    this.open = false;
    this.requiresKey = opts.requiresKey || null;
  }

  canUse(ctx) {
    if (this.open) return false;
    if (this.requiresKey && ctx.inventory && !ctx.inventory.has(this.requiresKey)) return false;
    return true;
  }

  hint() {
    if (this.open) return 'Porta aberta';
    if (this.requiresKey && !this.canUse?.({ inventory: { has: () => false } }) && this.requiresKey) return `Trancada — precisa de ${ITEMS[this.requiresKey]?.name}`;
    return this.label;
  }

  interact(ctx) {
    if (this.requiresKey && !ctx.inventory.has(this.requiresKey)) {
      ctx.toast?.(`Trancada. Encontre ${ITEMS[this.requiresKey]?.name}.`, '🔒');
      return false;
    }
    this.open = true;
    this.done = true;
    ctx.audio?.sfx('door');
    if (this.mesh) {
      this.mesh.userData.openT = 0;
      ctx.events?.emit('door:opened', { id: this.id, target: this.target });
    }
    if (this.requiresKey) ctx.inventory.remove(this.requiresKey, 1);
    this.unlock?.(ctx);
    ctx.quests?.event('door', { id: this.id });
    ctx.toast?.('Passagem aberta!', '🚪');
    return true;
  }

  update(dt, ctx) {
    if (this.open && this.mesh && this.mesh.userData.openT !== undefined && this.mesh.userData.openT < 1) {
      this.mesh.userData.openT = Math.min(1, this.mesh.userData.openT + dt * 1.2);
      this.mesh.position.y = this.mesh.userData.baseY + this.mesh.userData.openT * (this.mesh.userData.lift || 4.2);
    }
  }
}

export class CrystalNode extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'crystal', label: 'Cristal luminoso', radius: opts.radius || 1.6 });
    this.active = true;
    this.cooldown = 0;
    this.color = opts.color || '#7ec8ff';
  }

  // cristais são alvos para refletir a luz, não objetos de interação com E
  get available() { return false; }

  update(dt, ctx) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.mesh) {
      this.mesh.rotation.y += dt * 0.6;
      const s = 1 + Math.sin(performance.now() / 400) * 0.05;
      this.mesh.scale.setScalar(clamp(s, 0.9, 1.1));
    }
  }
}

export class GlowFlower extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'flower', label: 'Florescer com a luz verde', radius: 2.6 });
    this.bloomed = false;
    this.color = opts.color || '#7cf0a8';
  }

  interact(ctx) { return this.bloom(ctx); }

  bloom(ctx) {
    if (this.bloomed) return false;
    this.bloomed = true;
    this.done = true;
    if (this.petals) {
      this.petals.visible = true;
      this.petals.scale.setScalar(0.2);
    }
    ctx?.effects?.burst(this.position.clone().add(new THREE.Vector3(0, 0.4, 0)), { color: this.color, count: 22, speed: 3, size: 0.3, life: 0.9, gravity: 1 });
    ctx?.audio?.sfx('purify');
    ctx?.quests?.event('flower', { id: this.id });
    ctx?.toast?.('Uma flor luminosa desabrochou!', '🌸');
    return true;
  }

  update(dt, ctx) {
    if (this.bloomed && this.petals && this.petals.scale.x < 1) {
      this.petals.scale.setScalar(Math.min(1, this.petals.scale.x + dt * 2));
      if (this.glowSprite) this.glowSprite.material.opacity = Math.min(0.9, this.glowSprite.material.opacity + dt);
    }
  }
}

export class SecretWall extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'secret', hidden: true, label: 'Parede ilusória', radius: 3 });
  }

  // reveladas pelo poder Revelação, não pelo botão de interagir
  get available() { return false; }
  hideFromPhysics() { return !this.revealed; }
}

export class Inscription extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'inscription', label: 'Ler inscrição antiga', radius: 2.6, hidden: !!opts.hidden });
    this.text = opts.text || '';
    this.title = opts.title || 'Inscrição';
  }

  interact(ctx) {
    if (this.read) { ctx.toast?.(this.text, '📜'); return true; }
    this.read = true;
    ctx.dialogue?.open?.({ name: this.title, text: this.text, choices: [{ label: 'Entendi', next: null }] });
    ctx.inventory?.add('fragmento', 1);
    ctx.audio?.sfx('quest');
    ctx.quests?.event('lore', { id: this.id });
    return true;
  }
}

export class Checkpoint extends Interactable {
  constructor(opts) {
    super({ ...opts, type: 'checkpoint', label: 'Descansar (recupera vida)', radius: 3.2 });
    this.safeRadius = opts.safeRadius || 8;
  }

  interact(ctx) {
    ctx.player.health = ctx.player.maxHealth;
    ctx.player.energy = ctx.player.maxEnergy;
    ctx.world?.setRespawn?.(this.position);
    ctx.audio?.sfx('heal');
    ctx.effects?.ring(this.position, { color: '#7cf0a8', from: 0.4, to: 5, life: 0.9 });
    ctx.toast?.('Você descansou. Vida e energia recuperadas!', '🔥');
    ctx.events?.emit('checkpoint:reached', { position: this.position.clone() });
    return true;
  }
}

export class GrapplePoint {
  constructor({ position, mesh }) {
    this.position = position.clone();
    this.mesh = mesh;
    this.type = 'grapple';
  }
  update(dt) {
    if (this.mesh) this.mesh.rotation.z += dt * 0.9;
  }
}

export class Pickup {
  constructor({ position, itemId, amount = 1, mesh = null }) {
    this.position = position.clone();
    this.itemId = itemId;
    this.amount = amount;
    this.mesh = mesh;
    this.dead = false;
    this.t = rand(0, 6);
    this.baseY = position.y;
  }

  update(dt, ctx) {
    this.t += dt;
    if (!this.mesh) return;
    this.mesh.position.y = this.baseY + Math.sin(this.t * 2.4) * 0.14;
    this.mesh.rotation.y += dt * 1.6;
    const player = ctx.player;
    if (!player?.isAlive) return;
    const d = player.position.distanceTo(this.mesh.position);
    if (d < 2.6) {
      const dir = new THREE.Vector3().subVectors(player.chestPosition, this.mesh.position).normalize();
      this.mesh.position.addScaledVector(dir, dt * 9);
    }
    if (d < 0.9) {
      this.dead = true;
      ctx.give?.(this.itemId, this.amount);
      ctx.effects?.burst(this.mesh.position, { color: ITEMS[this.itemId]?.icon === '🪙' ? '#ffd479' : '#bff6ff', count: 10, speed: 2.5, size: 0.26, life: 0.5 });
      ctx.audio?.sfx(this.itemId === 'moeda' ? 'coin' : 'crystal');
    }
  }
}

export class InteractionManager {
  constructor({ events, audio, effects }) {
    this.events = events;
    this.audio = audio;
    this.effects = effects;
    this.list = [];
    this.pickups = [];
    this.current = null;
  }

  add(obj) { this.list.push(obj); return obj; }
  addPickup(p) { this.pickups.push(p); return p; }
  remove(obj) {
    const i = this.list.indexOf(obj);
    if (i >= 0) this.list.splice(i, 1);
  }
  byId(id) { return this.list.find((o) => o.id === id); }
  find(pred) { return this.list.filter(pred); }

  update(dt, ctx) {
    let best = null, bestD = Infinity;
    for (const obj of this.list) {
      obj.update?.(dt, ctx);
      if (obj instanceof CrystalNode || obj.type === 'crystal') obj.cooldown = Math.max(0, (obj.cooldown || 0) - dt);
      if (!obj.available) continue;
      const d = obj.position.distanceTo(ctx.player.position);
      if (d < obj.radius + 1.0 && d < bestD) {
        bestD = d; best = obj;
      }
    }
    this.current = best;
    if (best) {
      const usable = best.canUse ? best.canUse(ctx) : true;
      const hint = usable ? best.hint() : best.hint();
      this.events?.emit('prompt:show', { key: ctx.settings?.keyLabel('interact') || 'E', text: hint, usable });
    } else {
      this.events?.emit('prompt:hide', {});
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt, ctx);
      if (p.dead) { p.mesh?.parent?.remove(p.mesh); this.pickups.splice(i, 1); }
    }
  }

  interact(ctx) {
    const obj = this.current;
    if (!obj) return false;
    if (obj.canUse && !obj.canUse(ctx)) {
      ctx.toast?.(obj.hint(), '🔒');
      this.audio?.sfx('hurtSoft');
      return false;
    }
    return obj.interact?.(ctx) ?? false;
  }

  serialize() {
    return this.list.filter((o) => o.done || o.opened || o.pulled || o.open || o.revealed || o.bloomed).map((o) => ({
      id: o.id, done: !!o.done, opened: !!o.opened, pulled: !!o.pulled, open: !!o.open, revealed: !!o.revealed, bloomed: !!o.bloomed,
    }));
  }

  load(state = []) {
    for (const entry of state) {
      const obj = this.byId(entry.id);
      if (!obj) continue;
      obj.done = entry.done; obj.opened = entry.opened; obj.pulled = entry.pulled;
      obj.open = entry.open; obj.revealed = entry.revealed; obj.bloomed = entry.bloomed;
      if (obj.revealed && obj.mesh) obj.mesh.visible = true;
      if (obj.opened && obj.lid) obj.lid.rotation.x = -1.9;
      if (obj.open && obj.mesh?.userData) {
        obj.mesh.position.y = (obj.mesh.userData.baseY || 0) + (obj.mesh.userData.lift || 4.2);
        obj.mesh.userData.openT = 1;
      }
      if (entry.pulled && obj.handle) obj.handle.rotation.x = -0.9;
      if (entry.bloomed && obj.petals) obj.petals.visible = true;
      if (entry.done && obj.type === 'breakable' && obj.mesh) obj.mesh.visible = false;
      if (entry.bloomed || entry.opened || entry.done) obj.done = true;
    }
  }
}
