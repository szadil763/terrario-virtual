// Câmera em terceira pessoa: órbita pelo cursor (zona de mira), setas do
// teclado, arraste no toque, zoom com a roda, recentralização automática
// suave e proteção contra atravessar o terreno.

import * as THREE from 'three';
import { clamp, damp } from './state.js';

export class CameraRig {
  constructor(camera, settings) {
    this.camera = camera;
    this.settings = settings;
    this.yaw = Math.PI;
    this.pitch = 0.34;
    this.distance = 8.2;
    this.targetDistance = 8.2;
    this.aiming = false;
    this.smoothTarget = new THREE.Vector3();
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.enabled = true;
    this.manualTimer = 0; // tempo restante sem automação (jogador está no controle)
    this._offset = new THREE.Vector3();
  }

  shake(amount) {
    this.shakeAmount = Math.min(0.6, this.shakeAmount + amount);
  }

  addLook(dx, dy) {
    if (!dx && !dy) return;
    const sens = this.settings.get('sensitivity');
    this.yaw -= dx * 0.0022 * sens;
    const invert = this.settings.get('invertY') ? -1 : 1;
    this.pitch = clamp(this.pitch + dy * 0.0018 * sens * invert, -0.35, 1.15);
    this.manualTimer = 2.2;
  }

  /** Gira a câmera conforme a posição do cursor (sem pointer lock: funciona em iframe e toque). */
  lookFromPointer(input, dt) {
    const dead = 0.14;
    const nx = input.mouse.nx, ny = input.mouse.ny;
    const speed = 3.4 * this.settings.get('sensitivity');
    let turned = false;
    if (Math.abs(nx) > dead) { this.yaw -= Math.sign(nx) * (Math.abs(nx) - dead) * speed * dt * 0.7; turned = true; }
    if (Math.abs(ny) > dead) {
      const invert = this.settings.get('invertY') ? -1 : 1;
      this.pitch = clamp(this.pitch + Math.sign(ny) * (Math.abs(ny) - dead) * speed * dt * 0.42 * invert, -0.35, 1.15);
      turned = true;
    }
    if (turned) this.manualTimer = 2.2;
  }

  /** Setas do teclado giram a câmera (movimento fica no WASD, como nos jogos da Nintendo). */
  keyboardLook(input, dt) {
    const speed = 2.4 * this.settings.get('sensitivity');
    let turned = false;
    if (input.isDown('camLeft')) { this.yaw += speed * dt; turned = true; }
    if (input.isDown('camRight')) { this.yaw -= speed * dt; turned = true; }
    const invert = this.settings.get('invertY') ? -1 : 1;
    if (input.isDown('camUp')) { this.pitch = clamp(this.pitch + 1.8 * dt * invert, -0.35, 1.15); turned = true; }
    if (input.isDown('camDown')) { this.pitch = clamp(this.pitch - 1.8 * dt * invert, -0.35, 1.15); turned = true; }
    if (turned) this.manualTimer = 2.2;
  }

  /** Recentra suavemente atrás do aventureiro quando ele anda e ninguém tocou na câmera. */
  autoAlign(moveDir, dt) {
    if (!moveDir || moveDir.lengthSq() < 0.04) return;
    const desiredYaw = Math.atan2(-moveDir.x, -moveDir.z);
    let diff = desiredYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * (1 - Math.exp(-0.9 * dt));
  }

  update(dt, playerPos, input, opts = {}) {
    if (!this.enabled) return;
    this.aiming = !!opts.aiming;
    this.manualTimer = Math.max(0, this.manualTimer - dt);
    this.keyboardLook(input, dt);
    const drag = input.consumeLookDelta();
    if (drag.x || drag.y) this.addLook(drag.x * 1.7, drag.y * 1.7);

    const wheel = input.consumeWheel();
    if (wheel) this.targetDistance = clamp(this.targetDistance + wheel * 0.006, 4.2, 13);
    const wantDistance = this.aiming ? Math.min(this.targetDistance, 4.6) : this.targetDistance;
    this.distance = damp(this.distance, wantDistance, 6, dt);

    // recentralizar: só quando o jogador anda e não mexeu na câmera recentemente
    if (!this.aiming && this.manualTimer <= 0 && opts.autoAlign) this.autoAlign(opts.moveDir, dt);

    const look = new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerPos.z);
    // leve antecipação na direção do movimento
    if (opts.moveDir && opts.moveDir.lengthSq?.() > 0.01) {
      look.x += opts.moveDir.x * 0.9;
      look.z += opts.moveDir.z * 0.9;
    }
    this.smoothTarget.x = damp(this.smoothTarget.x, look.x, 8, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, look.y, 5, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, look.z, 8, dt);

    const cosP = Math.cos(this.pitch);
    const offX = Math.sin(this.yaw) * cosP * this.distance;
    const offZ = Math.cos(this.yaw) * cosP * this.distance;
    const offY = Math.sin(this.pitch) * this.distance + 0.35;
    const sideX = Math.cos(this.yaw) * (this.aiming ? 1.1 : 0);
    const sideZ = -Math.sin(this.yaw) * (this.aiming ? 1.1 : 0);

    const desired = this._offset.set(
      this.smoothTarget.x + offX + sideX,
      Math.max(0.6, this.smoothTarget.y + offY),
      this.smoothTarget.z + offZ + sideZ,
    );
    // a câmera nunca mergulha dentro do chão
    const ground = opts.world?.terrainHeight?.(desired.x, desired.z);
    if (Number.isFinite(ground)) desired.y = Math.max(desired.y, ground + 0.7);
    this.camera.position.lerp(desired, 1 - Math.exp(-9 * dt));

    let shakeX = 0, shakeY = 0;
    if (this.shakeAmount > 0.0005) {
      this.shakeTime += dt * 30;
      shakeX = Math.sin(this.shakeTime * 1.7) * this.shakeAmount * 0.25;
      shakeY = Math.cos(this.shakeTime * 2.3) * this.shakeAmount * 0.25;
      this.shakeAmount = damp(this.shakeAmount, 0, 5, dt);
    }
    const lookAt = new THREE.Vector3(
      this.smoothTarget.x + shakeX,
      this.smoothTarget.y + 0.55 + shakeY,
      this.smoothTarget.z,
    );
    this.camera.lookAt(lookAt);
  }

  /** Direção "para frente" no plano do chão, derivada da câmera. */
  forward(out = new THREE.Vector3()) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  right(out = new THREE.Vector3()) {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }
}
