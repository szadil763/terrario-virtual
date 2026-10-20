// Construção e organização dos biomas. Esta versão entrega a Floresta Encantada
// completamente jogável e mantém o registro dos outros biomas prontos para
// expansão (cada um com sua paleta, poderes, inimigos e segredos).

import * as THREE from 'three';
import { clamp, lerp, rand, randInt } from '../core/state.js';
import { Effects } from './effects.js';
import {
  Interactable, InteractionManager, Chest, Breakable, Lever, Door, CrystalNode,
  GlowFlower, SecretWall, Inscription, Checkpoint, GrapplePoint, Pickup,
} from '../systems/interactables.js';
import { ITEMS } from '../systems/loot.js';
import { NPC, NPC_DEFS } from '../systems/npc.js';

export const BIOME_LIST = [
  { id: 'floresta', name: 'Floresta Encantada', icon: '🌲', color: '#7cf0a8', locked: false, desc: 'Árvores enormes, flores luminosas e ruínas cobertas de vegetação.' },
  { id: 'cristal', name: 'Cavernas de Cristal', icon: '💎', color: '#7ec8ff', locked: true, desc: 'Luz azul que ricocheteia em cristais e ativa mecanismos antigos.' },
  { id: 'deserto', name: 'Deserto dos Ecos', icon: '🏜', color: '#ffd479', locked: true, desc: 'Ruínas soterradas, miragens e ondas de energia pelo solo.' },
  { id: 'pantano', name: 'Pântano Luminescente', icon: '🍄', color: '#7cf0d8', locked: true, desc: 'Névoa viva, plataformas invisíveis e fungos falantes.' },
  { id: 'gelo', name: 'Montanhas Congeladas', icon: '❄️', color: '#dff2ff', locked: true, desc: 'Gelo que escorrega, obstáculos congelados e luz branca.' },
  { id: 'ruinas', name: 'Ruínas Antigas', icon: '🏛', color: '#c79bff', locked: true, desc: 'Runas, mecanismos e memórias do passado.' },
  { id: 'sombras', name: 'Bioma das Sombras', icon: '🌑', color: '#ff9be8', locked: true, desc: 'Ilusões, passagens ocultas e desafios maiores.' },
];

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(scene, deps) {
    this.scene = scene;
    this.deps = deps;
    this.rng = mulberry32(20261020);
    this.platforms = [];
    this.walls = [];
    this.crystals = [];
    this.grapplePoints = [];
    this.safeZones = [];
    this.npcs = [];
    this.spawnDefs = [];
    this.stoneGates = [];
    this.decor = [];
    this.anim = [];
    this.flags = {};
    this.respawn = new THREE.Vector3(0, 0, 0);
    this.interactions = new InteractionManager(deps);
    this.ctx = null;
    this.tick = 0;
  }

  // -------------------------------------------------------------- terreno
  terrainHeight(x, z) {
    let h = 0.45 * Math.sin(x * 0.13) * Math.cos(z * 0.15) + 0.3 * Math.sin(x * 0.27 + 1.1) * Math.cos(z * 0.21 - 0.6);
    const dCamp = Math.hypot(x, z);
    const flat = clamp((dCamp - 7) / 9, 0, 1);
    h *= lerp(0.12, 1, flat);
    const dPond = Math.hypot(x + 16, z - 9);
    if (dPond < 7) h -= (1 - dPond / 7) * 1.8;
    return h;
  }

  groundHeightAt(x, z, currentY = 0, stepUp = 0.6) {
    let best = this.terrainHeight(x, z);
    for (const p of this.platforms) {
      if (p.removed) continue;
      if (Math.abs(x - p.x) > p.hw + 0.4 || Math.abs(z - p.z) > p.hd + 0.4) continue;
      if (p.top <= currentY + stepUp && p.top > best) best = p.top;
    }
    return best;
  }

  resolveCollision(position, radius, velocity = null) {
    for (const w of this.walls) {
      if (w.removed) continue;
      const dx = position.x - w.x;
      const dz = position.z - w.z;
      const px = Math.abs(dx) - (w.hw + radius);
      const pz = Math.abs(dz) - (w.hd + radius);
      if (px >= 0 || pz >= 0) continue;
      // dentro da caixa expandida: empurra pelo eixo de menor penetração
      if (px > pz) {
        position.x = w.x + Math.sign(dx || 1) * (w.hw + radius);
        if (velocity) velocity.x = 0;
      } else {
        position.z = w.z + Math.sign(dz || 1) * (w.hd + radius);
        if (velocity) velocity.z = 0;
      }
    }
    for (const p of this.platforms) {
      if (p.removed) continue;
      if (position.y > p.top - 0.45) continue; // já está em cima: não bloqueia
      const px = Math.abs(position.x - p.x) - (p.hw + radius);
      const pz = Math.abs(position.z - p.z) - (p.hd + radius);
      if (px >= 0 || pz >= 0) continue;
      if (px > pz) position.x = p.x + Math.sign(position.x - p.x || 1) * (p.hw + radius);
      else position.z = p.z + Math.sign(position.z - p.z || 1) * (p.hd + radius);
    }
    // limite do mapa
    const limit = 52;
    const d = Math.hypot(position.x, position.z);
    if (d > limit) {
      const k = limit / d;
      position.x *= k;
      position.z *= k;
    }
  }

  projectileBlocked(position) {
    if (position.y < this.terrainHeight(position.x, position.z) + 0.12) return true;
    for (const w of this.walls) {
      if (w.removed) continue;
      if (Math.abs(position.x - w.x) < w.hw && Math.abs(position.z - w.z) < w.hd && position.y < w.h + 0.2) return true;
    }
    return false;
  }

  isSafe(position) {
    return this.safeZones.some((z) => Math.hypot(position.x - z.x, position.z - z.z) < z.radius);
  }

  setRespawn(position) { this.respawn.copy(position); }

  // ------------------------------------------------------------- helpers
  _mat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...opts }); }

  _box(x, y, z, sx, sy, sz, color, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), this._mat(color, opts));
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    return mesh;
  }

  _wall(id, x, z, hw, hd, h, color = '#5f6b7d') {
    const mesh = this._box(x, h / 2, z, hw * 2, h, hd * 2, color);
    const entry = { id, x, z, hw, hd, h, mesh, removed: false };
    this.walls.push(entry);
    return entry;
  }

  _platform(id, x, z, hw, hd, top, color = '#6b7a8f') {
    const mesh = this._box(x, top - 0.4, z, hw * 2, 0.8, hd * 2, color);
    const entry = { id, x, z, hw, hd, top, mesh, removed: false };
    this.platforms.push(entry);
    return entry;
  }

  _instanced(geometry, material, transforms) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    transforms.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(t.rx || 0, t.ry || 0, t.rz || 0));
      s.set(t.s || 1, t.sy || t.s || 1, t.s || 1);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  addGlowPoint(position, color, size, ctxExtra = {}) {
    const sprite = this.deps.effects._sprite(color, size);
    sprite.position.copy(position);
    sprite.material.opacity = 0.55;
    this.scene.add(sprite);
    this.anim.push({ kind: 'glow', sprite, base: position.clone(), phase: rand(0, 6), ...ctxExtra });
    return sprite;
  }

  spawnPickup(itemId, amount, position) {
    const def = ITEMS[itemId];
    const geo = itemId === 'moeda'
      ? new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12)
      : itemId === 'cristal' ? new THREE.OctahedronGeometry(0.2, 0)
      : itemId === 'fragmento' ? new THREE.IcosahedronGeometry(0.2, 0)
      : new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const color = itemId === 'moeda' ? '#ffd479' : itemId === 'cristal' ? '#7ec8ff' : itemId === 'fragmento' ? '#ffe9b0' : '#d59bff';
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.deps.effects.attachGlow(mesh, color, 1.2);
    const pickup = new Pickup({ position, itemId, amount, mesh });
    return this.interactions.addPickup(pickup);
  }

  revealNear(position, radius, permanent = false) {
    for (const obj of this.interactions.list) {
      if (!obj.hidden || obj.revealed) continue;
      if (obj.position.distanceTo(position) < radius) obj.reveal(this.ctx);
    }
    if (permanent) this.flags.revealed = true;
  }

  reactToPower(biome, position, radius) {
    if (biome !== 'floresta') return;
    for (const obj of this.interactions.list) {
      if (obj.type === 'flower' && !obj.bloomed && obj.position.distanceTo(position) < radius) obj.bloom(this.ctx);
    }
    for (const gate of this.stoneGates) {
      if (gate.kind === 'bramble' && !gate.removed && gate.position.distanceTo(position) < radius + 3) {
        this.growRootBridge(gate);
      }
    }
  }

  growRootBridge(gate) {
    gate.removed = true;
    if (gate.wall) gate.wall.removed = true;
    if (gate.brambleMesh) gate.brambleMesh.visible = false;
    if (gate.bridgeMesh) gate.bridgeMesh.visible = true;
    if (gate.platform) gate.platform.removed = false;
    this.ctx?.audio?.sfx('purify');
    this.ctx?.effects?.burst(gate.position.clone().setY(1), { color: '#7cf0a8', count: 40, speed: 5, size: 0.36, life: 1.2, gravity: 1.5 });
    this.ctx?.toast?.('A luz verde fez raízes crescerem e formar uma ponte!', '🌿');
    this.ctx?.events?.emit('world:bridge', { id: gate.id });
  }

  // =============================================================== FLORESTA
  build(biomeId = 'floresta') {
    if (biomeId !== 'floresta') return false;
    const fx = this.deps.effects;

    // ---- terreno
    const geo = new THREE.PlaneGeometry(130, 130, 90, 90);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.terrainHeight(x, z);
      pos.setY(i, h);
      const moss = clamp((Math.sin(x * 0.3) * Math.cos(z * 0.28) + 1) / 2, 0, 1);
      c.setHSL(0.34 - moss * 0.03, 0.32, 0.16 + moss * 0.07);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.name = 'ground';
    this.scene.add(ground);
    this.ground = ground;

    // ---- árvores (instanciadas)
    const trunkTransforms = [];
    const canopyTransforms = [];
    const treeSpots = [];
    for (let i = 0; i < 140; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 12 + this.rng() * 38;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x + 24, z + 22) < 13) continue;         // torre
      if (Math.hypot(x - 18, z - 2) < 7) continue;           // clareira das flores
      if (Math.hypot(x + 16, z - 9) < 8) continue;           // lago
      if (Math.hypot(x + 2, z + 34) < 9) continue;           // altar antigo
      if (Math.hypot(x - 20, z - 24) < 9) continue;          // planalto
      if (Math.hypot(x, z) < 11) continue;                   // acampamento
      if (Math.hypot(x - 26, z + 20) < 9) continue;          // portão do bioma
      if (Math.hypot(x - 10, z + 16) < 6) continue;          // ravina das raízes
      const s = 0.8 + this.rng() * 0.9;
      const h = this.terrainHeight(x, z);
      trunkTransforms.push({ x, y: h + 1.6 * s, z, s: 0.5 * s, sy: 3.2 * s, ry: this.rng() * 3 });
      canopyTransforms.push({ x, y: h + 3.4 * s + 0.6, z, s: 1.9 * s, sy: 2.2 * s, ry: this.rng() * 3 });
      canopyTransforms.push({ x: x + 0.2, y: h + 4.6 * s, z: z - 0.2, s: 1.3 * s, sy: 1.5 * s, ry: this.rng() * 3 });
      treeSpots.push({ x, z, s });
    }
    this._instanced(new THREE.CylinderGeometry(0.34, 0.46, 3.4, 6), this._mat('#4a3b2c'), trunkTransforms);
    this._instanced(new THREE.ConeGeometry(1.5, 3.2, 7), this._mat('#1f4a35'), canopyTransforms);
    // folhagens brilhantes espalhadas
    const bushT = [];
    for (let i = 0; i < 90; i++) {
      const a = this.rng() * Math.PI * 2, r = 8 + this.rng() * 42;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 8) continue;
      bushT.push({ x, y: this.terrainHeight(x, z) + 0.25, z, s: 0.5 + this.rng() * 0.7, ry: this.rng() * 3 });
    }
    this._instanced(new THREE.IcosahedronGeometry(0.7, 0), this._mat('#26543c'), bushT);
    // pedras
    const rockT = [];
    for (let i = 0; i < 55; i++) {
      const a = this.rng() * Math.PI * 2, r = 10 + this.rng() * 42;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      rockT.push({ x, y: this.terrainHeight(x, z) + 0.2, z, s: 0.4 + this.rng() * 0.9, ry: this.rng() * 3 });
    }
    this._instanced(new THREE.DodecahedronGeometry(0.8, 0), this._mat('#545a6b'), rockT);

    // ---- cogumelos e flores decorativas com brilho
    const mushroomT = [];
    const glowPositions = [];
    const glowColors = [];
    for (let i = 0; i < 120; i++) {
      const a = this.rng() * Math.PI * 2, r = 7 + this.rng() * 44;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) < 7) continue;
      const h = this.terrainHeight(x, z);
      mushroomT.push({ x, y: h + 0.22, z, s: 0.3 + this.rng() * 0.5, sy: 0.4 + this.rng() * 0.5, ry: this.rng() * 3 });
      if (i % 2 === 0) {
        glowPositions.push(x, h + 0.35, z);
        const col = new THREE.Color(this.rng() < 0.5 ? '#7cf0a8' : this.rng() < 0.6 ? '#bff6ff' : '#ffd479');
        glowColors.push(col.r, col.g, col.b);
      }
    }
    this._instanced(new THREE.CylinderGeometry(0.18, 0.22, 0.4, 6), this._mat('#e8dcc0'), mushroomT);
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(glowColors, 3));
    this.plantGlow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      size: 0.5, map: fx.texture, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.8,
    }));
    this.scene.add(this.plantGlow);

    // ---- vaga-lumes ambiente
    this.fireflies = this._buildFireflies();

    // ---- lago
    const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshLambertMaterial({ color: new THREE.Color('#1d5a70'), transparent: true, opacity: 0.85 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-16, this.terrainHeight(-16, 9) + 0.35, 9);
    this.scene.add(pond);
    this.pond = pond;
    this.anim.push({ kind: 'pond', mesh: pond });
    for (let i = 0; i < 8; i++) {
      const a = rand(0, Math.PI * 2);
      this.addGlowPoint(new THREE.Vector3(-16 + Math.cos(a) * rand(2, 6.4), pond.position.y + 0.1, 9 + Math.sin(a) * rand(2, 6.4)), '#7cf0d8', rand(1.2, 2.2));
    }

    // ---- acampamento (área segura)
    this._buildCamp();

    // ---- ruínas da torre + arena do minichefe + cofre
    this._buildRuins();

    // ---- clareira das flores luminosas
    this._buildMeadow();

    // ---- ravina com brambles/pontes de raiz + altar antigo
    this._buildAncientClearing();

    // ---- planalto com ponto de gancho
    this._buildPlateau();

    // ---- grove secreto com portão de pedra
    this._buildHiddenGrove();

    // ---- paredes secretas reveladas pela Revelação
    this._buildSecrets();

    // ---- cristais que refletem luz
    this._buildCrystals();

    // ---- paredes invisíveis de ambientação (entrada de outros biomas)
    this._buildBiomeGate();

    // ---- inscrições de história
    this._buildInscriptions();

    // ---- NPCs
    this._buildNPCs();

    // ---- inimigos
    this._buildEnemies();

    // ---- névoa e ambiente luminoso
    this.scene.fog = new THREE.FogExp2(new THREE.Color('#060a14'), 0.022);
    this.scene.background = new THREE.Color('#05070f');
    const hemi = new THREE.HemisphereLight(new THREE.Color('#2a3a63'), new THREE.Color('#080d16'), 0.5);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(new THREE.Color('#7f9ddb'), 0.22);
    moon.position.set(-30, 40, -20);
    this.scene.add(moon);
    this.lights = { hemi, moon };
    return true;
  }

  _buildFireflies() {
    const count = 150;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = [];
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), r = rand(4, 46);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = this.terrainHeight(x, z) + rand(0.6, 4.5);
      positions.set([x, y, z], i * 3);
      col.setHSL(rand(0.3, 0.5), 0.7, 0.7);
      colors.set([col.r, col.g, col.b], i * 3);
      data.push({ base: new THREE.Vector3(x, y, z), phase: rand(0, 6), speed: rand(0.2, 0.7), radius: rand(0.6, 2.4) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.3, map: this.deps.effects.texture, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    }));
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, data, geo };
  }

  _buildCamp() {
    const fx = this.deps.effects;
    const y = this.terrainHeight(0, 0);
    // fogueira
    const stoneRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 6, 16), this._mat('#4e5566'));
    stoneRing.rotation.x = Math.PI / 2;
    stoneRing.position.set(0, y + 0.12, 0);
    this.scene.add(stoneRing);
    const logs = [];
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 6), this._mat('#4a3b2c'));
      log.position.set(0, y + 0.2, 0);
      log.rotation.set(Math.PI / 2.4, i * Math.PI / 4, 0);
      this.scene.add(log);
      logs.push(log);
    }
    this.fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb45c'), transparent: true, opacity: 0.9 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 8), this.fireMat);
    flame.position.set(0, y + 0.85, 0);
    this.scene.add(flame);
    this.flame = flame;
    this.fireLight = new THREE.PointLight(new THREE.Color('#ffb45c'), 3.4, 16, 1.8);
    this.fireLight.position.set(0, y + 1, 0);
    this.scene.add(this.fireLight);
    this.safeZones.push({ x: 0, z: 0, radius: 11, name: 'Acampamento' });
    const checkpoint = new Checkpoint({ id: 'checkpoint-camp', position: new THREE.Vector3(1.6, y, 0.8), safeRadius: 11 });
    this.interactions.add(checkpoint);
    this.addGlowPoint(new THREE.Vector3(0, y + 1.2, 0), '#ffb45c', 3);
    this.anim.push({ kind: 'fire', flame, light: this.fireLight, base: y });

    // tendas
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const tx = Math.cos(a) * 6.5, tz = Math.sin(a) * 6.5;
      const ty = this.terrainHeight(tx, tz);
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.9, 4), this._mat('#7a5a3a'));
      tent.position.set(tx, ty + 0.95, tz);
      tent.rotation.y = a;
      this.scene.add(tent);
      this._box(tx, ty + 0.25, tz + 1.6, 0.4, 0.5, 0.4, '#3a2c20');
    }
    // caixote quebrável no acampamento
    this._addBreakable('crate-camp', new THREE.Vector3(-5.5, 0, 3.2), [['moeda', 6, 12], ['cristal', 1, 2]]);
    // banco + placa de tutorial
    this._box(3.2, this.terrainHeight(3.2, -3) + 0.3, -3, 2.2, 0.3, 0.6, '#6b4f34');
  }

  _addBreakable(id, position, loot) {
    position.y = this.terrainHeight(position.x, position.z);
    const mesh = this._box(position.x, position.y + 0.45, position.z, 0.9, 0.9, 0.9, '#8a6a44');
    const b = new Breakable({ id, position, loot, hp: 24 });
    b.mesh = mesh;
    this.deps.effects.attachGlow(mesh, '#ffd479', 0.6).material.opacity = 0.25;
    this.interactions.add(b);
    return b;
  }

  _addChest(id, position, tier, opts = {}) {
    const y = opts.y ?? this.terrainHeight(position.x, position.z);
    position = new THREE.Vector3(position.x, y, position.z);
    const color = tier === 'secreto' ? '#a86fd6' : tier === 'raro' ? '#5aa6d6' : '#9a7440';
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.75, 0.75), this._mat(color));
    box.position.set(position.x, y + 0.38, position.z);
    box.rotation.y = opts.ry || 0;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.8), this._mat(tier === 'comum' ? '#b98d51' : color));
    lid.position.set(0, 0.46, -0.02);
    lid.geometry.translate(0, 0, 0.4);
    lid.position.set(position.x, y + 0.72, position.z);
    lid.rotation.y = box.rotation.y;
    const group = new THREE.Group();
    this.scene.add(box);
    this.scene.add(lid);
    const chest = new Chest({ id, position, tier, depth: opts.depth || 0, hidden: !!opts.hidden });
    chest.mesh = box;
    chest.lid = lid;
    chest.group = group;
    this.deps.effects.attachGlow(box, tier === 'secreto' ? '#d59bff' : tier === 'raro' ? '#7ec8ff' : '#ffd479', 1.5).material.opacity = 0.35;
    if (opts.hidden) { box.visible = true; box.material.transparent = true; box.material.opacity = 0.25; }
    this.interactions.add(chest);
    return chest;
  }

  _buildRuins() {
    const fx = this.deps.effects;
    const cx = -24, cz = -22;
    const baseY = this.terrainHeight(cx, cz);

    // piso da torre
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 0.3, 28), this._mat('#5b6274'));
    floor.position.set(cx, baseY + 0.05, cz);
    this.scene.add(floor);

    // muralha circular com abertura ao norte
    const segments = 12;
    const gapFrom = Math.PI * 0.72, gapTo = Math.PI * 1.05;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      if (a > gapFrom && a < gapTo) continue;
      const x = cx + Math.cos(a) * 7.2;
      const z = cz + Math.sin(a) * 7.2;
      const h = 6.5 + Math.sin(i * 2.7) * 0.9;
      const mesh = this._box(x, baseY + h / 2, z, 3.9, h, 1.1, '#616a7d');
      mesh.rotation.y = -a + Math.PI / 2;
      this.walls.push({ id: `tower-${i}`, x, z, hw: 1.8, hd: 1.05, h, mesh, removed: false, rotated: true });
    }
    // torre interna mais alta
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = cx + Math.cos(a) * 3.4, z = cz + Math.sin(a) * 3.4;
      const h = 9 - i * 0.6;
      this._box(x, baseY + h / 2, z, 2.4, h, 0.9, '#4f5668');
    }
    this._box(cx, baseY + 9.6, cz, 2.2, 0.6, 2.2, '#454c5c');
    this.addGlowPoint(new THREE.Vector3(cx, baseY + 3.2, cz), '#7ec8ff', 5);

    // degraus de entrada (norte)
    for (let i = 0; i < 3; i++) {
      this._platform(`tower-step-${i}`, cx + 0.6 + i * 1.6, cz - 8.4 - i * 1.5, 1.6, 1.4, baseY + 0.25 * (3 - i), '#5f6678');
    }

    // cofre selado atrás do guardião (sul interno)
    const vaultY = baseY;
    this._wall('vault-w1', cx - 2.6, cz + 6.2, 2.8, 0.6, 5, '#4c5264');
    this._wall('vault-w2', cx + 2.6, cz + 6.2, 2.8, 0.6, 5, '#4c5264');
    this._wall('vault-w3', cx, cz + 8.6, 5.4, 0.6, 5, '#4c5264');
    const doorMesh = this._box(cx, vaultY + 2.4, cz + 6.2, 2.4, 4.8, 0.5, '#7d6a4a');
    doorMesh.userData = { baseY: vaultY + 2.4, lift: 5.2, openT: 0 };
    const vaultDoor = new Door({
      id: 'vault-door', position: new THREE.Vector3(cx, vaultY, cz + 5.4), requiresKey: 'chave_ruina',
      label: 'Abrir cofre antigo', target: 'vault',
    });
    vaultDoor.mesh = doorMesh;
    this.interactions.add(vaultDoor);
    this._addChest('chest-vault', new THREE.Vector3(cx, 0, cz + 7.6), 'secreto', { y: vaultY + 0.1, ry: Math.PI });
    this._addChest('chest-ruins', new THREE.Vector3(cx + 5.2, 0, cz - 4.4), 'raro', { y: baseY });

    // paredes quebradas, arcos e escombros ao redor
    this._wall('ruin-w1', cx + 12, cz + 3, 4.5, 0.7, 2.6, '#59606f');
    this._wall('ruin-w2', cx + 14, cz - 2, 0.7, 3.5, 1.9, '#59606f');
    this._wall('ruin-w3', cx - 13, cz - 4, 4, 0.7, 3.2, '#59606f');
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.5, 6, 12, Math.PI), this._mat('#5b6274'));
    arch.position.set(cx - 14, baseY + 3, cz + 8);
    this.scene.add(arch);
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), r = rand(8, 15);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = rand(0.5, 1.6);
      const rubble = this._box(x, this.terrainHeight(x, z) + s * 0.3, z, s, s * 0.7, s, '#5a6172');
      rubble.rotation.y = rand(0, 3);
    }
    this._addBreakable('crate-ruins-1', new THREE.Vector3(cx + 8.4, 0, cz + 6.6), [['moeda', 8, 16], ['cristal', 1, 3]]);
    this._addBreakable('crate-ruins-2', new THREE.Vector3(cx + 9.6, 0, cz + 5.2), [['fragmento', 1, 1], ['moeda', 4, 8]]);
    this._addBreakable('crate-ruins-3', new THREE.Vector3(cx - 9.2, 0, cz - 6.2), [['cristal', 2, 4], ['moeda', 6, 12]]);
    this.addGlowPoint(new THREE.Vector3(cx + 12, baseY + 2.4, cz + 3), '#d59bff', 3.4);
  }

  _buildMeadow() {
    const cx = 18, cz = 2;
    const flowers = [
      [cx - 3, cz - 2], [cx + 2.5, cz - 1], [cx, cz + 3.5], [cx - 4.2, cz + 2.4], [cx + 4.4, cz + 2.8],
    ];
    flowers.forEach(([x, z], i) => {
      const y = this.terrainHeight(x, z);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 6), this._mat('#2f6a48'));
      stem.position.set(x, y + 0.35, z);
      this.scene.add(stem);
      const petals = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7cf0a8'), transparent: true, opacity: 0.95 }));
      petals.position.set(x, y + 0.85, z);
      petals.visible = false;
      this.scene.add(petals);
      const glow = this.addGlowPoint(new THREE.Vector3(x, y + 0.9, z), '#7cf0a8', 2.6);
      glow.material.opacity = 0.1;
      const flower = new GlowFlower({ id: `flower-${i}`, position: new THREE.Vector3(x, y, z) });
      flower.petals = petals;
      flower.glowSprite = glow;
      this.interactions.add(flower);
      this.anim.push({ kind: 'flowerGlow', sprite: glow, base: petals.position.clone(), phase: rand(0, 6), flower });
    });
    // banco de pedra e cogumelos decorativos
    this._box(cx, this.terrainHeight(cx, cz - 5) + 0.3, cz - 5, 1.6, 0.4, 0.7, '#5b6274');
    this.addGlowPoint(new THREE.Vector3(cx, this.terrainHeight(cx, cz) + 3, cz), '#7cf0a8', 6);
    this._addChest('chest-meadow', new THREE.Vector3(cx + 6, 0, cz + 4.5), 'comum', {});
  }

  _buildAncientClearing() {
    const ax = -2, az = -34;
    const ay = this.terrainHeight(ax, az);
    // altar
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.6, 14), this._mat('#5f6478'));
    base.position.set(ax, ay + 0.3, az);
    this.scene.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 8), this._mat('#6b7186'));
    pillar.position.set(ax, ay + 1.8, az);
    this.scene.add(pillar);
    this.altarCrystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#39406a') });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.altarCrystalMat);
    crystal.position.set(ax, ay + 3.4, az);
    this.scene.add(crystal);
    this.altarCrystal = crystal;
    this.altarGlow = this.addGlowPoint(new THREE.Vector3(ax, ay + 3.4, az), '#7cf0a8', 1.2);
    this.altarGlow.material.opacity = 0.08;
    this.anim.push({ kind: 'altar', crystal, glow: this.altarGlow, base: crystal.position.clone() });

    // pilares caídos ao redor
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = ax + Math.cos(a) * 6.5, z = az + Math.sin(a) * 6.5;
      const p = this._box(x, this.terrainHeight(x, z) + 1.4, z, 0.9, 2.8, 0.9, '#5b6274');
      p.rotation.z = rand(-0.12, 0.12);
    }

    // ravina com brambles e ponte de raízes
    const bx = 10, bz = -16;
    const by = this.terrainHeight(bx, bz);
    const wall = this._wall('bramble-wall', bx, bz, 3.2, 0.9, 3.4, '#28402c');
    const brambleMesh = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 5), this._mat('#3c5c3a'));
      thorn.position.set(bx + rand(-3, 3), by + rand(0.3, 2.8), bz + rand(-0.7, 0.7));
      thorn.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
      brambleMesh.add(thorn);
    }
    this.scene.add(brambleMesh);
    const bridgeMesh = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.4, 6), this._mat('#5a4630'));
      seg.position.set(bx + rand(-0.8, 0.8), by + 0.9 + Math.sin(i) * 0.06, bz + rand(-1.6, 1.6));
      seg.rotation.set(0, rand(0, 3), Math.PI / 2);
      bridgeMesh.add(seg);
    }
    bridgeMesh.visible = false;
    this.scene.add(bridgeMesh);
    const bridgePlatform = this._platform('root-bridge', bx, bz, 3.4, 2.2, by + 0.9, '#5a4630');
    this.stoneGates.push({
      id: 'bramble', kind: 'bramble', position: new THREE.Vector3(bx, by, bz),
      wall, brambleMesh, bridgeMesh, platform: bridgePlatform, removed: false,
    });
    // esconderijo de loot atrás das raízes
    this._addChest('chest-bramble', new THREE.Vector3(bx + 4.5, 0, bz - 3.5), 'raro', { hidden: true });
    this.addGlowPoint(new THREE.Vector3(bx - 3.6, by + 1.6, bz), '#7cf0a8', 2.4);

    // ponte natural até o altar (caminho livre)
    for (let i = 0; i < 4; i++) {
      const x = ax + 3 + i * 0.2, z = az + 8 + i * 1.8;
      this._platform(`altar-step-${i}`, x, z, 2.4, 1.2, this.terrainHeight(x, z) + 0.12 + i * 0.1, '#4d5a4a');
    }
  }

  _buildPlateau() {
    const px = 20, pz = 24;
    const top = 4.2;
    this._platform('plateau', px, pz, 5, 5, top, '#4f5a6b');
    // escada íngreme de pedras
    for (let i = 0; i < 4; i++) {
      this._platform(`plateau-step-${i}`, px - 6.5 - i * 1.4, pz - 3.4 - i * 0.7, 1.4, 1.4, 0.9 + i * 0.9, '#4f5a6b');
    }
    // ponto de gancho suspenso
    const hookY = top + 3.6;
    const hookGroup = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 8, 6), this._mat('#4a3b2c'));
    post.position.set(px + 3.4, this.terrainHeight(px + 3.4, pz + 3.4) + 4, pz + 3.4);
    this.scene.add(post);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff6ff') }));
    ring.position.set(px + 3.4, hookY + 1.4, pz + 3.4);
    this.scene.add(ring);
    this.deps.effects.attachGlow(ring, '#bff6ff', 2.2);
    this.grapplePoints.push(new GrapplePoint({ position: ring.position.clone(), mesh: ring }));
    this._addChest('chest-plateau', new THREE.Vector3(px, 0, pz), 'raro', { y: top + 0.1 });
    this.addGlowPoint(new THREE.Vector3(px, top + 1.4, pz), '#ffd479', 4);
    this._addBreakable('crate-plateau', new THREE.Vector3(px + 3, 0, pz - 3), [['moeda', 12, 22], ['cristal', 2, 4]]);
    // segundo gancho sobre o lago (diversão)
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 6, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff6ff') }));
    ring2.position.set(-16, this.terrainHeight(-16, 9) + 5.2, 9);
    this.scene.add(ring2);
    this.deps.effects.attachGlow(ring2, '#bff6ff', 2.2);
    this.grapplePoints.push(new GrapplePoint({ position: ring2.position.clone(), mesh: ring2 }));
  }

  _buildHiddenGrove() {
    const gx = -26, gz = 18;
    const gy = this.terrainHeight(gx, gz);
    // portão de pedra que desce quando as duas alavancas são puxadas
    const gateWall = this._wall('stone-gate', gx, gz, 4.2, 1, 4.4, '#59606f');
    this.stoneGates.push({ id: 'grove-gate', kind: 'door', position: new THREE.Vector3(gx, gy, gz), wall: gateWall, removed: false });
    this._addChest('chest-grove', new THREE.Vector3(gx, 0, gz + 4.5), 'secreto', { ry: 0.4 });
    this.addGlowPoint(new THREE.Vector3(gx, gy + 2.4, gz + 4.5), '#d59bff', 3.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = gx + Math.cos(a) * 5.5, z = gz + Math.sin(a) * 5.5;
      this._box(x, this.terrainHeight(x, z) + 0.7, z, 0.7, 1.4, 0.7, '#4b5566');
    }

    // alavancas (uma no caminho do lago, outra perto das ruínas)
    const leverA = this._makeLever('lever-pond', new THREE.Vector3(-9, 0, 12), 'grove', gx, gz);
    const leverB = this._makeLever('lever-ruins', new THREE.Vector3(-13, 0, -13), 'grove', gx, gz);
    return { leverA, leverB };
  }

  _makeLever(id, position, group, gx, gz) {
    const y = this.terrainHeight(position.x, position.z);
    const base = this._box(position.x, y + 0.2, position.z, 0.9, 0.4, 0.9, '#5b6274');
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), this._mat('#c9a06a'));
    handle.position.set(position.x, y + 0.75, position.z);
    handle.rotation.x = 0.9;
    this.scene.add(handle);
    const lever = new Lever({ id, position: new THREE.Vector3(position.x, y, position.z), group, label: 'Puxar alavanca antiga' });
    lever.handle = handle;
    this.interactions.add(lever);
    this.addGlowPoint(new THREE.Vector3(position.x, y + 1.3, position.z), '#ffd479', 1.8);
    return lever;
  }

  leversPulled(group) {
    return this.interactions.list.filter((o) => o.type === 'lever' && o.group === group && o.pulled).length;
  }

  onLeverPulled(ctx) {
    const total = this.leversPulled('grove');
    if (total >= 2) {
      const gate = this.stoneGates.find((g) => g.id === 'grove-gate');
      if (gate && !gate.removed) {
        gate.removed = true;
        gate.wall.removed = true;
        if (gate.wall.mesh) {
          this.anim.push({ kind: 'sink', mesh: gate.wall.mesh, t: 0 });
        }
        ctx?.audio?.sfx('door');
        ctx?.toast?.('As duas alavancas abriram o portão de pedra!', '🗝');
        ctx?.events?.emit('world:gate', { id: gate.id });
      }
    } else {
      ctx?.toast?.(`Alavanca ${total}/2 puxada. Existe outra por aí…`, '🔧');
    }
  }

  _buildSecrets() {
    // parede ilusória 1: esconderijo atrás das ruínas
    const s1 = new THREE.Vector3(-13, 0, -30);
    const s1y = this.terrainHeight(s1.x, s1.z);
    const mesh1 = this._box(s1.x, s1y + 1.6, s1.z, 4.6, 3.2, 1.2, '#5f6577');
    const wall1 = { id: 'secret-1', x: s1.x, z: s1.z, hw: 2.3, hd: 0.6, h: 3.2, mesh: mesh1, removed: false };
    this.walls.push(wall1);
    const secret1 = new SecretWall({ id: 'secret-wall-1', position: new THREE.Vector3(s1.x, s1y, s1.z) });
    secret1.mesh = mesh1;
    secret1.onReveal = () => { wall1.removed = true; };
    this.interactions.add(secret1);
    this._addChest('chest-secret-1', new THREE.Vector3(s1.x, 0, s1.z - 3.4), 'secreto', { hidden: true, y: s1y + 0.1 });

    // parede ilusória 2: passagem para uma plataforma em ruínas
    const s2 = new THREE.Vector3(6, 0, 22);
    const s2y = this.terrainHeight(s2.x, s2.z);
    const mesh2 = this._box(s2.x, s2y + 1.5, s2.z, 4, 3, 1.1, '#5f6577');
    const wall2 = { id: 'secret-2', x: s2.x, z: s2.z, hw: 2, hd: 0.55, h: 3, mesh: mesh2, removed: false };
    this.walls.push(wall2);
    const secret2 = new SecretWall({ id: 'secret-wall-2', position: new THREE.Vector3(s2.x, s2y, s2.z) });
    secret2.mesh = mesh2;
    secret2.onReveal = () => { wall2.removed = true; };
    this.interactions.add(secret2);
    this._addChest('chest-secret-2', new THREE.Vector3(s2.x, 0, s2.z + 3.2), 'raro', { hidden: true, y: s2y + 0.1 });
    this.addGlowPoint(new THREE.Vector3(s2.x, s2y + 3, s2.z), '#d59bff', 2.6);

    // cache escondido na clareira (dica de exploração)
    this._addChest('chest-hidden-camp', new THREE.Vector3(-8, 0, -6), 'comum', { hidden: true });
  }

  _buildCrystals() {
    const spots = [
      [-18, -14], [-20, -8], [-26, -12], [-30, -20],
    ];
    spots.forEach(([x, z], i) => {
      const y = this.terrainHeight(x, z);
      const geo = new THREE.ConeGeometry(0.5, 2.1, 6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color('#4a6fa8'), flatShading: true, emissive: new THREE.Color('#20344f') }));
      mesh.position.set(x, y + 1.05, z);
      mesh.rotation.y = i;
      this.scene.add(mesh);
      const node = new CrystalNode({ id: `crystal-${i}`, position: new THREE.Vector3(x, y + 1.05, z), radius: 1.6, color: '#7ec8ff' });
      node.mesh = mesh;
      const point = { position: node.position.clone(), radius: 1.7, active: true, cooldown: 0, color: '#7ec8ff', onHit: () => this.lightCrystal(node) };
      node.point = point;
      this.crystals.push(point);
      this.interactions.add(node);
      this.addGlowPoint(new THREE.Vector3(x, y + 2.2, z), '#7ec8ff', 1.8);
    });
  }

  lightCrystal(node) {
    if (node.lit) return;
    node.lit = true;
    node.mesh.material.emissive = new THREE.Color('#7ec8ff');
    this.ctx?.audio?.sfx('crystal');
    const lit = this.interactions.list.filter((o) => o.type === 'crystal' && o.lit).length;
    this.ctx?.toast?.(`Cristal aceso (${lit}/4)`, '💎');
    if (lit >= 4) {
      this.ctx?.toast?.('Os quatro cristais iluminaram um esconderijo!', '✨');
      this.ctx?.effects?.ring(node.position, { color: '#7ec8ff', from: 0.5, to: 22, life: 1.2 });
      if (!this.flags.crystalCache) {
        this.flags.crystalCache = true;
        for (let i = 0; i < 4; i++) {
          this.spawnPickup(i < 3 ? 'cristal' : 'fragmento', 1, new THREE.Vector3(node.position.x + rand(-3, 3), node.position.y + 0.6, node.position.z + rand(-3, 3)));
        }
      }
    }
  }

  _buildBiomeGate() {
    const gx = 26, gz = -20;
    const gy = this.terrainHeight(gx, gz);
    // arco de pedra com portal adormecido
    for (const sx of [-1, 1]) {
      this._box(gx + sx * 3.4, gy + 3, gz, 1.3, 6, 1.3, '#5b6274');
    }
    this._box(gx, gy + 6.4, gz, 8.2, 1.2, 1.3, '#5b6274');
    this.gateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2b3560'), transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), this.gateMat);
    veil.position.set(gx, gy + 2.9, gz);
    this.scene.add(veil);
    this.biomeVeil = veil;
    this.gateGlow = this.addGlowPoint(new THREE.Vector3(gx, gy + 3, gz), '#7ec8ff', 2);
    this.gateGlow.material.opacity = 0.15;
    this.anim.push({ kind: 'gate', veil, glow: this.gateGlow });
    const gate = new Interactable({
      id: 'biome-gate', type: 'gate', position: new THREE.Vector3(gx, gy, gz), radius: 3.4,
      label: 'Sentir a passagem adormecida',
    });
    gate.interact = (ctx) => {
      if (this.flags.altarLit) {
        ctx.toast?.('A passagem despertou! Os próximos biomas estão sendo preparados — volte em breve.', '🌈');
        ctx.audio?.sfx('quest');
      } else {
        ctx.toast?.('Uma passagem antiga dorme aqui. Acenda o Altar da Clareira Antiga para despertá-la.', '🌫');
        ctx.audio?.sfx('hurtSoft');
      }
      return true;
    };
    this.interactions.add(gate);
    // inscrição de aviso
  }

  _buildInscriptions() {
    const defs = [
      { id: 'insc-camp', x: 8, z: -6, title: 'Pedra do acampamento', text: 'Aqui, quem tem medo descansa até o medo virar curiosidade. A lanterna é feita de coragem que aprendeu a brilhar.' },
      { id: 'insc-ruins', x: -16, z: -14, title: 'Muralha da torre', text: 'O Guardião Antigo não é mau: ele só esqueceu que podia descansar. Ilumine o cristal do peito quando ele baixar os braços.' },
      { id: 'insc-pond', x: -22, z: 6, title: 'Pedra do lago', text: 'As luzes do fundo do lago ricocheteiam em cristais. Quatro cristais acesos revelam o que estava escondido.' },
      { id: 'insc-altar', x: -6, z: -30, title: 'Altar da Clareira Antiga', text: 'Três fragmentos mágicos acendem este altar. A escuridão guarda memórias: com luz, elas viram histórias.' },
    ];
    for (const d of defs) {
      const y = this.terrainHeight(d.x, d.z);
      const mesh = this._box(d.x, y + 0.9, d.z, 0.5, 1.8, 0.5, '#6b7186');
      mesh.rotation.y = rand(0, 3);
      const insc = new Inscription({ id: d.id, position: new THREE.Vector3(d.x, y, d.z), title: d.title, text: d.text });
      this.interactions.add(insc);
      this.addGlowPoint(new THREE.Vector3(d.x, y + 2, d.z), '#d59bff', 1.4);
      // as inscrições escondidas só aparecem com Revelação
      if (d.id === 'insc-pond' || d.id === 'insc-altar') {
        insc.hidden = true;
        insc.revealed = false;
        mesh.material.transparent = true;
        mesh.material.opacity = 0.35;
      }
    }

    // Altar da Clareira Antiga (interação especial)
    const ax = -2, az = -34;
    const ay = this.terrainHeight(ax, az);
    const altar = new Interactable({ id: 'altar', type: 'altar', position: new THREE.Vector3(ax, ay, az + 2.4), radius: 3.2, label: 'Acender o Altar com 3 fragmentos' });
    altar.interact = (ctx) => {
      if (this.flags.altarLit) {
        ctx.toast?.('O altar já está aceso. A escuridão aqui virou memória.', '💫');
        return true;
      }
      if (!ctx.inventory.has('fragmento', 3)) {
        ctx.toast?.(`O altar pede 3 fragmentos mágicos (você tem ${ctx.inventory.count('fragmento')}).`, '✨');
        ctx.audio?.sfx('hurtSoft');
        return false;
      }
      ctx.inventory.remove('fragmento', 3);
      this.flags.altarLit = true;
      this.altarCrystalMat.color.set('#7cf0a8');
      this.altarGlow.material.opacity = 0.9;
      ctx.audio?.sfx('levelup');
      ctx.effects?.burst(new THREE.Vector3(ax, ay + 3.4, az), { color: '#7cf0a8', count: 60, speed: 7, size: 0.4, life: 1.6, gravity: 0.6 });
      ctx.effects?.ring(new THREE.Vector3(ax, ay + 0.4, az), { color: '#7cf0a8', from: 1, to: 16, life: 1.2 });
      ctx.give('cristal', 8);
      ctx.give('manobra_flutuar', 1);
      ctx.quests?.event('altar', {});
      ctx.toast?.('O altar acendeu! Fragmentos de memória iluminam a clareira.', '💫');
      ctx.events?.emit('world:altar', {});
      return true;
    };
    this.interactions.add(altar);
  }

  _buildNPCs() {
    const lumi = new NPC('lumi', NPC_DEFS.lumi, new THREE.Vector3(4, this.terrainHeight(4, 3), 3), this.deps);
    lumi.group.position.y += 0.6;
    const mila = new NPC('mila', NPC_DEFS.mila, new THREE.Vector3(-4.5, this.terrainHeight(-4.5, 2.5), 2.5), this.deps);
    const teo = new NPC('teo', NPC_DEFS.teo, new THREE.Vector3(-27.5, this.terrainHeight(-27.5, -25), -25), this.deps);
    this.npcs = [lumi, mila, teo];
    for (const npc of this.npcs) {
      this.scene.add(npc.group);
      // cada NPC é um ponto de conversa (o indicador aparece ao se aproximar)
      const talk = new Interactable({
        id: `npc-${npc.id}`, type: 'npc', position: npc.position.clone(), radius: 3.1,
        label: `Conversar com ${npc.def.name.split(',')[0]}`,
      });
      talk.interact = (ctx) => { ctx.events.emit('npc:talk', { id: npc.id }); return true; };
      talk.update = () => { talk.position.copy(npc.position); };
      npc.talkTarget = talk;
      this.interactions.add(talk);
    }
  }

  _buildEnemies() {
    const spawn = (type, x, z, opts) => {
      const y = this.terrainHeight(x, z);
      this.spawnDefs.push({ type, position: new THREE.Vector3(x, y, z), opts: opts || {} });
    };
    // sombras travessas
    [[-10, 20], [14, 14], [-30, 4], [26, -6], [8, -26], [-36, -12], [30, 14], [-24, 28]].forEach(([x, z]) => spawn('sombra', x, z));
    // grupos de cogumelos saltitantes
    [[12, 8], [15, 10], [16, -8], [18, -10], [-20, 20], [-22, 21], [-32, -26], [-33, -24]].forEach(([x, z], i) => spawn('cogumelo', x, z, { group: Math.floor(i / 2) }));
    // espíritos brincalhões perto do lago e das ruínas
    [[-22, 14], [-12, 6], [-14, -20]].forEach(([x, z]) => spawn('espirito', x, z));
  }

  /** Instancia os inimigos a partir dos pontos definidos (chamado pelo jogo). */
  populate(enemyManager) {
    for (const def of this.spawnDefs) enemyManager.addSpawn(def.type, def.position, def.opts);
  }

  // -------------------------------------------------------------- update
  update(dt, ctx) {
    this.ctx = ctx;
    this.tick += dt;
    const t = this.tick;
    // fogueira
    if (this.flame) {
      const f = 1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 17.3) * 0.05;
      this.flame.scale.set(f, 1 + Math.sin(t * 12) * 0.12, f);
      this.fireLight.intensity = 3.2 * f;
    }
    // água
    if (this.pond) this.pond.position.y = this.terrainHeight(-16, 9) + 0.35 + Math.sin(t * 0.8) * 0.04;
    // vaga-lumes
    if (this.fireflies) {
      const pos = this.fireflies.geo.attributes.position;
      this.fireflies.data.forEach((d, i) => {
        pos.setXYZ(i,
          d.base.x + Math.cos(t * d.speed + d.phase) * d.radius,
          d.base.y + Math.sin(t * d.speed * 1.6 + d.phase) * 0.7,
          d.base.z + Math.sin(t * d.speed * 0.8 + d.phase) * d.radius);
      });
      pos.needsUpdate = true;
    }
    // animações utilitárias
    for (const a of this.anim) {
      if (a.kind === 'glow') {
        a.sprite.material.opacity = 0.35 + Math.sin(t * 1.4 + a.phase) * 0.14;
        a.sprite.position.y = a.base.y + Math.sin(t * 0.9 + a.phase) * 0.12;
      } else if (a.kind === 'flowerGlow') {
        a.sprite.material.opacity = a.flower.bloomed
          ? 0.55 + Math.sin(t * 2 + a.phase) * 0.2
          : 0.08;
      } else if (a.kind === 'altar') {
        a.crystal.rotation.y += dt * (this.flags.altarLit ? 1.6 : 0.35);
        if (!this.flags.altarLit) a.glow.material.opacity = 0.06 + Math.sin(t * 1.2) * 0.03;
      } else if (a.kind === 'gate') {
        const awake = this.flags.altarLit;
        a.veil.material.opacity = awake ? 0.45 + Math.sin(t * 2) * 0.15 : 0.4;
        a.veil.material.color.set(awake ? '#7ec8ff' : '#2b3560');
        a.glow.material.opacity = awake ? 0.7 : 0.15;
        a.veil.rotation.y = Math.sin(t * 0.4) * 0.12;
      } else if (a.kind === 'sink') {
        a.t = Math.min(1, a.t + dt);
        a.mesh.position.y -= dt * 2.2;
        a.mesh.material.transparent = true;
        a.mesh.material.opacity = 1 - a.t * 0.7;
      }
    }
    // brilho das plantas conforme a intensidade de efeitos
    if (this.plantGlow) this.plantGlow.material.opacity = 0.35 + this.deps.settings.get('fx') * 0.5;
    // recarga dos cristais refletores
    for (const c of this.crystals) c.cooldown = Math.max(0, c.cooldown - dt);
    // luz conforme brilho escolhido
    if (this.lights) {
      const b = clamp(this.deps.settings.get('brightness'), 0.6, 1.6);
      this.lights.hemi.intensity = 0.5 * b;
      this.lights.moon.intensity = 0.22 * b;
    }
  }

  /** Visão geral para o mapa completo. */
  mapData() {
    const points = [];
    const push = (obj, icon, color) => points.push({
      x: obj.position.x, z: obj.position.z, icon, color,
      hidden: !!(obj.hidden && !obj.revealed),
    });
    for (const obj of this.interactions.list) {
      if (obj.type === 'chest') push(obj, obj.tier === 'secreto' ? '🎁' : '📦', obj.opened ? '#7a8296' : '#ffd479');
      else if (obj.type === 'checkpoint') push(obj, '🔥', '#ffb45c');
      else if (obj.type === 'altar') push(obj, '💫', this.flags.altarLit ? '#7cf0a8' : '#7a8296');
      else if (obj.type === 'gate') push(obj, '🌈', this.flags.altarLit ? '#7ec8ff' : '#7a8296');
      else if (obj.type === 'npc') push(obj, '💬', '#9ee7ff');
      else if (obj.type === 'flower' && !obj.bloomed) push(obj, '🌸', '#7cf0a8');
    }
    return points;
  }

  serialize() {
    return {
      interactions: this.interactions.serialize(),
      flags: { ...this.flags },
      respawn: this.respawn.toArray(),
      gates: this.stoneGates.map((g) => ({ id: g.id, removed: g.removed })),
      boss: this.deps.miniboss?.serialize?.() || null,
    };
  }

  load(data = {}) {
    if (!data) return;
    this.interactions.load(data.interactions || []);
    this.flags = { ...(data.flags || {}) };
    if (data.respawn) this.respawn.fromArray(data.respawn);
    for (const g of data.gates || []) {
      const gate = this.stoneGates.find((x) => x.id === g.id);
      if (!gate) continue;
      if (g.removed) {
        gate.removed = true;
        if (gate.wall) { gate.wall.removed = true; if (gate.wall.mesh) gate.wall.mesh.visible = false; }
        if (gate.brambleMesh) gate.brambleMesh.visible = false;
        if (gate.bridgeMesh) gate.bridgeMesh.visible = true;
        if (gate.platform) gate.platform.removed = false;
      }
    }
    if (this.flags.altarLit) {
      this.altarCrystalMat?.color.set('#7cf0a8');
      if (this.altarGlow) this.altarGlow.material.opacity = 0.9;
    }
    this.deps.miniboss?.load?.(data.boss);
  }
}
