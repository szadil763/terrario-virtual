// A lanterna mágica: arma principal, ferramenta de exploração, fonte de luz e
// companheira do jogador. Concentra poderes (raio, pulso, escudo, revelação,
// gancho, disparo carregado e purificação), energia, recargas, melhorias,
// afinidades de bioma e as manobras recreativas do R.

import * as THREE from 'three';
import { clamp, damp, rand } from '../core/state.js';

/** Afinidade da lanterna em cada bioma (só a Floresta está liberada nesta versão). */
export const BIOME_POWERS = {
  floresta: {
    name: 'Luz Verde-Primavera', color: '#7cf0a8', locked: false,
    desc: 'Faz plantas crescerem, ativa flores luminosas e cria pontes de raízes.',
  },
  cristal: {
    name: 'Luz Azul-Cristal', color: '#7ec8ff', locked: true,
    desc: 'Ricocheteia em cristais, ativa mecanismos e cria projéteis refletidos.',
  },
  deserto: {
    name: 'Luz Dourada dos Ecos', color: '#ffd479', locked: true,
    desc: 'Revela ruínas soterradas, cria miragens e envia ondas pelo solo.',
  },
  pantano: {
    name: 'Luz Turquesa', color: '#7cf0d8', locked: true,
    desc: 'Purifica a névoa, revela plataformas invisíveis e conversa com fungos.',
  },
  gelo: {
    name: 'Luz do Gelo', color: '#dff2ff', locked: true,
    desc: 'Congela obstáculos, cria superfícies escorregadias e desacelera inimigos.',
  },
  ruinas: {
    name: 'Luz Violeta', color: '#c79bff', locked: true,
    desc: 'Ativa runas, movimenta mecanismos e revela memórias do passado.',
  },
  sombras: {
    name: 'Luz Multicor', color: '#ff9be8', locked: true,
    desc: 'Dissipa ilusões, revela passagens ocultas e enfrenta criaturas poderosas.',
  },
};

/** Árvore de melhorias (cristais). */
export const UPGRADES = [
  { id: 'alcance', name: 'Alcance da luz', icon: '🔭', max: 3, cost: [2, 4, 7], desc: 'A luz alcança mais longe e ilumina melhor.' },
  { id: 'dano', name: 'Energia concentrada', icon: '⚡', max: 3, cost: [3, 5, 8], desc: 'Aumenta o dano dos disparos de luz.' },
  { id: 'eficiencia', name: 'Eficiência mágica', icon: '🔋', max: 3, cost: [2, 4, 6], desc: 'Cada poder gasta menos energia.' },
  { id: 'recarga', name: 'Recarga rápida', icon: '⏱', max: 3, cost: [3, 5, 8], desc: 'Reduz o tempo de recarga dos poderes.' },
  { id: 'escudo', name: 'Escudo duradouro', icon: '🛡', max: 2, cost: [4, 7], desc: 'O escudo de luz resiste por mais tempo.' },
  { id: 'pulso', name: 'Pulso amplo', icon: '◎', max: 3, cost: [3, 5, 8], desc: 'O pulso luminoso alcança mais longe.' },
  { id: 'dash', name: 'Botas de luz', icon: '»', max: 2, cost: [4, 7], desc: 'O dash recarrega mais rápido.' },
  { id: 'vitalidade', name: 'Vitalidade', icon: '❤️', max: 3, cost: [5, 8, 12], desc: 'Aumenta a vida máxima do aventureiro.' },
];

