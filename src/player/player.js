// Jogador: movimentação, colisão, dash, salto, vida/energia e animação
// procedural (o personagem é montado com primitivas, sem modelos externos).

import * as THREE from 'three';
import { StateMachine, clamp, damp, lerp, rand } from '../core/state.js';

const SKIN = { body: '#ffd39b', hood: '#3fb8a0', hoodDark: '#2b8c7a', pants: '#4a5fa8', scarf: '#ff8f6b', boot: '#6b4a2f' };

export class Player {
  constructor(scene, { settings, events, effects, audio }) {
    this.settings = settings;
    this.events = events;
    this.effects = effects;
    this.audio = audio;

    this.radius = 0.45;
    this.height = 1.8;
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.facing = 0;
    this.wantFacing = 0;

    this.maxHealth = 100;
    this.health = 100;
    this.maxEnergy = 100;
    this.energy = 100;

    this.invulnerable = 0;
    this.hurtTimer = 0;
    this.landTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDirection = new THREE.Vector3(0, 0, -1);
    this.dashUpgrade = 0;

    this.jumpBuffer = 0;
    this.coyote = 0;
    this.grounded = true;
    this.groundY = 0;
    this.airTime = 0;
    this.stepPhase = 0;
    this.moveSpeedRatio = 0;
    this.moveDir = new THREE.Vector3();

    this.materials = [];
    this._build(scene);

    this.fsm = new StateMachine('idle', {
      idle: { update: (dt) => this._animate(dt, 0) },
      run: { update: (dt) => this._animate(dt, this.moveSpeedRatio) },
      jump: { update: (dt) => this._animateAir(dt, -1) },
      fall: { update: (dt) => this._animateAir(dt, 1) },
      land: { enter: () => { this.landTimer = 0.18; }, update: (dt) => this._animate(dt, this.moveSpeedRatio * 0.4) },
      dash: { update: (dt) => this._animateDash(dt) },
      hurt: { update: (dt) => this._animate(dt, 0) },
      trick: { update: (dt) => this._animate(dt, 0.15) },
    });
  }

