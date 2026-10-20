// Câmera em terceira pessoa: órbita suave com o mouse (zona de mira),
// zoom com a roda, aproximação ao mirar e tremor em impactos.

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
    this._offset = new THREE.Vector3();
  }

  shake(amount) {
    this.shakeAmount = Math.min(0.6, this.shakeAmount + amount);
  }

  addLook(dx, dy) {
    const sens = this.settings.get('sensitivity');
    this.yaw -= dx * 0.0022 * sens;
    const invert = this.settings.get('invertY') ? -1 : 1;
    this.pitch = clamp(this.pitch + dy * 0.0018 * sens * invert, -0.35, 1.15);
  }

  /** Gira a câmera conforme a posição do cursor (sem pointer lock: funciona em iframe e toque). */
  lookFromPointer(input, dt) {
    const dead = 0.16;
    const nx = input.mouse.nx, ny = input.mouse.ny;
    const speed = 3.1 * this.settings.get('sensitivity');
    if (Math.abs(nx) > dead) this.yaw -= Math.sign(nx) * (Math.abs(nx) - dead) * speed * dt * 0.55;
    if (Math.abs(ny) > dead) {
      const invert = this.settings.get('invertY') ? -1 : 1;
      this.pitch = clamp(this.pitch + Math.sign(ny) * (Math.abs(ny) - dead) * speed * dt * 0.35 * invert, -0.35, 1.15);
    }
  }

  update(dt, playerPos, input, opts = {}) {
    if (!this.enabled) return;
    this.aiming = !!opts.aiming;
    const wheel = input.consumeWheel();
    if (wheel) this.targetDistance = clamp(this.targetDistance + wheel * 0.006, 4.2, 13);
    const wantDistance = this.aiming ? Math.min(this.targetDistance, 4.6) : this.targetDistance;
    this.distance = damp(this.distance, wantDistance, 6, dt);

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