export const TRICK_DEFS = {
  giro: { name: 'Girar nos dedos', icon: '🌀', desc: 'Gira a lanterna sobre os dedos.' },
  malabarismo: { name: 'Malabarismo', icon: '🤹', desc: 'Joga a lanterna para cima e a recupera.' },
  orbita: { name: 'Órbita', icon: '🪐', desc: 'Gira a lanterna ao redor do corpo.' },
  circulos: { name: 'Desenhos de luz', icon: '✍️', desc: 'Cria pequenos círculos e desenhos luminosos.' },
  flutuar: { name: 'Flutuar', icon: '🎈', desc: 'Faz a lanterna flutuar por alguns segundos.' },
  espiral: { name: 'Espiral', icon: '🌪', desc: 'Cria uma espiral de partículas brilhantes.' },
  sequencia: { name: 'Sequência de truques', icon: '✨', desc: 'Combine manobras (R, R, R) para uma festa de luz.' },
};

export class Lantern {
  constructor(scene, { player, settings, events, effects, audio, combat }) {
    this.scene = scene;
    this.player = player;
    this.settings = settings;
    this.events = events;
    this.effects = effects;
    this.audio = audio;
    this.combat = combat;

    this.biome = 'floresta';
    this.color = new THREE.Color(BIOME_POWERS.floresta.color);
    this.modes = ['raio', 'revelacao'];
    this.modeIndex = 0;
    this.upgrades = {};
    this.relics = { lightRange: 0, efficiency: 0, shieldDuration: 0, pulseRadius: 0, dashCooldown: 0, maxHealth: 0, maxEnergy: 0 };
    this.unlockedModes = new Set(['raio']);
    this.unlockedTricks = new Set(['giro', 'orbita']);
    this.cooldowns = { attack: 0, special: 0, defense: 0, toggle: 0 };
    this.skin = 'primaveril';
    this.charge = 0;
    this.charging = false;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.revealTimer = 0;
    this.grapple = null;
    this.trickAnim = null;
    this.trickChain = 0;
    this.trickChainTimer = 0;
    this.beamCooldown = 0;

    this._build();
  }