  // ------------------------------------------------------------ construção
  _build(scene) {
    const mat = (color, opts = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...opts });
      this.materials.push(m);
      return m;
    };
    this.group = new THREE.Group();
    this.group.name = 'player';

    this.body = new THREE.Group();
    this.body.position.y = 0.02;
    this.group.add(this.body);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.42, 4, 12), mat(SKIN.hood));
    torso.position.y = 1.16;
    torso.castShadow = false;
    this.torso = torso;
    this.body.add(torso);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.13, 12), mat(SKIN.hoodDark));
    belt.position.y = 0.86;
    this.body.add(belt);

    // cabeça
    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    this.body.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 14), mat(SKIN.body));
    this.head.add(skull);
    this.face = new THREE.Group();
    this.face.position.z = -0.3;
    this.head.add(this.face);
    const eyeWhiteMat = mat('#ffffff');
    const pupilMat = mat('#20263a');
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), eyeWhiteMat);
      eye.position.set(sx * 0.135, 0.05, 0);
      this.face.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), pupilMat);
      pupil.position.set(sx * 0.145, 0.05, -0.06);
      this.face.add(pupil);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 6, 10, Math.PI), pupilMat);
    smile.position.set(0, -0.14, -0.02);
    smile.rotation.z = Math.PI;
    this.face.add(smile);

    // capuz pontudo
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.62, 12), mat(SKIN.hoodDark));
    hood.position.set(0, 0.28, 0.06);
    hood.rotation.x = -0.16;
    this.head.add(hood);
    const hoodBall = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(SKIN.scarf));
    hoodBall.position.set(0, 0.6, 0.12);
    this.head.add(hoodBall);

    // cachecol
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 6, 14), mat(SKIN.scarf));
    scarf.position.y = 1.44;
    scarf.rotation.x = Math.PI / 2;
    this.body.add(scarf);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.06), mat(SKIN.scarf));
    scarfTail.position.set(0.1, 1.2, 0.28);
    scarfTail.rotation.x = 0.3;
    this.body.add(scarfTail);
    this.scarfTail = scarfTail;

    // braços
    const armGeo = new THREE.CapsuleGeometry(0.085, 0.34, 4, 8);
    this.armL = new THREE.Group();
    this.armL.position.set(-0.35, 1.34, 0);
    const armLMesh = new THREE.Mesh(armGeo, mat(SKIN.body));
    armLMesh.position.y = -0.24;
    this.armL.add(armLMesh);
    this.body.add(this.armL);

    this.armR = new THREE.Group();
    this.armR.position.set(0.35, 1.34, 0);
    const armRMesh = new THREE.Mesh(armGeo, mat(SKIN.body));
    armRMesh.position.y = -0.24;
    this.armR.add(armRMesh);
    this.body.add(this.armR);

    this.handSocket = new THREE.Object3D();
    this.handSocket.position.set(0, -0.55, 0);
    this.armR.add(this.handSocket);

    // pernas
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.3, 4, 8);
    this.legL = new THREE.Group();
    this.legL.position.set(-0.16, 0.82, 0);
    const legLMesh = new THREE.Mesh(legGeo, mat(SKIN.pants));
    legLMesh.position.y = -0.26;
    this.legL.add(legLMesh);
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34), mat(SKIN.boot));
    bootL.position.set(0, -0.5, -0.05);
    this.legL.add(bootL);
    this.body.add(this.legL);

    this.legR = new THREE.Group();
    this.legR.position.set(0.16, 0.82, 0);
    const legRMesh = new THREE.Mesh(legGeo, mat(SKIN.pants));
    legRMesh.position.y = -0.26;
    this.legR.add(legRMesh);
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34), mat(SKIN.boot));
    bootR.position.set(0, -0.5, -0.05);
    this.legR.add(bootR);
    this.body.add(this.legR);

    // sombra de contato
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.shadow = shadow;
    this.group.add(shadow);

    scene.add(this.group);
  }

  setColors() { /* reservado para cosméticos */ }

  // ------------------------------------------------------------ atualização
  update(dt, ctx) {
    const { input, world, cameraRig, aiming, locked } = ctx;
    this.aiming = aiming;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);

    const combatActive = !!ctx.inCombat;
    const regen = combatActive ? 5 : 11;
    if (!this.shieldActive) this.energy = Math.min(this.maxEnergy, this.energy + regen * dt);

    // ---- intenção de movimento (relativa à câmera)
    const axis = locked ? { x: 0, z: 0, magnitude: 0 } : input.moveAxis();
    const fwd = cameraRig.forward();
    const right = cameraRig.right();
    const desired = new THREE.Vector3()
      .addScaledVector(right, axis.x)
      .addScaledVector(fwd, -axis.z);
    if (desired.lengthSq() > 0.0001) desired.normalize();
    this.moveDir.copy(desired);

    const dashing = this.fsm.is('dash');
    // corrida estilo Nintendo: segure Shift e vá mais longe, sem gastar energia
    const sprinting = !aiming && !locked && !dashing && !this.fsm.is('trick')
      && axis.magnitude > 0.2 && input.isDown('sprint');
    this.sprinting = sprinting;
    const maxSpeed = (aiming ? 2.6 : sprinting ? 9.4 : 6.6) * Math.max(0.35, axis.magnitude);
    const accel = this.grounded ? 34 : 14;
    const targetVX = dashing ? this.dashDirection.x * 18 : desired.x * maxSpeed;
    const targetVZ = dashing ? this.dashDirection.z * 18 : desired.z * maxSpeed;

    if (dashing) {
      this.velocity.x = this.dashDirection.x * 18;
      this.velocity.z = this.dashDirection.z * 18;
      this.effects?.trail(new THREE.Vector3(this.position.x, this.position.y + 0.6, this.position.z), '#bff6ff', 0.34, new THREE.Vector3(rand(-0.3, 0.3), rand(0.1, 0.5), rand(-0.3, 0.3)));
    } else if (this.fsm.is('trick')) {
      this.velocity.x = damp(this.velocity.x, 0, 8, dt);
      this.velocity.z = damp(this.velocity.z, 0, 8, dt);
    } else {
      const blend = this.grounded ? accel : accel * 0.6;
      this.velocity.x = damp(this.velocity.x, targetVX, blend / Math.max(1, maxSpeed), dt);
      this.velocity.z = damp(this.velocity.z, targetVZ, blend / Math.max(1, maxSpeed), dt);
    }
    this.moveSpeedRatio = clamp(Math.hypot(this.velocity.x, this.velocity.z) / 6.6, 0, 1.4);

    // ---- ações
    if (!locked && !this.fsm.is('dash') && !this.fsm.is('trick') && !this.fsm.is('hurt')) {
      if (input.justPressed('dash')) this.tryDash(axis);
      if (input.justPressed('jump')) this.jumpBuffer = 0.15;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.fsm.is('dash') && !this.fsm.is('trick')) {
      this.velocity.y = 9.2;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.fsm.set('jump');
      this.audio?.sfx('jump');
      this.effects?.burst(new THREE.Vector3(this.position.x, this.position.y + 0.1, this.position.z), { color: '#cfeee0', count: 7, speed: 1.8, size: 0.22, life: 0.4, gravity: 1 });
    }

    // ---- física
    this.velocity.y -= 24 * dt;
    if (this.velocity.y < -34) this.velocity.y = -34;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    if (world) {
      world.resolveCollision(this.position, this.radius, this.velocity);
      const ground = world.groundHeightAt(this.position.x, this.position.z, this.position.y, this.grounded ? 0.4 : 0.7);
      if (this.position.y <= ground + 0.001) {
        const wasAir = !this.grounded;
        this.position.y = ground;
        this.groundY = ground;
        if (this.velocity.y < -3 && wasAir) {
          this.audio?.sfx('land');
          this.effects?.burst(new THREE.Vector3(this.position.x, this.position.y + 0.1, this.position.z), { color: '#d8e8ff', count: 10, speed: 2.4, size: 0.22, life: 0.4, gravity: -2 });
          this.fsm.set('land');
          this.landTimer = 0.18;
        }
        if (this.velocity.y < 0) this.velocity.y = 0;
        this.grounded = true;
        this.airTime = 0;
      } else {
        this.grounded = false;
        this.airTime += dt;
      }
    }

    // ---- manobra tem duração limitada
    if (this.fsm.is('trick')) {
      this.trickTimer -= dt;
      if (this.trickTimer <= 0) this.fsm.set(this.grounded ? 'idle' : 'fall');
    }

    // ---- estados automáticos
    if (!['dash', 'trick', 'hurt', 'land'].includes(this.fsm.current)) {
      if (!this.grounded) this.fsm.set(this.velocity.y > 0.5 ? 'jump' : 'fall');
      else if (this.moveSpeedRatio > 0.06) this.fsm.set('run');
      else this.fsm.set('idle');
    }
    if (this.fsm.is('dash')) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.fsm.set(this.grounded ? 'run' : 'fall');
    }
    if (this.fsm.is('land')) {
      this.landTimer -= dt;
      if (this.landTimer <= 0) this.fsm.set(this.moveSpeedRatio > 0.06 ? 'run' : 'idle');
    }
    if (this.fsm.is('hurt')) {
      this.velocity.x = damp(this.velocity.x, 0, 4, dt);
      this.velocity.z = damp(this.velocity.z, 0, 4, dt);
      if (this.hurtTimer <= 0) this.fsm.set('idle');
    }

    // rede de segurança: nunca deixar o aventureiro cair no vazio
    if (!Number.isFinite(this.position.x + this.position.y + this.position.z)) {
      const r = world?.respawn || { x: 0, z: 0 };
      const rx = Number.isFinite(r.x) ? r.x : 0;
      const rz = Number.isFinite(r.z) ? r.z : 0;
      this.position.set(rx, world ? world.groundHeightAt(rx, rz, 5, 5) : 0, rz);
      this.velocity.set(0, 0, 0);
    }

    // ---- orientação: segue o movimento; mirando, segue a câmera
    if (aiming) this.wantFacing = cameraRig.yaw + Math.PI;
    else if (this.moveSpeedRatio > 0.12) this.wantFacing = Math.atan2(-this.velocity.x, -this.velocity.z);
    this.facing = damp(this.facing, this.wantFacing, 12, dt);
    this.group.rotation.y = this.facing;
    this.group.position.copy(this.position);

    // sombra e passos
    this.shadow.position.y = this.groundY - this.position.y + 0.02;
    const shadowScale = clamp(1 - (this.position.y - this.groundY) * 0.16, 0.45, 1);
    this.shadow.scale.setScalar(shadowScale);
    this.shadow.material.opacity = 0.34 * shadowScale;
    if (this.grounded && this.moveSpeedRatio > 0.2 && this.fsm.is('run')) {
      const prev = this.stepPhase;
      this.stepPhase += dt * 8.5 * clamp(this.moveSpeedRatio, 0.4, 1.5);
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI)) this.audio?.sfx('step');
    }

    this._updateMaterials(dt);
    this.fsm.update(dt);
  }

  tryDash(axis) {
    if (this.dashCooldown > 0) return false;
    const dir = new THREE.Vector3();
    if (axis && (axis.x || axis.z)) {
      const cam = this._lastForward || new THREE.Vector3(0, 0, -1);
      dir.set(cam.x * -axis.z + this._lastRight.x * axis.x, 0, cam.z * -axis.z + this._lastRight.z * axis.x);
    }
    if (dir.lengthSq() < 0.01) dir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    dir.normalize();
    this.dashDirection.copy(dir);
    this.dashTimer = 0.26;
    this.dashCooldown = 1.15 - this.dashUpgrade * 0.22;
    this.invulnerable = Math.max(this.invulnerable, 0.32);
    this.fsm.set('dash');
    this.audio?.sfx('dash');
    this.effects?.ring(new THREE.Vector3(this.position.x, this.position.y + 0.5, this.position.z), { color: '#9ef0ff', from: 0.4, to: 2.2, life: 0.35 });
    this.events?.emit('player:dash', { position: this.position.clone() });
    return true;
  }

  rememberCamera(cameraRig) {
    this._lastForward = cameraRig.forward(new THREE.Vector3());
    this._lastRight = cameraRig.right(new THREE.Vector3());
  }

  startTrick(name, duration = 1.6) {
    if (this.fsm.is('dash') || this.fsm.is('hurt')) return false;
    this.fsm.set('trick');
    this.trickTimer = duration;
    this.trickName = name;
    return true;
  }

  takeDamage(amount, opts = {}) {
    if (this.invulnerable > 0 || this.fsm.is('dash') || this.shieldActive) {
      if (this.shieldActive) this.events?.emit('player:blocked', opts);
      return false;
    }
    const dmg = amount * (opts.difficulty ?? 1);
    this.health = Math.max(0, this.health - dmg);
    this.invulnerable = 0.85;
    this.hurtTimer = 0.45;
    this.fsm.set('hurt');
    this.audio?.sfx('hurt');
    this.events?.emit('player:damage', { amount: dmg, health: this.health });
    if (opts.from) {
      const dir = new THREE.Vector3().subVectors(this.position, opts.from).setY(0);
      if (dir.lengthSq() > 0.001) {
        dir.normalize();
        this.velocity.x += dir.x * 7;
        this.velocity.z += dir.z * 7;
        this.velocity.y = Math.max(this.velocity.y, 3.4);
      }
    }
    if (this.health <= 0) this.events?.emit('player:down', {});
    return true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.events?.emit('player:heal', { amount });
  }

  restoreEnergy(amount) {
    this.energy = Math.min(this.maxEnergy, this.energy + amount);
  }

  /** Posição do peito/cabeça — usada pela câmera e por inimigos. */
  get chestPosition() {
    return new THREE.Vector3(this.position.x, this.position.y + 1.2, this.position.z);
  }

  get handPosition() {
    return this.handSocket.getWorldPosition(new THREE.Vector3());
  }

  get isAlive() { return this.health > 0; }

  get isMoving() { return this.moveSpeedRatio > 0.1; }

  setShieldActive(active) { this.shieldActive = active; }

  _updateMaterials(dt) {
    const hurtK = this.hurtTimer > 0 ? Math.min(1, this.hurtTimer / 0.45) : 0;
    const flash = this.invulnerable > 0 && this.hurtTimer > 0 ? 1 : 0;
    for (const m of this.materials) {
      if (!m.emissive) continue;
      m.emissive.setRGB(flash * hurtK * 0.55, 0, 0);
    }
    if (this.head) {
      // piscada divertida de tempos em tempos
      this._blink = (this._blink || 0) - dt;
      if (this._blink < -3.5 && Math.random() < 0.02) this._blink = 0.12;
      const closed = this._blink > 0 ? 0.06 : 1;
      this.face.scale.y = lerp(this.face.scale.y, closed, 1 - Math.exp(-18 * dt));
    }
  }

  _animate(dt, speedRatio) {
    const t = performance.now() / 1000;
    const run = clamp(speedRatio, 0, 1.3);
    const swing = Math.sin(t * 11) * 0.75 * run;
    this.legL.rotation.x = lerp(this.legL.rotation.x, swing, 1 - Math.exp(-14 * dt));
    this.legR.rotation.x = lerp(this.legR.rotation.x, -swing, 1 - Math.exp(-14 * dt));
    this.armL.rotation.x = lerp(this.armL.rotation.x, -swing * 0.8, 1 - Math.exp(-12 * dt));
    this.body.position.y = 0.02 + Math.abs(Math.sin(t * 11)) * 0.07 * run;
    this.body.rotation.z = lerp(this.body.rotation.z, Math.sin(t * 11) * 0.035 * run, 1 - Math.exp(-10 * dt));
    this.torso.rotation.x = lerp(this.torso.rotation.x, 0.1 * run, 1 - Math.exp(-8 * dt));
    if (this.scarfTail) this.scarfTail.rotation.x = 0.3 + Math.sin(t * 6) * 0.16 + run * 0.4;
    this.body.scale.set(1, 1, 1);
    this.head.rotation.z = Math.sin(t * 5.5) * 0.03;
  }

  _animateAir(dt, dir) {
    const target = dir < 0 ? -0.9 : 0.5;
    this.legL.rotation.x = lerp(this.legL.rotation.x, target, 1 - Math.exp(-8 * dt));
    this.legR.rotation.x = lerp(this.legR.rotation.x, -target * 0.6, 1 - Math.exp(-8 * dt));
    this.armL.rotation.x = lerp(this.armL.rotation.x, -2.1, 1 - Math.exp(-8 * dt));
    this.body.position.y = 0.02;
    this.body.scale.y = lerp(this.body.scale.y, dir < 0 ? 1.06 : 0.97, 1 - Math.exp(-8 * dt));
    this.body.scale.x = this.body.scale.z = lerp(this.body.scale.z, dir < 0 ? 0.95 : 1.02, 1 - Math.exp(-8 * dt));
  }

  _animateDash(dt) {
    this.legL.rotation.x = lerp(this.legL.rotation.x, -1.5, 1 - Math.exp(-18 * dt));
    this.legR.rotation.x = lerp(this.legR.rotation.x, -1.2, 1 - Math.exp(-18 * dt));
    this.body.rotation.z = lerp(this.body.rotation.z, 0.2, 1 - Math.exp(-10 * dt));
    this.body.scale.set(0.94, 0.94, 1.12);
    this.body.position.y = 0.3;
  }
}
