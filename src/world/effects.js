// Efeitos visuais: partículas luminosas, brilhos, anéis de energia e rastros.
// Tudo procedural (sem texturas externas) e com intensidade controlada pelas opções.

import * as THREE from 'three';
import { rand } from '../core/state.js';

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MAX_PARTICLES = 900;

export class Effects {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.texture = makeGlowTexture();
    this.sprites = [];
    this.rings = [];
    this.pool = new Array(MAX_PARTICLES).fill(null).map(() => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      color: new THREE.Color(), size: 0, life: 0, maxLife: 1, gravity: 0, drag: 0.9, alive: false,
    }));
    this._cursor = 0;
    this._buildPoints();
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);
  }

  get intensity() { return this.settings.get('fx'); }

  _buildPoints() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const alphas = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
    geo.setDrawRange(0, MAX_PARTICLES);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture } },
      vertexShader: `
        attribute float size; attribute float alpha;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (320.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * t * vAlpha;
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.scene.add(this.points);
    this.geo = geo;
  }

  _emit(x, y, z, color, size, life, vel, gravity = 0, drag = 0.9) {
    if (this.intensity <= 0.02) return null;
    for (let i = 0; i < 12; i++) {
      const p = this.pool[this._cursor];
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      if (!p.alive) {
        p.alive = true;
        p.pos.set(x, y, z);
        p.vel.copy(vel);
        p.color.set(color);
        p.size = size * (0.7 + this.intensity * 0.6);
        p.life = p.maxLife = life;
        p.gravity = gravity; p.drag = drag;
        return p;
      }
    }
    return null;
  }

  /** Explosão de faíscas. */
  burst(position, { color = '#9ef0ff', count = 12, speed = 3, size = 0.32, life = 0.7, spread = 1, gravity = -3, drag = 0.88, y = 0 } = {}) {
    const n = Math.max(1, Math.round(count * Math.min(1.2, this.intensity + 0.25)));
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1) * spread + y, rand(-1, 1)).normalize();
      this._emit(position.x, position.y, position.z, color, size * rand(0.7, 1.3), life * rand(0.7, 1.3), dir.multiplyScalar(speed * rand(0.5, 1.2)), gravity, drag);
    }
  }

  /** Rastro curto (usado no dash e na lanterna). */
  trail(position, color = '#bff6ff', size = 0.22, vel = null) {
    this._emit(position.x, position.y, position.z, color, size, 0.4, vel || new THREE.Vector3(rand(-0.4, 0.4), rand(0.2, 0.9), rand(-0.4, 0.4)), 0.6, 0.9);
  }

  /** Espiral de partículas (manobras com R). */
  spiral(position, color, seconds = 1.4) {
    if (this.intensity <= 0.02) return;
    const count = Math.round(46 * this.intensity + 14);
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 4;
      const r = 0.5 + (i / count) * 1.5;
      const p = this._emit(
        position.x + Math.cos(t) * r, position.y + 0.4 + (i / count) * 2.2, position.z + Math.sin(t) * r,
        color, 0.2, seconds * 0.5 + 0.3,
        new THREE.Vector3(Math.cos(t + 1.6) * 1.1, 1.4, Math.sin(t + 1.6) * 1.1), 1.2, 0.94,
      );
      if (p) p.gravity = 1.2;
    }
  }

  /** Brilho suave e persistente que acompanha um objeto. */
  attachGlow(parent, color = '#8ef7c0', size = 0.9) {
    const sprite = this._sprite(color, size);
    sprite.position.set(0, 0, 0);
    parent.add(sprite);
    return sprite;
  }

  _sprite(color, size) {
    const mat = new THREE.SpriteMaterial({
      map: this.texture, color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, size);
    return sprite;
  }

  /** Anel expansivo (pulso luminoso, avisos de ataque, descobertas). */
  ring(position, { color = '#8ef7c0', from = 0.4, to = 4, life = 0.6, flat = true, opacity = 0.8 } = {}) {
    const geo = new THREE.RingGeometry(0.85, 1, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: opacity * Math.min(1, this.intensity + 0.2),
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    if (flat) mesh.rotation.x = -Math.PI / 2;
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, life, from, to });
    return mesh;
  }

  /** Feixe luminoso entre dois pontos (gancho, reflexo em cristais). */
  beam(from, to, color = '#bff6ff', life = 0.25) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.01) return null;
    const geo = new THREE.CylinderGeometry(0.075, 0.075, len, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, life, from: 1, to: 1, fade: true });
    return mesh;
  }

  /** Faíscas de impacto simples com flash de luz temporário. */
  flash(position, color = '#ffffff', intensity = 3, distance = 9) {
    const light = new THREE.PointLight(new THREE.Color(color), intensity, distance);
    light.position.copy(position);
    this.group.add(light);
    this.rings.push({ mesh: light, t: 0, life: 0.18, from: intensity, to: 0, isLight: true });
  }

  update(dt) {
    // partículas
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const siz = this.geo.attributes.size.array;
    const alp = this.geo.attributes.alpha.array;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.alive) { alp[i] = 0; siz[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; alp[i] = 0; continue; }
      p.vel.y += p.gravity * dt;
      const drag = Math.pow(p.drag, dt * 60);
      p.vel.multiplyScalar(drag);
      p.pos.addScaledVector(p.vel, dt);
      pos[i * 3] = p.pos.x; pos[i * 3 + 1] = p.pos.y; pos[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.color.r; col[i * 3 + 1] = p.color.g; col[i * 3 + 2] = p.color.b;
      const t = p.life / p.maxLife;
      siz[i] = p.size * (0.35 + t * 0.9);
      alp[i] = Math.min(1, t * 1.6) * Math.min(1, this.intensity + 0.15);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;

    // anéis / feixes / flashes
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      if (r.isLight) {
        r.mesh.intensity = r.from * (1 - k);
      } else if (r.fade) {
        r.mesh.material.opacity = 0.75 * (1 - k);
      } else {
        const s = r.from + (r.to - r.from) * k;
        r.mesh.scale.setScalar(s);
        r.mesh.material.opacity = (1 - k) * 0.85 * Math.min(1, this.intensity + 0.2);
      }
      if (k >= 1) {
        this.group.remove(r.mesh);
        if (!r.isLight) { r.mesh.geometry?.dispose?.(); r.mesh.material?.dispose?.(); }
        this.rings.splice(i, 1);
      }
    }
  }
}