  // ------------------------------------------------------------- visual
  _build() {
    this.group = new THREE.Group();
    this._base = { position: new THREE.Vector3(), rotation: new THREE.Euler() };

    const metal = new THREE.MeshLambertMaterial({ color: new THREE.Color('#9aa7c4'), flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: new THREE.Color('#5b6a8c'), flatShading: true });

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 6, 14, Math.PI * 1.4), metal);
    handle.position.y = 0.16;
    handle.rotation.y = Math.PI / 2;
    this.group.add(handle);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.28, 10), metal);
    this.group.add(body);

    const top = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.16, 10), dark);
    top.position.y = 0.2;
    this.group.add(top);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 6, 12), dark);
    ring.position.y = 0.08;
    this.group.add(ring);

    this.coreMat = new THREE.MeshBasicMaterial({ color: this.color.clone() });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), this.coreMat);
    this.core.position.y = -0.04;
    this.group.add(this.core);

    this.coreInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.coreInner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), this.coreInnerMat);
    this.coreInner.position.y = -0.04;
    this.group.add(this.coreInner);

    this.glow = this.effects.attachGlow(this.core, this.color.getStyle(), 1.5);

    // luz principal (ilumina o cenário)
    this.light = new THREE.PointLight(this.color.clone(), 2.6, 24, 1.7);
    this.light.position.y = -0.04;
    this.group.add(this.light);

    // lanterna "apontada" (feixe cônico ao mirar)
    this.spot = new THREE.SpotLight(this.color.clone(), 0, 34, 0.55, 0.65, 1.4);
    this.spot.position.set(0, 0, -0.1);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 0, -12);
    this.group.add(this.spot);
    this.group.add(this.spotTarget);
    this.spot.target = this.spotTarget;

    this.player.handSocket.add(this.group);
    this.group.position.set(0, 0.02, -0.05);
    this.group.rotation.set(0.2, 0, 0.1);

    // escudo (aparece ao defender)
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 18, 14),
      new THREE.MeshBasicMaterial({
        color: this.color.clone(), transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.shieldMesh.visible = false;
    this.player.group.add(this.shieldMesh);
    this.shieldMesh.position.y = 1.05;

    this.revealRing = null;
  }

  // ------------------------------------------------------------- estado
  get stats() {
    const lv = (id) => this.upgrades[id] || 0;
    const rel = this.relics;
    const skinColors = { primaveril: '#7cf0a8', oceano: '#63d3ff', aurora: '#ff9be8', cogumelo: '#ffb3d9' };
    return {
      damage: 12 + lv('dano') * 6,
      range: 18 + lv('alcance') * 5 + rel.lightRange,
      lightRange: 24 + lv('alcance') * 4 + rel.lightRange,
      efficiency: 1 - Math.min(0.6, lv('eficiencia') * 0.14 + rel.efficiency),
      cooldownScale: 1 - Math.min(0.55, lv('recarga') * 0.12),
      shieldMax: 3.2 + lv('escudo') * 1.4 + rel.shieldDuration,
      pulseRadius: 4.4 + lv('pulso') * 1.1 + rel.pulseRadius,
      dashCooldown: lv('dash') * 0.15 + rel.dashCooldown,
      color: new THREE.Color(skinColors[this.skin] || BIOME_POWERS[this.biome].color),
      biomeColor: new THREE.Color(BIOME_POWERS[this.biome].color),
    };
  }

  get mode() { return this.modes[this.modeIndex]; }

  get modeLabel() {
    return { raio: 'Raio de luz', revelacao: 'Revelação', gancho: 'Gancho luminoso' }[this.mode] || this.mode;
  }

  setBiome(id) {
    if (!BIOME_POWERS[id]) return;
    this.biome = id;
    if (!BIOME_POWERS[id].locked) this.applyColor(BIOME_POWERS[id].color);
  }

  applyColor(hex) {
    const c = new THREE.Color(hex);
    this.color.copy(c);
    this.coreMat.color.copy(c);
    this.light.color.copy(c);
    this.spot.color.copy(c);
    this.glow.material.color.copy(c);
    this.shieldMesh.material.color.copy(c);
  }

  applySkin(skin) { this.skin = skin; this.applyColor(this.stats.color.getStyle()); }

  unlockMode(mode) {
    if (this.unlockedModes.has(mode)) return false;
    this.unlockedModes.add(mode);
    if (!this.modes.includes(mode)) this.modes.push(mode);
    return true;
  }

  unlockTrick(name) { return this.unlockedTricks.has(name) ? false : (this.unlockedTricks.add(name), true); }

  upgradeLevel(id) { return this.upgrades[id] || 0; }

  nextUpgradeCost(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return null;
    const lv = this.upgradeLevel(id);
    return lv >= def.max ? null : def.cost[lv];
  }

  applyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def) return false;
    const lv = this.upgradeLevel(id);
    if (lv >= def.max) return false;
    this.upgrades[id] = lv + 1;
    if (id === 'vitalidade') {
      this.player.maxHealth += 15;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 15);
    }
    if (id === 'dash') this.player.dashUpgrade = this.upgrades[id];
    this._syncLight();
    return true;
  }

  /** Aplica efeitos de relíquias ao jogador. */
  applyRelic(effect = {}) {
    if (effect.maxHealth) { this.player.maxHealth += effect.maxHealth; this.player.health += effect.maxHealth; }
    if (effect.maxEnergy) { this.player.maxEnergy += effect.maxEnergy; this.player.energy += effect.maxEnergy; }
    if (effect.dashCooldown) this.relics.dashCooldown += effect.dashCooldown;
    if (effect.lightRange) this.relics.lightRange += effect.lightRange;
  }

  _syncLight() {
    const s = this.stats;
    this.light.distance = s.lightRange;
    this.light.intensity = 2.2 + (s.lightRange - 24) * 0.06;
  }

  cooldownReady(action) { return this.cooldowns[action] <= 0; }

  spend(amount) {
    const cost = amount * this.stats.efficiency;
    if (this.player.energy < cost) return false;
    this.player.energy -= cost;
    return true;
  }

  // ------------------------------------------------------------- update
  update(dt, ctx) {
    const { input, aiming, world, enemies, inCombat } = ctx;
    const s = this.stats;
    this._syncLight();
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    this.beamCooldown = Math.max(0, this.beamCooldown - dt);
    this.trickChainTimer = Math.max(0, this.trickChainTimer - dt);
    if (this.trickChainTimer === 0) this.trickChain = 0;

    const canAct = !this.player.fsm.is('dash') && !this.player.fsm.is('trick') && !this.player.fsm.is('hurt') && this.player.isAlive;

    // ---- mira e feixe cônico
    const aimK = aiming ? 1 : 0;
    this.spot.intensity = damp(this.spot.intensity, aimK * 4.2, 8, dt);
    this._syncAim();

    // ---- escudo (M2) enquanto houver energia
    const wantShield = aiming && input.isDown('defense') && this.unlockedModes.has('escudo') && this.player.energy > 2;
    if (wantShield) {
      if (!this.shieldActive) { this.shieldTimer = s.shieldMax; this.audio?.sfx('shield'); }
      this.shieldActive = true;
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0 || !this.spend(14 * dt)) this.shieldActive = false;
    } else {
      this.shieldActive = false;
    }
    this.player.setShieldActive(this.shieldActive);
    this.shieldMesh.visible = this.shieldActive;
    if (this.shieldActive) {
      this.shieldMesh.material.opacity = 0.16 + Math.sin(performance.now() / 160) * 0.06;
      this.shieldMesh.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.03);
      this.effects.trail(this.player.chestPosition, s.color.getStyle(), 0.2);
    }

    // ---- ataque / poderes (M1 e M3)
    if (canAct && input.isDown('attack')) {
      if (this.mode === 'raio') {
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt / 1.1);
        if (this.charge < 0.999) this.effects.trail(this.core.getWorldPosition(new THREE.Vector3()), s.color.getStyle(), 0.16 + this.charge * 0.2);
      } else if (this.mode === 'revelacao' && this.beamCooldown <= 0 && this.cooldownReady('attack')) {
        this.castReveal(world, enemies);
      } else if (this.mode === 'gancho' && this.beamCooldown <= 0 && this.cooldownReady('attack')) {
        this.castGrapple(world);
      }
    }
    if (this.charging && !input.isDown('attack')) {
      this.charging = false;
      if (this.charge > 0.85) this.castCharged(enemies);
      else if (this.cooldownReady('attack')) this.castBeam(enemies);
      this.charge = 0;
    }
    if (this.charging && !canAct) { this.charging = false; this.charge = 0; }

    if (canAct && input.justPressed('special')) this.castPulse(enemies, world);
    if (canAct && input.justPressed('toggle')) this.cycleMode();
    if (canAct && input.justPressed('trick')) this.startTrick(null, world);

    // ---- recarga visual do núcleo
    const cd = this.cooldowns.attack / (0.42 * s.cooldownScale);
    const glowScale = 1.35 + Math.sin(performance.now() / 320) * 0.12 + this.charge * 0.6 - clamp(cd, 0, 1) * 0.2;
    this.glow.scale.setScalar(Math.max(0.6, glowScale));
    this.core.rotation.y += dt * (1.4 + this.charge * 6);
    this.coreInner.rotation.x -= dt * 2.2;
    if (!this.shieldActive && !this.charging) {
      this.coreMat.color.copy(s.color);
    }

    // ---- revelação ativa por alguns segundos
    if (this.revealTimer > 0) {
      this.revealTimer -= dt;
      world?.revealNear?.(this.player.position, 14, true);
      if (Math.random() < 0.4) this.effects.trail(new THREE.Vector3(this.player.position.x + rand(-2, 2), this.player.position.y + rand(0.3, 2.4), this.player.position.z + rand(-2, 2)), s.color.getStyle(), 0.2);
    }

    // ---- gancho luminoso
    if (this.grapple) this._updateGrapple(dt);

    // ---- manobras
    if (this.trickAnim) this._updateTrick(dt);
    else this._restoreTransform(dt);
  }

  _syncAim() {
    // o alvo do feixe cônico acompanha a direção da câmera
    const yaw = this.player.facing;
    this.spotTarget.position.set(-Math.sin(yaw) * 12, 0, -Math.cos(yaw) * 12);
  }

  // ------------------------------------------------------------- poderes
  castBeam(enemies) {
    const s = this.stats;
    if (!this.spend(4)) { this.audio?.sfx('hurtSoft'); return false; }
    this.cooldowns.attack = 0.42 * s.cooldownScale;
    this.beamCooldown = 0.1;
    const origin = this.core.getWorldPosition(new THREE.Vector3());
    const dir = this._aimDirection();
    this.combat.spawn({
      position: origin.clone().addScaledVector(dir, 0.45), direction: dir,
      speed: 30, damage: s.damage, owner: 'player', color: s.color.getStyle(), size: 0.34, life: 1.5,
    });
    this.audio?.sfx('beam');
    this.effects.burst(origin, { color: '#ffffff', count: 6, speed: 2.5, size: 0.2, life: 0.25, gravity: 0 });
    this.events?.emit('lantern:cast', { power: 'raio' });
    return true;
  }

  castCharged(enemies) {
    const s = this.stats;
    if (!this.spend(20)) { this.audio?.sfx('hurtSoft'); return false; }
    this.cooldowns.attack = 1.1 * s.cooldownScale;
    const origin = this.core.getWorldPosition(new THREE.Vector3());
    const dir = this._aimDirection();
    this.combat.spawn({
      position: origin.clone().addScaledVector(dir, 0.5), direction: dir,
      speed: 24, damage: s.damage * 3.1, owner: 'player', color: '#ffffff', size: 0.8, life: 2.2,
      pierce: 2, knockback: 9, charged: true,
    });
    this.audio?.sfx('chargedShot');
    this.effects.ring(origin, { color: s.color.getStyle(), from: 0.3, to: 3.4, life: 0.45 });
    this.effects.burst(origin, { color: s.color.getStyle(), count: 26, speed: 6, size: 0.4, life: 0.7 });
    this.events?.emit('lantern:cast', { power: 'carregado' });
    return true;
  }

  castPulse(enemies, world) {
    const s = this.stats;
    if (!this.cooldownReady('special')) return false;
    if (!this.spend(25)) { this.audio?.sfx('hurtSoft'); return false; }
    this.cooldowns.special = 4 * s.cooldownScale;
    const center = new THREE.Vector3(this.player.position.x, this.player.position.y + 0.5, this.player.position.z);
    this.effects.ring(center, { color: s.color.getStyle(), from: 0.6, to: s.pulseRadius * 2, life: 0.7, opacity: 1 });
    this.effects.burst(center, { color: s.color.getStyle(), count: 34, speed: 7, size: 0.36, life: 0.8, gravity: 0 });
    this.effects.flash(center, s.color.getStyle(), 5, s.pulseRadius * 3);
    this.audio?.sfx('pulse');
    if (this.player.fsm.is('idle') || this.player.fsm.is('run')) {
      this.player.fsm.set('trick');
      this.player.trickTimer = 0.35;
      this.player.trickName = 'pulso';
    }
    for (const e of enemies || []) {
      const d = e.position.distanceTo(center);
      if (d < s.pulseRadius + (e.radius || 0.6)) {
        if (e.corrupted && e.purifyable) e.purify();
        else e.takeDamage(s.damage * 1.3, { position: center, knockback: 12, source: 'player' });
      }
    }
    world?.reactToPower?.(this.biome, this.player.position, s.pulseRadius);
    this.events?.emit('lantern:cast', { power: 'pulso' });
    this.events?.emit('lantern:pulse', { radius: s.pulseRadius });
    return true;
  }

  castReveal(world, enemies) {
    if (!this.unlockedModes.has('revelacao')) { this.audio?.sfx('hurtSoft'); return false; }
    if (!this.spend(16)) { this.audio?.sfx('hurtSoft'); return false; }
    this.cooldowns.attack = 0.9 * this.stats.cooldownScale;
    this.beamCooldown = 0.25;
    this.revealTimer = Math.max(this.revealTimer, 2.6);
    const center = new THREE.Vector3(this.player.position.x, this.player.position.y + 0.6, this.player.position.z);
    this.effects.ring(center, { color: '#e8dcff', from: 0.5, to: 15, life: 0.9, opacity: 0.9 });
    this.audio?.sfx('secret');
    world?.revealNear?.(this.player.position, 15, true);
    for (const e of enemies || []) {
      const d = e.position.distanceTo(center);
      if (d < 9 && e.corrupted && e.purifyable) e.purify();
    }
    this.events?.emit('lantern:cast', { power: 'revelacao' });
    return true;
  }

  castGrapple(world) {
    if (!this.unlockedModes.has('gancho')) { this.audio?.sfx('hurtSoft'); return false; }
    const dir = this._aimDirection();
    const origin = this.core.getWorldPosition(new THREE.Vector3());
    const points = world?.grapplePoints || [];
    let best = null, bestScore = -Infinity;
    for (const p of points) {
      const to = new THREE.Vector3().subVectors(p.position, origin);
      const distance = to.length();
      if (distance > 24) continue;
      const dot = to.clone().normalize().dot(dir);
      const score = dot * 2 - distance / 24;
      if (dot > 0.45 && score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) { this.audio?.sfx('hurtSoft'); return false; }
    if (!this.spend(8)) return false;
    this.grapple = { target: best, t: 0 };
    this.effects.beam(origin, best.position, this.stats.color.getStyle(), 0.4);
    this.audio?.sfx('grapple');
    this.events?.emit('lantern:cast', { power: 'gancho' });
    return true;
  }

  _updateGrapple(dt) {
    const g = this.grapple;
    g.t += dt;
    const target = g.target.position;
    const player = this.player;
    const dir = new THREE.Vector3().subVectors(target, player.position);
    const distance = dir.length();
    if (distance < 1.6 || g.t > 2.6) {
      this.effects.burst(player.chestPosition, { color: '#bff6ff', count: 14, speed: 4, size: 0.3, life: 0.5 });
      this.grapple = null;
      return;
    }
    dir.normalize();
    const speed = 17;
    player.velocity.set(dir.x * speed, Math.max(0, dir.y) * speed + 1.2, dir.z * speed);
    player.grounded = false;
    this.effects.trail(player.chestPosition, '#bff6ff', 0.3);
    this.effects.beam(this.core.getWorldPosition(new THREE.Vector3()), target, this.stats.color.getStyle(), 0.05);
  }

  cycleMode() {
    const available = this.modes.filter((m) => this.unlockedModes.has(m));
    if (available.length <= 1) {
      this.events?.emit('ui:toast', { text: 'Novo poder será desbloqueado explorando o bosque.', icon: '🔒' });
      return;
    }
    this.modeIndex = (available.indexOf(this.mode) + 1) % available.length;
    this.audio?.sfx('ui');
    this.events?.emit('lantern:mode', { mode: this.mode });
    this.effects.ring(new THREE.Vector3(this.player.position.x, this.player.position.y + 0.6, this.player.position.z), { color: this.stats.color.getStyle(), from: 0.4, to: 2.6, life: 0.4 });
  }

  _aimDirection() {
    const dir = new THREE.Vector3(-Math.sin(this.player.facing), 0, -Math.cos(this.player.facing));
    if (this.player.aiming) dir.y = 0.06;
    return dir.normalize();
  }

  // ------------------------------------------------------------- manobras
  startTrick(name, world) {
    if (this.player.fsm.is('dash') || this.player.fsm.is('hurt')) return false;
    const list = [...this.unlockedTricks];
    if (list.length === 0) return false;
    if (!name) {
      this.trickChainTimer = 1.1;
      this.trickChain = Math.min(3, this.trickChain + 1);
      if (this.trickChain >= 3) name = 'sequencia';
      else name = list[Math.floor(Math.random() * list.length)];
    }
    if (name !== 'sequencia' && !this.unlockedTricks.has(name)) name = 'giro';
    const durations = { giro: 1.5, malabarismo: 1.9, orbita: 1.9, circulos: 2.1, flutuar: 2.6, espiral: 2.0, sequencia: 3.2 };
    const duration = durations[name] || 1.6;
    if (!this.player.startTrick(name, duration)) return false;
    this.trickAnim = { name, t: 0, duration };
    this.audio?.sfx('trick');
    this.events?.emit('lantern:trick', { name, position: this.player.position.clone() });
    this.events?.emit('ui:toast', { text: `Manobra: ${TRICK_DEFS[name]?.name || name}`, icon: TRICK_DEFS[name]?.icon || '✨' });
    return true;
  }

  _updateTrick(dt) {
    const a = this.trickAnim;
    a.t += dt;
    const p = a.t / a.duration;
    const t = performance.now() / 1000;
    const color = this.stats.color.getStyle();
    const g = this.group;
    const ease = p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1;
    switch (a.name) {
      case 'giro':
        g.rotation.set(0.2, 0, 0.1 + t * 9);
        g.position.set(0, 0.06 + Math.sin(t * 6) * 0.03, -0.05);
        break;
      case 'malabarismo': {
        const up = Math.sin(Math.min(1, p * 2) * Math.PI) * 1.15;
        g.position.set(0, 0.05 + up, -0.05);
        g.rotation.set(t * 7, t * 5, 0);
        break;
      }
      case 'orbita': {
        const ang = p * Math.PI * 4;
        const r = 0.85;
        g.position.set(Math.cos(ang) * r, 0.85 + Math.sin(ang * 2) * 0.25, Math.sin(ang) * r);
        g.rotation.set(t * 4, ang, 0);
        break;
      }
      case 'circulos': {
        const ang = p * Math.PI * 6;
        g.position.set(Math.cos(ang) * 0.45, 0.9 + Math.sin(ang) * 0.4, Math.sin(ang) * 0.45 - 0.2);
        g.rotation.set(0, ang, 0);
        this.effects.trail(this.core.getWorldPosition(new THREE.Vector3()), color, 0.26);
        break;
      }
      case 'flutuar': {
        const rise = Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5) * 1.05;
        g.position.set(Math.sin(t * 2) * 0.3, 0.4 + rise + Math.sin(t * 3) * 0.08, -0.25 + Math.cos(t * 2.1) * 0.3);
        g.rotation.set(Math.sin(t) * 0.4, t * 2, Math.cos(t * 1.4) * 0.3);
        glowPulse(this.effects, g, color);
        break;
      }
      case 'espiral':
        g.rotation.set(0.2, t * 12, 0.1);
        if (Math.random() < 0.12) this.effects.spiral(this.player.position, color, 0.6);
        break;
      case 'sequencia': {
        const ang = p * Math.PI * 8;
        g.position.set(Math.cos(ang) * (0.6 + ease * 1.1), 1.1 + Math.sin(p * Math.PI) * 1.3, Math.sin(ang) * (0.6 + ease * 1.1));
        g.rotation.set(t * 6, ang * 2, t * 4);
        this.effects.trail(this.core.getWorldPosition(new THREE.Vector3()), '#ffffff', 0.3);
        if (Math.random() < 0.35) this.effects.spiral(this.player.position, color, 0.5);
        if (p > 0.5 && p < 0.55) this.effects.ring(new THREE.Vector3(this.player.position.x, this.player.position.y + 1, this.player.position.z), { color, from: 0.5, to: 5, life: 0.6 });
        break;
      }
      default: break;
    }
    if (p >= 1) {
      this.trickAnim = null;
      this.effects.burst(this.core.getWorldPosition(new THREE.Vector3()), { color, count: 16, speed: 3, size: 0.3, life: 0.6, gravity: 1 });
      if (!this.player.fsm.is('fall')) this.player.fsm.set('idle');
    }
  }

  _restoreTransform(dt) {
    const g = this.group;
    const k = 1 - Math.exp(-9 * dt);
    g.position.lerp(new THREE.Vector3(0, 0.02, -0.05), k);
    g.rotation.x += (0.2 - g.rotation.x) * k;
    g.rotation.y += (0 - g.rotation.y) * k;
    g.rotation.z += (0.1 - g.rotation.z) * k;
  }

  /** Estado das habilidades para a interface. */
  abilityState(settings) {
    const s = this.stats;
    const cdRatio = (v, total) => clamp(v / Math.max(0.001, total), 0, 1);
    return [
      { id: 'attack', icon: this.mode === 'raio' ? '✦' : '👁', label: this.modeLabel, key: settings.shortLabel('attack'), cooldown: cdRatio(this.cooldowns.attack, 1.1 * s.cooldownScale), locked: false, active: this.charging },
      { id: 'defense', icon: '🛡', label: 'Escudo', key: settings.shortLabel('defense'), cooldown: 0, locked: !this.unlockedModes.has('escudo'), active: this.shieldActive },
      { id: 'special', icon: '◎', label: 'Pulso', key: settings.shortLabel('special'), cooldown: cdRatio(this.cooldowns.special, 4 * s.cooldownScale), locked: false, active: false },
      { id: 'toggle', icon: '🔆', label: 'Poder', key: settings.shortLabel('toggle'), cooldown: 0, locked: this.modes.filter((m) => this.unlockedModes.has(m)).length < 2, active: false },
      { id: 'dash', icon: '»', label: 'Dash', key: settings.keyLabel('dash'), cooldown: cdRatio(this.player.dashCooldown, 1.15 - this.player.dashUpgrade * 0.22), locked: false, active: this.player.fsm.is('dash') },
      { id: 'trick', icon: '🎩', label: 'Manobra', key: settings.keyLabel('trick'), cooldown: 0, locked: this.unlockedTricks.size === 0, active: !!this.trickAnim },
    ];
  }

  serialize() {
    return {
      upgrades: { ...this.upgrades }, unlockedModes: [...this.unlockedModes], unlockedTricks: [...this.unlockedTricks],
      skin: this.skin, mode: this.mode,
    };
  }

  load(data = {}) {
    this.upgrades = data.upgrades || {};
    this.unlockedModes = new Set(['raio', ...(data.unlockedModes || [])]);
    this.unlockedTricks = new Set(data.unlockedTricks?.length ? data.unlockedTricks : ['giro', 'orbita']);
    if (!this.modes.includes('revelacao') && this.unlockedModes.has('revelacao')) this.modes.push('revelacao');
    if (!this.modes.includes('gancho') && this.unlockedModes.has('gancho')) this.modes.push('gancho');
    if (data.skin) this.applySkin(data.skin);
    if (data.mode && this.modes.includes(data.mode)) this.modeIndex = this.modes.indexOf(data.mode);
    this.player.dashUpgrade = this.upgrades.dash || 0;
    this._syncLight();
  }
}

function glowPulse(effects, group, color) {
  if (Math.random() < 0.3) effects.trail(group.getWorldPosition(new THREE.Vector3()), color, 0.3);
}
