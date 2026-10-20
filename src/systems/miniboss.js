// Minichefe: o Guardião Antigo, que protege a torre em ruínas.
// Aparência única, barra de vida, padrões identificáveis, momentos de
// vulnerabilidade, fraqueza ao pulso luminoso e recompensas exclusivas.

import * as THREE from 'three';
import { clamp, damp, rand } from '../core/state.js';

export class AncientGuardian {
  constructor(scene, position, { effects, audio, events, settings, combat }) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.events = events;
    this.settings = settings;
    this.combat = combat;

    this.position = position.clone();
    this.maxHp = 320;
    this.hp = this.maxHp;
    this.radius = 1.5;
    this.alive = true;
    this.defeated = false;
    this.awake = false;
    this.state = 'sleep';
    this.stateTimer = 0;
    this.attackIndex = 0;
    this.hurtFlash = 0;
    this.vulnerableTimer = 0;
    this.enraged = false;
    this.contactCooldown = 0;
    this.materials = [];
    this.homePosition = position.clone();
    this.rewards = [
      ['cristal', 14], ['fragmento', 2], ['reliquia_brilho', 1], ['chave_ruina', 1], ['moeda', 90],
    ];

    this._build();
    scene.add(this.group);
  }

  get hitPosition() { return new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z); }

  _build() {
    const mat = (c) => { const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(c), flatShading: true }); this.materials.push(m); return m; };
    this.group = new THREE.Group();
    this.group.position.copy(this.position);

    const legs = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.1), mat('#6b6f86'));
    legs.position.y = 0.35;
    this.group.add(legs);
    const hips = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.0), mat('#7d8299'));
    hips.position.y = 1.1;
    this.group.add(hips);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 1.2), mat('#8f95ab'));
    torso.position.y = 2.1;
    this.group.add(torso);
    this.torso = torso;
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.9), mat('#787e94'));
    shoulderL.position.set(-1.3, 2.45, 0);
    this.group.add(shoulderL);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 1.3;
    this.group.add(shoulderR);
    this.armL = new THREE.Group();
    this.armL.position.set(-1.35, 2.3, 0);
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.6), mat('#6f7488'));
    armLMesh.position.y = -0.75;
    this.armL.add(armLMesh);
    const fistL = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.85), mat('#5f6478'));
    fistL.position.y = -1.6;
    this.armL.add(fistL);
    this.group.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 1.35;
    this.group.add(this.armR);

    // cabeça com olhos luminosos
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.05), mat('#9aa0b6'));
    head.position.y = 3.1;
    this.group.add(head);
    this.head = head;
    this.eyeMats = [];
    for (const sx of [-1, 1]) {
      const em = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8ef7c0') });
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), em);
      eye.position.set(sx * 0.28, 3.15, -0.55);
      this.group.add(eye);
      this.eyeMats.push(em);
    }

    // cristal no peito: ponto fraco que se expõe após os golpes
    this.crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ec8ff') });
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.crystalMat);
    this.crystal.position.set(0, 2.2, -0.75);
    this.group.add(this.crystal);
    this.effects?.attachGlow(this.crystal, '#7ec8ff', 2.4);

    // aviso de ataque (anel no chão)
    this.warnRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8f8f'), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.warnRing.rotation.x = -Math.PI / 2;
    this.warnRing.position.y = 0.04;
    this.group.add(this.warnRing);

    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.sleepScale = 1;
  }

  wake() {
    if (this.awake || this.defeated) return;
    this.awake = true;
    this.state = 'idle';
    this.stateTimer = 0.6;
    this.audio?.sfx('bossAlert');
    this.events?.emit('boss:start', { name: 'Guardião Antigo', hp: this.hp, maxHp: this.maxHp });
    this.effects?.ring(this.position, { color: '#ffd479', from: 1, to: 12, life: 1.1 });
  }

  takeDamage(amount, opts = {}) {
    if (this.defeated) return false;
    if (!this.awake) this.wake();
    const weak = this.vulnerableTimer > 0 ? 2.4 : 1;
    const pulseWeak = opts.source === 'pulso' ? 1.35 : 1;
    this.hp = Math.max(0, this.hp - amount * weak * pulseWeak);
    this.hurtFlash = 0.25;
    this.events?.emit('boss:damage', { hp: this.hp, maxHp: this.maxHp });
    if (this.hp <= this.maxHp * 0.5 && !this.enraged) {
      this.enraged = true;
      this.events?.emit('ui:toast', { text: 'O Guardião se enfureceu!', icon: '⚠️' });
      this.audio?.sfx('bossAlert');
      this.effects?.burst(this.hitPosition, { color: '#ffd479', count: 40, speed: 8, size: 0.4, life: 1 });
      this.events?.emit('boss:phase', { phase: 2 });
    }
    if (this.hp <= 0) this._defeat();
    return true;
  }

  _defeat() {
    this.defeated = true;
    this.alive = false;
    this.state = 'defeated';
    this.audio?.sfx('levelup');
    this.effects?.burst(this.hitPosition, { color: '#ffe9b0', count: 70, speed: 9, size: 0.45, life: 1.6, gravity: -2 });
    this.effects?.ring(this.position, { color: '#ffd479', from: 1, to: 14, life: 1.4 });
    this.events?.emit('boss:defeated', { rewards: this.rewards, position: this.position.clone() });
    this.dissolveT = 1.6;
  }

  update(dt, ctx) {
    if (this.defeated) {
      if (this.dissolveT > 0) {
        this.dissolveT -= dt;
        const k = clamp(this.dissolveT / 1.6, 0, 1);
        this.group.scale.setScalar(Math.max(0.001, k));
        this.group.rotation.y += dt * 3;
        for (const m of this.materials) { m.transparent = true; m.opacity = k; }
        this.crystalMat.opacity = k;
      } else {
        this.group.visible = false;
      }
      return;
    }

    const player = ctx.player;
    const toPlayer = new THREE.Vector3().subVectors(player.position, this.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const dir = distance > 0.001 ? toPlayer.clone().normalize() : new THREE.Vector3(0, 0, -1);

    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const hurtK = this.hurtFlash > 0 ? this.hurtFlash / 0.25 : 0;
    for (const m of this.materials) if (m.emissive) m.emissive.setRGB(hurtK * 0.8, hurtK * 0.7, hurtK * 0.5);

    if (!this.awake) {
      if (distance < 13 && !ctx.world?.isSafe?.(player.position)) this.wake();
      return;
    }
    if (ctx.world?.isSafe?.(player.position)) {
      // dentro de uma área segura o Guardião apenas observa
      this.state = 'idle';
      this.warnRing.material.opacity = 0;
      this.group.position.copy(this.position);
      return;
    }

    const calm = ctx.settings.get('calm');
    const speedScale = (calm ? 0.7 : 1) * (this.enraged ? 1.25 : 1);
    this.stateTimer -= dt;
    if (this.vulnerableTimer > 0) this.vulnerableTimer -= dt;
    if (this.vulnerableTimer > 0) this.crystalMat.color.setRGB(1, 1, 1);
    else this.crystalMat.color.setRGB(0.4, 0.72, 1);
    this.crystal.rotation.y += dt * (this.vulnerableTimer > 0 ? 5 : 1.4);
    this.crystal.scale.setScalar(this.vulnerableTimer > 0 ? 1.35 : 1);

    switch (this.state) {
      case 'idle': {
        // caminha devagar até o jogador
        if (distance > 4) {
          this.position.addScaledVector(dir, 2.2 * speedScale * dt);
          this._walkAnim(dt, 2.2 * speedScale);
        }
        if (this.stateTimer <= 0) {
          this.attackIndex = (this.attackIndex + 1) % (this.enraged ? 3 : 2);
          this.state = 'telegraph';
          this.stateTimer = this.enraged ? 0.7 : 0.95;
          this.pendingAttack = this.attackIndex === 0 ? 'slam' : this.attackIndex === 1 ? 'shards' : 'charge';
          this.warnRing.material.opacity = 0.75;
          this.warnRing.scale.setScalar(this.pendingAttack === 'slam' ? 3.4 : 1.4);
          this.audio?.sfx('bossAlert');
        }
        break;
      }
      case 'telegraph': {
        this.warnRing.material.opacity = 0.4 + Math.sin(performance.now() / 90) * 0.35;
        this.warnRing.scale.setScalar(this.pendingAttack === 'slam' ? 3.4 : 1.4 + (1 - this.stateTimer) * 1.5);
        if (this.pendingAttack === 'shards') this.crystalMat.color.setRGB(1, 0.85, 0.6);
        if (this.stateTimer <= 0) {
          this.warnRing.material.opacity = 0;
          this._execute(this.pendingAttack, ctx, dir, distance);
        }
        break;
      }
      case 'slam': {
        // braços para baixo; onda de choque radial
        this.armAnimSlam = Math.max(0, this.armAnimSlam - dt * 3);
        this.armL.rotation.x = -1.6 * this.armAnimSlam;
        this.armR.rotation.x = -1.6 * this.armAnimSlam;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.vulnerableTimer = 3.0;
          this.state = 'idle';
          this.stateTimer = this.enraged ? 0.5 : 1.1;
          this.events?.emit('boss:vulnerable', { seconds: 3 });
        }
        break;
      }
      case 'shards': {
        this.stateTimer -= dt;
        this.armL.rotation.x = damp(this.armL.rotation.x, -2.4, 6, dt);
        this.armR.rotation.x = damp(this.armR.rotation.x, -2.4, 6, dt);
        this.throwTimer = (this.throwTimer || 0) - dt;
        if (this.throwTimer <= 0 && this.stateTimer > 0.15) {
          this.throwTimer = 0.18;
          const origin = this.crystal.getWorldPosition(new THREE.Vector3());
          const aim = new THREE.Vector3().subVectors(ctx.player.chestPosition, origin).normalize();
          this.combat.spawn({
            position: origin.clone(), direction: aim,
            speed: 15, damage: 12, owner: 'enemy', color: '#ffd479', size: 0.34, life: 3,
          });
          this.audio?.sfx('beam');
        }
        if (this.stateTimer <= 0) {
          this.state = 'idle';
          this.stateTimer = this.enraged ? 0.6 : 1.2;
          this.armL.rotation.x = this.armR.rotation.x = 0;
        }
        break;
      }
      case 'charge': {
        this.chargeDir = this.chargeDir || dir.clone();
        this.position.addScaledVector(this.chargeDir, 13 * speedScale * dt);
        this.effects?.trail(this.chestPosition(), '#8f95ab', 0.5);
        this.bodyLean = Math.min(0.4, (this.bodyLean || 0) + dt);
        this.group.rotation.x = this.bodyLean * 0.3;
        if (distance < 2.6 && this.contactCooldown <= 0) {
          this.contactCooldown = 1.2;
          ctx.player.takeDamage(16, { from: this.position.clone(), difficulty: calm ? 0.5 : ctx.settings.get('difficulty') });
        }
        if (this.stateTimer <= 0 || distance < 1.8) {
          this.group.rotation.x = 0;
          this.state = 'idle';
          this.stateTimer = 1.0;
          if (this.enraged && !this.summoned) {
            this.summoned = true;
            this.events?.emit('boss:summon', { position: this.position.clone(), count: 2 });
          }
        }
        break;
      }
      case 'hurt': break;
      default: this.state = 'idle';
    }

    if (ctx.world) {
      ctx.world.resolveCollision(this.position, this.radius, new THREE.Vector3());
      const ground = ctx.world.groundHeightAt(this.position.x, this.position.z, this.position.y, 1);
      this.position.y = ground;
    }
    this.group.position.copy(this.position);
    const lookDir = new THREE.Vector3().subVectors(player.position, this.position);
    this.group.rotation.y = damp(this.group.rotation.y, Math.atan2(-lookDir.x, -lookDir.z), 3, dt);
    if (this.state !== 'charge') this.group.rotation.x = 0;
    this.head.rotation.y = Math.sin(performance.now() / 900) * 0.14;
    for (const m of this.eyeMats) m.color.setRGB(0.55 + Math.sin(performance.now() / 300) * 0.2, 0.95, 0.75);
  }

  chestPosition() { return new THREE.Vector3(this.position.x, this.position.y + 2.2, this.position.z); }

  _walkAnim(dt, speed) {
    this.walkPhase = (this.walkPhase || 0) + dt * speed * 2.2;
    const s = Math.sin(this.walkPhase);
    this.armL.rotation.x = s * 0.35;
    this.armR.rotation.x = -s * 0.35;
    this.torso.position.y = 2.1 + Math.abs(s) * 0.08;
  }

  _execute(attack, ctx, dir, distance) {
    const calm = ctx.settings.get('calm');
    const diff = calm ? 0.5 : ctx.settings.get('difficulty');
    if (attack === 'slam') {
      this.state = 'slam';
      this.stateTimer = 0.5;
      this.armAnimSlam = 1;
      this.audio?.sfx('bossSlam');
      const center = new THREE.Vector3(this.position.x, this.position.y, this.position.z);
      this.effects?.ring(center, { color: '#ffb27a', from: 1, to: 9, life: 0.6 });
      this.effects?.burst(center, { color: '#ffd479', count: 40, speed: 9, size: 0.4, life: 0.8, gravity: -3 });
      this.events?.emit('camera:shake', 0.45);
      if (distance < 7.5 && ctx.player.grounded) {
        ctx.player.takeDamage(18, { from: this.position.clone(), difficulty: diff });
        ctx.player.velocity.y = 6;
      }
    } else if (attack === 'shards') {
      this.state = 'shards';
      this.stateTimer = 1.1;
      this.throwTimer = 0;
    } else {
      this.state = 'charge';
      this.stateTimer = 1.3;
      this.chargeDir = dir.clone();
      this.audio?.sfx('bossAlert');
      this.effects?.ring(this.position, { color: '#ff8f8f', from: 1, to: 5, life: 0.5 });
    }
  }

  serialize() { return { hp: this.hp, defeated: this.defeated }; }
  load(data = {}) {
    if (!data) return;
    if (data.defeated) {
      this.hp = 0; this.defeated = true; this.alive = false; this.group.visible = false; this.dissolveT = 0;
    } else if (typeof data.hp === 'number') {
      this.hp = data.hp;
    }
  }
}
