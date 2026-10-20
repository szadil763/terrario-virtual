// Sistema de combate: projéteis de luz, magias inimigas, reflexo em cristais,
// aplicação de dano com invulnerabilidade e resposta visual/sonora.
// A violência é sempre "cartunesca": criaturas se desfazem em partículas,
// fogem ou adormecem.

import * as THREE from 'three';
import { clamp, rand } from '../core/state.js';

export class Combat {
  constructor(scene, { effects, audio, settings, events }) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.settings = settings;
    this.events = events;
    this.projectiles = [];
    this.hitStop = 0;
    this._geo = new THREE.SphereGeometry(0.17, 10, 8);
  }

  /** Dispara um projétil luminoso. */
  spawn({
    position, direction, speed = 26, damage = 12, owner = 'player', color = '#bff6ff',
    size = 0.34, life = 1.6, pierce = 0, reflectable = true, knockback = 4, charged = false,
    onHit = null, purify = false, homing = 0,
  }) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(this._geo, mat);
    mesh.scale.setScalar(size);
    mesh.position.copy(position);
    this.scene.add(mesh);
    const glow = this.effects.attachGlow(mesh, color, size * 5);
    glow.material.opacity = 0.7;
    const p = {
      position: mesh.position, velocity: direction.clone().normalize().multiplyScalar(speed),
      damage, owner, mesh, mat, life, maxLife: life, pierce, reflectable, knockback,
      charged, onHit, purify, homing, radius: size * 0.85, trailTimer: 0,
    };
    this.projectiles.push(p);
    return p;
  }

  remove(p) {
    p.mesh.parent?.remove(p.mesh);
    p.mat.dispose();
    const idx = this.projectiles.indexOf(p);
    if (idx >= 0) this.projectiles.splice(idx, 1);
  }

  clearOwner(owner) {
    for (const p of [...this.projectiles]) if (p.owner === owner) this.remove(p);
  }

  clear() {
    for (const p of [...this.projectiles]) this.remove(p);
  }

  /**
   * @param {Object} ctx { player, enemies, miniboss, world, crystals }
   */
  update(dt, ctx) {
    this.hitStop = Math.max(0, this.hitStop - dt);
    for (const p of [...this.projectiles]) {
      p.life -= dt;
      if (p.life <= 0) { this.remove(p); continue; }

      if (p.homing && p.owner === 'enemy' && ctx.player?.isAlive) {
        const to = new THREE.Vector3().subVectors(ctx.player.chestPosition, p.position).normalize();
        p.velocity.lerp(to.multiplyScalar(p.velocity.length()), clamp(p.homing * dt, 0, 1));
      }
      p.position.addScaledVector(p.velocity, dt);

      p.trailTimer -= dt;
      if (p.trailTimer <= 0) {
        p.trailTimer = 0.02;
        this.effects.trail(p.position, p.mat.color.getStyle(), p.radius * 1.2, new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
      }

      // reflexo em cristais
      if (p.reflectable && ctx.world?.crystals) {
        for (const crystal of ctx.world.crystals) {
          if (!crystal.active || crystal.cooldown > 0) continue;
          if (p.position.distanceTo(crystal.position) < crystal.radius + p.radius) {
            this._reflect(p, crystal, ctx);
            break;
          }
        }
      }

      // alvos
      if (p.owner === 'player') {
        const targets = [...(ctx.enemies || [])];
        if (ctx.miniboss?.alive) targets.push(ctx.miniboss);
        let consumed = false;
        for (const t of targets) {
          if (t.defeated) continue;
          const hitPos = t.hitPosition || t.position;
          if (p.position.distanceTo(hitPos) < (t.radius || 0.7) + p.radius) {
            this._hitTarget(p, t);
            consumed = true;
            break;
          }
        }
        // objetos frágeis (caixotes, paredes rachadas) se desfazem com luz
        if (!consumed && ctx.world?.interactions) {
          for (const obj of ctx.world.interactions.list) {
            if (obj.type !== 'breakable' || obj.done) continue;
            const target = obj.position.clone().setY(obj.position.y + 0.45);
            if (p.position.distanceTo(target) < 0.85 + p.radius) {
              obj.takeDamage(p.damage, { position: p.position.clone() }, ctx);
              this.effects.burst(p.position, { color: '#ffd479', count: 10, speed: 3, size: 0.24, life: 0.4 });
              this.audio?.sfx('hit');
              this.remove(p);
              consumed = true;
              break;
            }
          }
        }
      } else if (ctx.player?.isAlive) {
        const hitPos = ctx.player.chestPosition;
        if (p.position.distanceTo(hitPos) < 0.75 + p.radius) {
          if (ctx.player.takeDamage(p.damage, { from: p.position.clone(), difficulty: this.settings.get('calm') ? 0.55 : this.settings.get('difficulty'), element: p.element })) {
            this.effects.burst(p.position, { color: p.mat.color.getStyle(), count: 14, speed: 5, size: 0.3, life: 0.5 });
            this.effects.flash(p.position, '#ff8f8f', 2, 7);
            this.hitStop = 0.05;
          }
          this.remove(p);
          continue;
        }
      }

      // colisão com o mundo
      if (ctx.world && ctx.world.projectileBlocked?.(p.position)) {
        this.effects.burst(p.position, { color: p.mat.color.getStyle(), count: 10, speed: 3, size: 0.24, life: 0.45 });
        this.remove(p);
      }
    }
  }

  _hitTarget(p, target) {
    const didHit = target.takeDamage?.(p.damage, {
      position: p.position.clone(), knockback: p.knockback, charged: p.charged,
      source: p.owner, purify: p.purify, element: 'luz',
    });
    if (p.purify) this.audio?.sfx('purify');
    else this.audio?.sfx('hit');
    this.effects.burst(p.position, { color: p.mat.color.getStyle(), count: p.charged ? 26 : 12, speed: p.charged ? 7 : 4, size: 0.28, life: 0.5 });
    this.effects.flash(p.position, p.mat.color.getStyle(), p.charged ? 4 : 2, 8);
    this.hitStop = p.charged ? 0.08 : 0.035;
    this.events?.emit('combat:hit', { target, charged: p.charged, position: p.position.clone() });
    p.onHit?.(target, p);
    if (didHit === false && target.absorbsLight) {
      this.remove(p);
      return;
    }
    if (p.pierce > 0) { p.pierce -= 1; p.damage *= 0.75; }
    else this.remove(p);
  }

  /** Um feixe que toca um cristal ricocheteia no inimigo mais próximo. */
  _reflect(p, crystal, ctx) {
    crystal.cooldown = 0.12;
    crystal.onHit?.(crystal);
    const targets = [...(ctx.enemies || []), ...(ctx.miniboss?.alive ? [ctx.miniboss] : [])].filter((t) => !t.defeated);
    let nearest = null, best = Infinity;
    for (const t of targets) {
      const d = (t.hitPosition || t.position).distanceTo(p.position);
      if (d < best) { best = d; nearest = t; }
    }
    const color = crystal.color || '#8ef7c0';
    this.effects.burst(p.position, { color, count: 18, speed: 6, size: 0.3, life: 0.6 });
    this.effects.flash(crystal.position, color, 3, 12);
    this.audio?.sfx('crystalHit');
    this.events?.emit('combat:reflect', { position: p.position.clone() });
    if (nearest && p.owner === 'player') {
      const dir = new THREE.Vector3().subVectors(nearest.hitPosition || nearest.position, p.position).normalize();
      p.velocity.copy(dir.multiplyScalar(p.velocity.length() * 1.05));
      p.damage *= 1.6;
      this.effects.beam(p.position, crystal.position, color, 0.2);
    } else {
      this.effects.beam(p.position, crystal.position, color, 0.2);
      this.remove(p);
    }
  }

  damage(target, amount, opts = {}) {
    return target?.takeDamage?.(amount, opts);
  }
}
