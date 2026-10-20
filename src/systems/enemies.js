// Inimigos com comportamentos distintos, fraquezas ligadas ao bioma e
// derrotas sempre tranquilas (partículas, fuga, sono ou purificação).

import * as THREE from 'three';
import { clamp, damp, rand } from '../core/state.js';

export const ENEMY_TYPES = {
  sombra: {
    id: 'sombra', name: 'Sombra Travessa', hp: 26, radius: 0.55, speed: 4.4,
    color: '#3b3560', eye: '#bff6ff', damage: 6, contact: true, corrupted: true, purifyable: true,
    weakness: 'pulso', drops: [['moeda', 2, 6]], height: 0.85, floats: true,
    desc: 'Foge da luz e adora pregar peças. Quando iluminada, fica em paz.',
  },
  cogumelo: {
    id: 'cogumelo', name: 'Cogumelo Saltitante', hp: 34, radius: 0.6, speed: 3.0,
    color: '#c25a86', eye: '#fff6d8', damage: 9, contact: true, corrupted: false, purifyable: false,
    weakness: 'pulso', drops: [['moeda', 3, 8], ['cristal', 0, 1]], height: 0.7, hops: true,
    desc: 'Ataca em grupos, pulando em direção ao aventureiro.',
  },
  espirito: {
    id: 'espirito', name: 'Espírito Brincalhão', hp: 44, radius: 0.6, speed: 3.6,
    color: '#7fe3d8', eye: '#ffffff', damage: 7, contact: false, corrupted: true, purifyable: true,
    weakness: 'revelacao', drops: [['fragmento', 1, 1], ['moeda', 4, 9]], height: 1.1, ranged: true,
    desc: 'Esconde objetos e cria ilusões. Com purificação, vira um amigo que entrega pistas.',
  },
};

export class Enemy {
  constructor(typeId, position, { effects, audio, events, settings }) {
    this.def = ENEMY_TYPES[typeId];
    this.type = typeId;
    this.effects = effects;
    this.audio = audio;
    this.events = events;
    this.settings = settings;
    this.radius = this.def.radius;
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.facing = rand(0, Math.PI * 2);
    this.attackCooldown = 0;
    this.contactCooldown = 0;
    this.hurtFlash = 0;
    this.defeated = false;
    this.purified = false;
    this.corrupted = !!this.def.corrupted;
    this.purifyable = !!this.def.purifyable;
    this.state = 'idle';
    this.stateTimer = 0;
    this.hopTimer = rand(0.4, 1.4);
    this.grounded = true;
    this.group = new THREE.Group();
    this.materials = [];
    this._build();
    this.group.position.copy(this.position);
  }

  get alive() { return !this.defeated; }
  get hitPosition() { return new THREE.Vector3(this.position.x, this.position.y + this.def.height * 0.8, this.position.z); }

  _mat(color) {
    const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true });
    this.materials.push(m);
    return m;
  }

  _build() {
    const d = this.def;
    if (this.type === 'sombra') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), this._mat(d.color));
      body.position.y = 0.6;
      body.scale.set(1, 1.15, 0.9);
      this.group.add(body);
      this.body = body;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 8), this._mat(d.color));
      tail.position.y = 0.2;
      tail.rotation.x = Math.PI;
      this.group.add(tail);
      this.eyeMats = [];
      for (const sx of [-1, 1]) {
        const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.eye) });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat);
        eye.position.set(sx * 0.15, 0.72, -0.36);
        this.group.add(eye);
        this.eyeMats.push(eyeMat);
      }
      this.effects?.attachGlow(this.group, '#4a4370', 1.6);
    } else if (this.type === 'cogumelo') {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 8), this._mat('#f3e2c7'));
      stalk.position.y = 0.28;
      this.group.add(stalk);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this._mat(d.color));
      cap.position.y = 0.5;
      cap.scale.y = 0.85;
      this.group.add(cap);
      this.body = cap;
      for (let i = 0; i < 5; i++) {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), this._mat('#ffe9f3'));
        const a = (i / 5) * Math.PI * 2;
        spot.position.set(Math.cos(a) * 0.3, 0.72, Math.sin(a) * 0.3);
        this.group.add(spot);
      }
      this.eyeMats = [];
      for (const sx of [-1, 1]) {
        const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.eye) });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat);
        eye.position.set(sx * 0.14, 0.36, -0.22);
        this.group.add(eye);
        this.eyeMats.push(eyeMat);
      }
      this.effects?.attachGlow(cap, '#ff9ec8', 1.1);
    } else {
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(d.color), flatShading: true, transparent: true, opacity: 0.72 });
      this.materials.push(mat);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), mat);
      body.position.y = 1.05;
      body.scale.set(1, 1.1, 0.9);
      this.group.add(body);
      this.body = body;
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8fff8') });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), glowMat);
      core.position.y = 1.05;
      this.group.add(core);
      this.effects?.attachGlow(core, d.color, 2.2);
      this.eyeMats = [];
      for (const sx of [-1, 1]) {
        const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#20343a') });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat);
        eye.position.set(sx * 0.16, 1.15, -0.38);
        this.group.add(eye);
        this.eyeMats.push(eyeMat);
      }
    }

    // barra de vida flutuante (aparece ao levar dano)
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), new THREE.MeshBasicMaterial({ color: 0x14192b, transparent: true, opacity: 0.7, depthWrite: false }));
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9f9f'), depthWrite: false }));
    barBg.position.y = this.def.height + 0.75;
    bar.position.y = this.def.height + 0.75;
    bar.scale.x = 1;
    bar.renderOrder = 2;
    this.hpBar = bar;
    this.hpBarBg = barBg;
    this.group.add(barBg);
    this.group.add(bar);
    bar.visible = barBg.visible = false;
    this.hpVisible = 0;
  }

  takeDamage(amount, opts = {}) {
    if (this.defeated || this.purified) return false;
    if (opts.purify && this.purifyable) return this.purify(opts);
    let dmg = amount;
    if (this.def.weakness === 'pulso' && opts.source === 'pulso') dmg *= 1.6;
    this.hp -= dmg;
    this.hurtFlash = 0.28;
    this.hpVisible = 3.2;
    if (opts.knockback && !this.def.hops) {
      const dir = new THREE.Vector3().subVectors(this.position, opts.position || this.position).setY(0).normalize();
      this.velocity.addScaledVector(dir, opts.knockback);
    }
    if (this.hp <= 0) this._defeat(opts);
    return true;
  }

  /** Purificação: transforma a criatura corrompida em um ser pacífico. */
  purify(opts = {}) {
    if (this.purified || this.defeated) return false;
    this.purified = true;
    this.corrupted = false;
    this.defeated = true;
    this.events?.emit('enemy:purified', { type: this.type, position: this.position.clone() });
    this.effects?.burst(this.hitPosition, { color: '#e8fff4', count: 34, speed: 5, size: 0.34, life: 1.1, gravity: 1 });
    this.effects?.ring(this.position, { color: '#bff6ff', from: 0.4, to: 4, life: 0.7 });
    this.audio?.sfx('purify');
    this._dissolve(true);
    return true;
  }

  _defeat() {
    this.defeated = true;
    this.events?.emit('enemy:defeated', { type: this.type, position: this.position.clone(), drops: this.def.drops });
    this.effects?.burst(this.hitPosition, { color: '#dff2ff', count: 22, speed: 4.5, size: 0.3, life: 0.9, gravity: -1 });
    this.effects?.ring(this.position, { color: '#bff6ff', from: 0.3, to: 2.6, life: 0.5 });
    this.audio?.sfx('hit');
    this._dissolve(false);
  }

  _dissolve(peaceful) {
    this.dissolveT = 0.55;
    this.peaceful = peaceful;
  }

  update(dt, ctx) {
    if (this.defeated) {
      if (this.dissolveT > 0) {
        this.dissolveT -= dt;
        const k = clamp(this.dissolveT / 0.55, 0, 1);
        this.group.scale.setScalar(k);
        this.group.rotation.y += dt * 6;
        this.group.position.y = this.position.y + (1 - k) * (this.peaceful ? 1.4 : 0.4);
        for (const m of this.materials) { m.transparent = true; m.opacity = k; }
      } else {
        this.group.visible = false;
      }
      return;
    }

    const player = ctx.player;
    const d = this.def;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.hpVisible = Math.max(0, this.hpVisible - dt);
    const hurtK = this.hurtFlash > 0 ? this.hurtFlash / 0.28 : 0;
    for (const m of this.materials) if (m.emissive) m.emissive.setRGB(hurtK * 0.7, hurtK * 0.7, hurtK * 0.7);

    this.hpBar.visible = this.hpBarBg.visible = this.hpVisible > 0;
    this.hpBar.scale.x = clamp(this.hp / this.maxHp, 0.001, 1);
    this.hpBar.position.x = -0.53 * (1 - this.hpBar.scale.x);
    if (this.hpBar.visible) {
      this.hpBar.quaternion.copy(ctx.camera.quaternion);
      this.hpBarBg.quaternion.copy(ctx.camera.quaternion);
    }

    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const dir = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, -1);
    const calm = ctx.settings.get('calm');
    const aggroRange = calm ? 9 : 15;

    // Áreas seguras (acampamento e pontos de descanso): as criaturas não atacam
    // e voltam devagar para casa — descansar aqui é sempre tranquilo.
    const inSafeArea = ctx.world?.isSafe?.(player.position) || ctx.world?.isSafe?.(this.position);
    if (inSafeArea) {
      this.state = 'idle';
      const home = this.homePosition;
      if (home) {
        const back = new THREE.Vector3().subVectors(home, this.position).setY(0);
        if (back.length() > 1.5) {
          back.normalize();
          this.velocity.x += back.x * 2.6 * dt * 3;
          this.velocity.z += back.z * 2.6 * dt * 3;
        }
      }
    } else if (this.type === 'sombra') this._updateShadow(dt, ctx, dir, distance, aggroRange);
    else if (this.type === 'cogumelo') this._updateMushroom(dt, ctx, dir, distance, aggroRange);
    else this._updateSpirit(dt, ctx, dir, distance, aggroRange);

    // física simples
    if (this.def.floats) {
      this.position.addScaledVector(this.velocity, dt);
      this.position.y = ctx.world ? ctx.world.groundHeightAt(this.position.x, this.position.z, 5, 5) + this.def.height : 0;
    } else {
      this.velocity.y -= 22 * dt;
      this.position.addScaledVector(this.velocity, dt);
      if (ctx.world) {
        ctx.world.resolveCollision(this.position, this.radius * 0.9, this.velocity);
        const ground = ctx.world.groundHeightAt(this.position.x, this.position.z, this.position.y, 0.6);
        if (this.position.y <= ground) {
          this.position.y = ground;
          if (this.velocity.y < 0) this.velocity.y = 0;
          this.grounded = true;
        } else this.grounded = false;
      }
    }
    this.velocity.x = damp(this.velocity.x, 0, 3.5, dt);
    this.velocity.z = damp(this.velocity.z, 0, 3.5, dt);

    this.group.position.copy(this.position);
    this.facing = damp(this.facing, Math.atan2(-dir.x, -dir.z), 6, dt);
    this.group.rotation.y = this.facing;

    const t = performance.now() / 1000;
    if (this.body) this.body.position.y = (this.type === 'sombra' ? 0.6 : this.type === 'cogumelo' ? 0.5 : 1.05) + Math.sin(t * 3 + this.position.x) * 0.06;
    if (this.eyeMats && this.hurtFlash > 0) for (const m of this.eyeMats) m.color.setRGB(1, 1, 1);
  }

  _updateShadow(dt, ctx, dir, distance, aggroRange) {
    const lantern = ctx.lantern;
    const lightPos = lantern?.light?.getWorldPosition(new THREE.Vector3());
    const lightRange = lantern?.stats.lightRange || 22;
    const flicker = Math.abs(Math.sin(performance.now() / 120 + this.position.x)) * 0.25;
    const lit = lightPos && lightPos.distanceTo(this.position) < lightRange * (0.55 + flicker);
    const facingPlayer = ctx.player.moveDir.lengthSq() >= 0;

    if (lit && distance < 9) {
      // foge da luz
      this.state = 'flee';
      this.velocity.x -= dir.x * this.def.speed * dt * 6;
      this.velocity.z -= dir.z * this.def.speed * dt * 6;
      this.effects?.trail(this.hitPosition, '#7e77b8', 0.2);
    } else if (distance < aggroRange) {
      this.state = 'stalk';
      const speed = (ctx.settings.get('calm') ? 2.0 : this.def.speed) * (facingPlayer ? 0.7 : 1);
      this.velocity.x += dir.x * speed * dt * 4;
      this.velocity.z += dir.z * speed * dt * 4;
    }
    this.velocity.clampLength(0, this.def.speed + 2);
    if (distance < 1.25 && this.contactCooldown <= 0) {
      this.contactCooldown = 1.4;
      ctx.player.takeDamage(this.def.damage, { from: this.position.clone(), difficulty: this._diff(ctx) });
    }
  }

  _updateMushroom(dt, ctx, dir, distance, aggroRange) {
    if (distance > aggroRange && this.state !== 'chase') { this.state = 'idle'; return; }
    this.state = 'chase';
    this.hopTimer -= dt;
    if (this.grounded && this.hopTimer <= 0) {
      this.hopTimer = ctx.settings.get('calm') ? rand(1.3, 2.0) : rand(0.85, 1.3);
      const power = ctx.settings.get('calm') ? 4.6 : 6.2;
      this.velocity.x += dir.x * power;
      this.velocity.z += dir.z * power;
      this.velocity.y = 6.4;
      this.effects?.ring(this.position, { color: '#ff9ec8', from: 0.2, to: 1.6, life: 0.35 });
    }
    this.velocity.clampLength(0, 9);
    if (distance < 1.3 && this.contactCooldown <= 0) {
      this.contactCooldown = 1.2;
      ctx.player.takeDamage(this.def.damage, { from: this.position.clone(), difficulty: this._diff(ctx) });
    }
  }

  _updateSpirit(dt, ctx, dir, distance, aggroRange) {
    if (distance > aggroRange) { this.state = 'idle'; return; }
    this.state = 'orbit';
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const want = distance < 5.5 ? -0.6 : 0.9;
    this.velocity.x += (dir.x * want + side.x * 1.3) * this.def.speed * dt * 3;
    this.velocity.z += (dir.z * want + side.z * 1.3) * this.def.speed * dt * 3;
    this.velocity.clampLength(0, this.def.speed + 1);
    if (this.attackCooldown <= 0 && distance < 13) {
      this.attackCooldown = ctx.settings.get('calm') ? 4.6 : 3.2;
      const origin = this.hitPosition;
      const aim = new THREE.Vector3().subVectors(ctx.player.chestPosition, origin).normalize();
      const count = ctx.settings.get('calm') ? 1 : 2;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (this.defeated) return;
          ctx.combat?.spawn({
            position: origin.clone(), direction: aim.clone().add(new THREE.Vector3(rand(-0.12, 0.12), 0, rand(-0.12, 0.12))),
            speed: 13, damage: this.def.damage, owner: 'enemy', color: '#a8ffe8', size: 0.3, life: 2.4, element: 'ilusao',
          });
        }, i * 180);
      }
      this.audio?.sfx('beam');
      this.effects?.burst(origin, { color: '#a8ffe8', count: 12, speed: 3, size: 0.26, life: 0.5, gravity: 0 });
    }
  }

  _diff(ctx) {
    return ctx.settings.get('calm') ? 0.5 : ctx.settings.get('difficulty');
  }
}

export class EnemyManager {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;
    this.enemies = [];
    this.spawnPoints = [];
    this.respawnTimers = [];
  }

  addSpawn(type, position, opts = {}) {
    this.spawnPoints.push({ type, position: position.clone(), opts });
    return this.spawn(type, position, opts);
  }

  spawn(type, position, opts = {}) {
    const enemy = new Enemy(type, position, this.deps);
    enemy.homePosition = position.clone();
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    return enemy;
  }

  get list() { return this.enemies.filter((e) => !e.defeated); }

  get engaged() {
    return this.enemies.some((e) => !e.defeated && e.state !== 'idle' && !(e.type === 'sombra' && e.state === 'flee'));
  }

  update(dt, ctx) {
    for (const e of this.enemies) e.update(dt, ctx);
    // remove corpos já dissolvidos
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.defeated && e.dissolveT <= 0 && !e.group.visible) {
        this.scene.remove(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
  }
}
