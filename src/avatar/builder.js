// Construtor 3D dos avatares: personagens fofos montados com primitivas
// (sem modelos externos), com rig compatível com as animações do Player
// (body / torso / head / face / armL / armR / legL / legR / handSocket).
//
// Frente do personagem = -Z (mesma convenção da lanterna e da câmera).

import * as THREE from 'three';
import { itemById, DEFAULT_AVATAR } from './catalog.js';

const WHITE = '#ffffff';
const EYE = '#232a3f';

const shade = (hex, amount) => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return c;
};

function makeRig() {
  return { materials: [], parts: {}, updaters: [], disposables: [] };
}

/** Material Lambert padrão do avatar (com emissivo para o flash de dano). */
function skin(rig, color, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true, ...opts });
  rig.materials.push(m);
  return m;
}

function mesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = false;
  return m;
}

// ------------------------------------------------------------------ rosto
function bigEyes(rig, { spread = 0.13, y = 0.04, z = -0.29, size = 0.105, pupil = 0.052, expression = 'feliz' }) {
  const g = new THREE.Group();
  const whiteMat = skin(rig, WHITE);
  const pupilMat = skin(rig, EYE);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(size, 14, 12), whiteMat);
    eye.position.set(s * spread, y, z);
    g.add(eye);
    const isLeft = s < 0;
    const pupilMesh = mesh(new THREE.SphereGeometry(pupil, 10, 8), pupilMat);
    pupilMesh.position.set(s * spread * 1.03, y + 0.002, z - size * 0.72);
    g.add(pupilMesh);
    const shine = mesh(new THREE.SphereGeometry(pupil * 0.42, 8, 6), shineMat);
    shine.position.set(s * spread * 1.08, y + pupil * 0.55, z - size * 0.95);
    g.add(shine);

    if (expression === 'sonolento') {
      const lid = mesh(new THREE.BoxGeometry(size * 2.1, size * 1.9, size * 0.5), skin(rig, '#f4c9b6'));
      lid.position.set(s * spread, y + 0.004, z - size * 0.42);
      lid.rotation.z = s * 0.12;
      g.add(lid);
    } else if (expression === 'timido') {
      const lid = mesh(new THREE.SphereGeometry(size * 1.02, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), skin(rig, '#f4c9b6'));
      lid.position.set(s * spread, y + size * 0.18, z);
      g.add(lid);
    } else if (expression === 'confiante' && isLeft) {
      pupilMesh.scale.y = 0.7;
      const brow = mesh(new THREE.BoxGeometry(size * 1.9, size * 0.34, size * 0.3), skin(rig, EYE));
      brow.position.set(s * spread, y + size * 1.5, z - size * 0.5);
      brow.rotation.z = -0.28;
      g.add(brow);
    } else if (expression === 'surpreso') {
      eye.scale.setScalar(1.18);
      pupilMesh.scale.setScalar(0.8);
    }
  }
  return g;
}

function mouth(rig, expression = 'feliz', { y = -0.13, z = -0.34 } = {}) {
  const g = new THREE.Group();
  const dark = skin(rig, '#7a3b4a');
  const tongue = skin(rig, '#ff9aa8');
  if (expression === 'surpreso' || expression === 'sonolento') {
    const o = mesh(new THREE.TorusGeometry(0.045, 0.018, 6, 12), dark);
    o.position.set(0, y, z);
    g.add(o);
  } else {
    const smile = mesh(new THREE.TorusGeometry(0.075, 0.021, 6, 12, Math.PI), dark);
    smile.position.set(0, y, z);
    smile.rotation.z = Math.PI;
    g.add(smile);
    if (expression === 'feliz') {
      const t = mesh(new THREE.SphereGeometry(0.035, 8, 6), tongue);
      t.position.set(0, y - 0.012, z + 0.012);
      t.scale.set(1, 0.6, 0.6);
      g.add(t);
    }
    if (expression === 'confiante') {
      smile.rotation.z = Math.PI + 0.34;
      smile.position.x = 0.035;
    }
  }
  return g;
}

function blush(rig, { spread = 0.21, y = -0.06, z = -0.3, strength = 0.5 }) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff9db4, transparent: true, opacity: strength });
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.CircleGeometry(0.055, 12), mat);
    b.position.set(s * spread, y, z - 0.02);
    b.lookAt(new THREE.Vector3(s * spread, y, z - 3));
    g.add(b);
  }
  return g;
}

// ------------------------------------------------------------------ cabelos
function buildHair(rig, style, color, headR) {
  const g = new THREE.Group();
  if (style === 'nenhum') return g;
  const hairMat = skin(rig, color);
  const y = headR * 0.55;
  switch (style) {
    case 'franja': {
      const cap = mesh(new THREE.SphereGeometry(headR * 1.03, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      cap.position.y = headR * 0.18;
      cap.scale.set(1, 1.05, 1);
      g.add(cap);
      const fringe = mesh(new THREE.SphereGeometry(headR * 0.62, 12, 10), hairMat);
      fringe.position.set(0, y * 0.55, -headR * 0.62);
      fringe.scale.set(1.25, 0.55, 0.7);
      g.add(fringe);
      break;
    }
    case 'maria': {
      for (const s of [-1, 1]) {
        const puff = mesh(new THREE.SphereGeometry(headR * 0.34, 12, 10), hairMat);
        puff.position.set(s * headR * 0.86, y * 0.5, 0.02);
        g.add(puff);
        const tie = mesh(new THREE.TorusGeometry(headR * 0.16, headR * 0.06, 6, 10), skin(rig, '#ff8fb0'));
        tie.position.set(s * headR * 0.7, y * 0.62, 0.02);
        tie.rotation.y = Math.PI / 2;
        g.add(tie);
      }
      const cap = mesh(new THREE.SphereGeometry(headR * 1.02, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat);
      cap.position.y = headR * 0.22;
      g.add(cap);
      break;
    }
    case 'topete': {
      const tuft = mesh(new THREE.ConeGeometry(headR * 0.24, headR * 0.75, 8), hairMat);
      tuft.position.set(0, headR * 0.95, -headR * 0.06);
      tuft.rotation.x = -0.35;
      g.add(tuft);
      const base = mesh(new THREE.SphereGeometry(headR * 1.0, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hairMat);
      base.position.y = headR * 0.3;
      g.add(base);
      break;
    }
    case 'cacheado': {
      const base = mesh(new THREE.SphereGeometry(headR * 1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      base.position.y = headR * 0.26;
      g.add(base);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const curl = mesh(new THREE.SphereGeometry(headR * 0.24, 10, 8), hairMat);
        curl.position.set(Math.cos(a) * headR * 0.85, headR * 0.35 + Math.sin(i) * 0.04, Math.sin(a) * headR * 0.7);
        g.add(curl);
      }
      break;
    }
    case 'espetado': {
      const base = mesh(new THREE.SphereGeometry(headR * 1.01, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      base.position.y = headR * 0.24;
      g.add(base);
      for (let i = 0; i < 6; i++) {
        const a = -0.9 + i * 0.36;
        const spike = mesh(new THREE.ConeGeometry(headR * 0.18, headR * 0.9, 6), hairMat);
        spike.position.set(Math.sin(a) * headR * 0.5, headR * 0.95 + (i % 2) * 0.06, Math.cos(a) * headR * 0.35 - 0.1);
        spike.rotation.set(-0.5 + Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.7);
        g.add(spike);
      }
      break;
    }
    case 'coque': {
      const bun = mesh(new THREE.SphereGeometry(headR * 0.34, 12, 10), hairMat);
      bun.position.y = headR * 1.05;
      g.add(bun);
      const band = mesh(new THREE.TorusGeometry(headR * 0.22, headR * 0.06, 6, 12), skin(rig, '#ffd479'));
      band.position.y = headR * 0.82;
      band.rotation.x = Math.PI / 2;
      g.add(band);
      const cap = mesh(new THREE.SphereGeometry(headR * 1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
      cap.position.y = headR * 0.26;
      g.add(cap);
      break;
    }
    case 'laco': {
      const bowMat = skin(rig, '#ff8fb0');
      for (const s of [-1, 1]) {
        const loop = mesh(new THREE.SphereGeometry(headR * 0.22, 10, 8), bowMat);
        loop.position.set(s * headR * 0.34, headR * 0.9, 0);
        loop.scale.set(1.2, 0.8, 0.55);
        g.add(loop);
      }
      const knot = mesh(new THREE.SphereGeometry(headR * 0.1, 8, 6), bowMat);
      knot.position.y = headR * 0.9;
      g.add(knot);
      break;
    }
    default: break;
  }
  return g;
}

// ------------------------------------------------------------------ chapéus
function buildHeadItem(rig, style, headR) {
  const g = new THREE.Group();
  switch (style) {
    case 'gorro': {
      const cap = mesh(new THREE.SphereGeometry(headR * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), skin(rig, '#ff8f6b'));
      cap.position.y = headR * 0.22;
      g.add(cap);
      const brim = mesh(new THREE.TorusGeometry(headR * 1.03, headR * 0.1, 8, 18), skin(rig, '#ffe6d6'));
      brim.position.y = headR * 0.24;
      brim.rotation.x = Math.PI / 2;
      g.add(brim);
      const pom = mesh(new THREE.SphereGeometry(headR * 0.16, 10, 8), skin(rig, '#fff6ee'));
      pom.position.y = headR * 1.02;
      g.add(pom);
      break;
    }
    case 'cogumelo': {
      const capMat = skin(rig, '#ff7b7b');
      const cap = mesh(new THREE.SphereGeometry(headR * 1.18, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat);
      cap.position.y = headR * 0.5;
      cap.scale.y = 0.8;
      g.add(cap);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.4;
        const dot = mesh(new THREE.SphereGeometry(headR * 0.13, 8, 6), skin(rig, '#fff6ee'));
        dot.position.set(Math.cos(a) * headR * 0.7, headR * 0.82, Math.sin(a) * headR * 0.6);
        dot.scale.y = 0.5;
        g.add(dot);
      }
      break;
    }
    case 'capacete': {
      const cap = mesh(new THREE.SphereGeometry(headR * 1.06, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), skin(rig, '#f2c86b'));
      cap.position.y = headR * 0.34;
      g.add(cap);
      const brim = mesh(new THREE.CylinderGeometry(headR * 1.32, headR * 1.32, headR * 0.09, 20), skin(rig, '#d9a94c'));
      brim.position.y = headR * 0.34;
      g.add(brim);
      const lamp = mesh(new THREE.SphereGeometry(headR * 0.14, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
      lamp.position.set(0, headR * 0.66, -headR * 0.9);
      g.add(lamp);
      break;
    }
    case 'pirata': {
      const straw = skin(rig, '#f0d48a');
      const dome = mesh(new THREE.SphereGeometry(headR * 0.95, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), straw);
      dome.position.y = headR * 0.45;
      g.add(dome);
      const brim = mesh(new THREE.CylinderGeometry(headR * 1.5, headR * 1.5, headR * 0.08, 22), straw);
      brim.position.y = headR * 0.45;
      g.add(brim);
      const band = mesh(new THREE.CylinderGeometry(headR * 0.97, headR * 0.97, headR * 0.14, 16), skin(rig, '#d14444'));
      band.position.y = headR * 0.52;
      g.add(band);
      break;
    }
    case 'bandana': {
      const band = mesh(new THREE.CylinderGeometry(headR * 1.03, headR * 1.03, headR * 0.32, 18, 1, true), skin(rig, '#3f7fd6'));
      band.position.y = headR * 0.45;
      g.add(band);
      const plate = mesh(new THREE.BoxGeometry(headR * 0.66, headR * 0.3, headR * 0.1), skin(rig, '#c9d3e4', { metalness: 0 }));
      plate.position.set(0, headR * 0.45, -headR * 0.98);
      g.add(plate);
      const knot = mesh(new THREE.SphereGeometry(headR * 0.14, 8, 6), skin(rig, '#3f7fd6'));
      knot.position.set(0, headR * 0.5, headR * 0.95);
      g.add(knot);
      break;
    }
    case 'bruxa': {
      const purple = skin(rig, '#6f5bd0');
      const cone = mesh(new THREE.ConeGeometry(headR * 0.95, headR * 2.1, 16), purple);
      cone.position.set(0, headR * 1.35, 0.02);
      cone.rotation.z = 0.16;
      g.add(cone);
      const brim = mesh(new THREE.CylinderGeometry(headR * 1.6, headR * 1.6, headR * 0.1, 22), skin(rig, '#55459e'));
      brim.position.y = headR * 0.5;
      g.add(brim);
      const ribbon = mesh(new THREE.TorusGeometry(headR * 0.6, headR * 0.07, 6, 14), skin(rig, '#ffd479'));
      ribbon.position.y = headR * 0.85;
      ribbon.rotation.x = Math.PI / 2;
      g.add(ribbon);
      break;
    }
    case 'coroa': {
      const gold = skin(rig, '#ffd479');
      const ring = mesh(new THREE.TorusGeometry(headR * 0.72, headR * 0.09, 8, 20), gold);
      ring.position.y = headR * 0.62;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(headR * 0.14, headR * 0.42, 6), gold);
        spike.position.set(Math.cos(a) * headR * 0.72, headR * 0.85, Math.sin(a) * headR * 0.72);
        g.add(spike);
      }
      const gem = mesh(new THREE.IcosahedronGeometry(headR * 0.14, 0), new THREE.MeshBasicMaterial({ color: 0xff9be8 }));
      gem.position.set(0, headR * 0.66, -headR * 0.7);
      g.add(gem);
      rig.updaters.push((dt, t) => { gem.rotation.y += dt * 2; gem.position.y = headR * 0.66 + Math.sin(t * 2) * 0.02; });
      break;
    }
    default: break;
  }
  return g;
}

// ------------------------------------------------------------------ rosto (acessórios)
function buildFaceItem(rig, style, headR) {
  const g = new THREE.Group();
  const z = -headR * 0.92;
  switch (style) {
    case 'redondo': {
      const frame = skin(rig, '#3b4666');
      for (const s of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(headR * 0.28, headR * 0.05, 6, 16), frame);
        ring.position.set(s * headR * 0.34, headR * 0.1, z);
        g.add(ring);
        const glass = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.35 });
        const lens = mesh(new THREE.CircleGeometry(headR * 0.24, 16), glass);
        lens.position.set(s * headR * 0.34, headR * 0.1, z - 0.005);
        g.add(lens);
      }
      const bridge = mesh(new THREE.BoxGeometry(headR * 0.18, headR * 0.04, headR * 0.04), frame);
      bridge.position.set(0, headR * 0.11, z);
      g.add(bridge);
      break;
    }
    case 'escuros': {
      const frame = skin(rig, '#262b3d');
      for (const s of [-1, 1]) {
        const lens = mesh(new THREE.BoxGeometry(headR * 0.5, headR * 0.34, headR * 0.08), frame);
        lens.position.set(s * headR * 0.34, headR * 0.1, z);
        g.add(lens);
        const glint = mesh(new THREE.BoxGeometry(headR * 0.1, headR * 0.26, headR * 0.02), new THREE.MeshBasicMaterial({ color: 0x8fb8ff }));
        glint.position.set(s * headR * 0.46, headR * 0.14, z - 0.05);
        g.add(glint);
      }
      const bridge = mesh(new THREE.BoxGeometry(headR * 0.2, headR * 0.05, headR * 0.05), frame);
      bridge.position.set(0, headR * 0.14, z);
      g.add(bridge);
      break;
    }
    case 'venda': {
      const band = mesh(new THREE.CylinderGeometry(headR * 1.04, headR * 1.04, headR * 0.42, 20, 1, true),
        skin(rig, '#e8e2d2', { side: THREE.DoubleSide }));
      band.position.y = headR * 0.16;
      g.add(band);
      const knot = mesh(new THREE.SphereGeometry(headR * 0.12, 8, 6), skin(rig, '#d6cfbd'));
      knot.position.set(0, headR * 0.2, headR * 0.98);
      g.add(knot);
      break;
    }
    case 'scouter': {
      const lens = mesh(new THREE.SphereGeometry(headR * 0.34, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7cf0a8, transparent: true, opacity: 0.72 }));
      lens.position.set(-headR * 0.38, headR * 0.12, z);
      lens.scale.set(1, 0.75, 0.35);
      g.add(lens);
      const clip = mesh(new THREE.BoxGeometry(headR * 0.16, headR * 0.1, headR * 0.5), skin(rig, '#3b4666'));
      clip.position.set(-headR * 0.85, headR * 0.12, -z * 0.2);
      g.add(clip);
      const dot = mesh(new THREE.SphereGeometry(headR * 0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6b6b }));
      dot.position.set(-headR * 0.38, headR * 0.24, z - headR * 0.2);
      g.add(dot);
      rig.updaters.push((dt, t) => { dot.material.opacity = 0.5 + Math.sin(t * 6) * 0.5; dot.material.transparent = true; });
      break;
    }
    case 'mascara': {
      const mask = mesh(new THREE.BoxGeometry(headR * 1.12, headR * 0.5, headR * 0.14), skin(rig, '#2f3550'));
      mask.position.set(0, headR * 0.1, z + headR * 0.06);
      g.add(mask);
      for (const s of [-1, 1]) {
        const hole = mesh(new THREE.CircleGeometry(headR * 0.14, 12), new THREE.MeshBasicMaterial({ color: 0x0d1020 }));
        hole.position.set(s * headR * 0.34, headR * 0.12, z - 0.01);
        g.add(hole);
      }
      break;
    }
    case 'cicatriz': {
      const scar = skin(rig, '#c46a6a');
      for (let i = 0; i < 2; i++) {
        const line = mesh(new THREE.BoxGeometry(headR * 0.03, headR * 0.3, headR * 0.02), scar);
        line.position.set(headR * 0.5 - i * headR * 0.07, -headR * 0.12 + i * headR * 0.05, z + headR * 0.02);
        line.rotation.z = 0.4;
        g.add(line);
      }
      break;
    }
    case 'faixa': {
      const band = mesh(new THREE.CylinderGeometry(headR * 1.05, headR * 1.05, headR * 0.24, 18, 1, true),
        skin(rig, '#8fe4c8', { side: THREE.DoubleSide }));
      band.position.y = -headR * 0.34;
      g.add(band);
      const tails = mesh(new THREE.BoxGeometry(headR * 0.16, headR * 0.5, headR * 0.06), skin(rig, '#8fe4c8'));
      tails.position.set(headR * 0.6, -headR * 0.6, headR * 0.6);
      tails.rotation.z = 0.35;
      g.add(tails);
      break;
    }
    default: break;
  }
  return g;
}

// ------------------------------------------------------------------ costas
function buildBackItem(rig, style, color, sizes) {
  const g = new THREE.Group();
  const { bodyR = 0.4, torsoY = 1.1 } = sizes;
  switch (style) {
    case 'mochila': {
      const bag = mesh(new THREE.BoxGeometry(bodyR * 1.2, bodyR * 1.25, bodyR * 0.7), skin(rig, '#7a6a58'));
      bag.position.set(0, torsoY, bodyR * 0.9);
      g.add(bag);
      const flap = mesh(new THREE.BoxGeometry(bodyR * 1.24, bodyR * 0.36, bodyR * 0.74), skin(rig, '#9b8871'));
      flap.position.set(0, torsoY + bodyR * 0.45, bodyR * 0.9);
      g.add(flap);
      const strap = skin(rig, '#5c4f42');
      for (const s of [-1, 1]) {
        const st = mesh(new THREE.BoxGeometry(bodyR * 0.16, bodyR * 1.4, bodyR * 0.12), strap);
        st.position.set(s * bodyR * 0.5, torsoY + bodyR * 0.2, -bodyR * 0.55);
        g.add(st);
      }
      break;
    }
    case 'asas': {
      const wingMat = new THREE.MeshBasicMaterial({ color: 0xbdf0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const wing = mesh(new THREE.CircleGeometry(bodyR * 1.15, 16), wingMat);
        wing.position.set(s * bodyR * 0.9, torsoY + bodyR * 0.35, bodyR * 0.75);
        wing.rotation.set(0, s * 0.6, s * 0.3);
        wing.scale.set(1, 1.35, 1);
        g.add(wing);
      }
      rig.updaters.push((dt, t) => {
        g.children.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.3 + Math.sin(t * 4) * 0.14); });
      });
      break;
    }
    case 'capa': {
      const cape = mesh(new THREE.ConeGeometry(bodyR * 1.5, bodyR * 2.6, 12, 1, true), skin(rig, color, { side: THREE.DoubleSide }));
      cape.position.set(0, torsoY - bodyR * 0.2, bodyR * 0.55);
      cape.rotation.x = 0.12;
      g.add(cape);
      break;
    }
    case 'vassoura': {
      const shaft = mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.7, 8), skin(rig, '#8a5a34'));
      shaft.position.set(bodyR * 0.8, torsoY - 0.15, bodyR * 0.7);
      shaft.rotation.z = 0.5;
      g.add(shaft);
      const brush = mesh(new THREE.ConeGeometry(0.18, 0.5, 10), skin(rig, '#e0c06a'));
      brush.position.set(bodyR * 1.2, torsoY - 0.75, bodyR * 0.7);
      brush.rotation.z = 0.5;
      g.add(brush);
      break;
    }
    case 'bolsa': {
      const bag = mesh(new THREE.BoxGeometry(bodyR * 0.8, bodyR * 0.62, bodyR * 0.4), skin(rig, '#c98d5c'));
      bag.position.set(bodyR * 0.75, torsoY - bodyR * 0.45, bodyR * 0.55);
      g.add(bag);
      const strap = mesh(new THREE.TorusGeometry(bodyR * 0.62, bodyR * 0.05, 6, 14, Math.PI), skin(rig, '#8a5a34'));
      strap.position.set(0, torsoY + bodyR * 0.1, bodyR * 0.2);
      strap.rotation.set(0, 0, 0.3);
      g.add(strap);
      break;
    }
    case 'esferas': {
      const stars = [];
      for (let i = 0; i < 4; i++) {
        const orb = new THREE.Group();
        const ball = mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffc45c }));
        orb.add(ball);
        for (let s = 0; s < 2; s++) {
          const star = mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4b5c }));
          star.position.set((s ? 1 : -1) * 0.04, 0.03, -0.09);
          orb.add(star);
        }
        g.add(orb);
        stars.push(orb);
      }
      rig.updaters.push((dt, t) => {
        stars.forEach((orb, i) => {
          const a = t * 1.1 + (i / stars.length) * Math.PI * 2;
          orb.position.set(Math.cos(a) * (bodyR + 0.45), torsoY + 0.3 + Math.sin(t * 1.6 + i) * 0.16, Math.sin(a) * (bodyR + 0.45));
        });
      });
      break;
    }
    default: break;
  }
  return g;
}

// ------------------------------------------------------------------ aura
function buildAura(rig, aura, sizes) {
  const g = new THREE.Group();
  if (!aura || aura.id === 'nenhum') return g;
  const color = aura.color || '#ffffff';
  const { bodyR = 0.4, torsoY = 1.1 } = sizes;
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = mesh(new THREE.RingGeometry(bodyR * 0.9, bodyR * 1.25, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);

  const orbs = [];
  const count = aura.id === 'estelar' ? 10 : 6;
  for (let i = 0; i < count; i++) {
    const orb = mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.012, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(orb);
    orbs.push(orb);
  }
  rig.updaters.push((dt, t) => {
    ring.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
    ringMat.opacity = 0.28 + Math.sin(t * 2) * 0.12;
    orbs.forEach((orb, i) => {
      const a = t * 0.9 + (i / orbs.length) * Math.PI * 2;
      const r = bodyR * 0.95 + Math.sin(t * 1.7 + i) * 0.12;
      orb.position.set(Math.cos(a) * r, 0.35 + ((i / orbs.length) * 1.7) + Math.sin(t * 2.2 + i) * 0.1, Math.sin(a) * r);
    });
  });
  return g;
}

// ------------------------------------------------------------------ roupas
function buildOutfit(rig, item, color, sizes) {
  const g = new THREE.Group();
  const style = item?.style || 'nenhum';
  if (style === 'nenhum') return g;
  const { bodyR = 0.4, torsoY = 1.1, torsoH = 0.95 } = sizes;
  const cloth = () => skin(rig, color);
  const accent = skin(rig, shade(color, -0.14));

  switch (style) {
    case 'veste': {
      const vest = mesh(new THREE.CylinderGeometry(bodyR * 1.02, bodyR * 1.1, torsoH * 0.72, 16, 1, true), cloth());
      vest.position.y = torsoY;
      g.add(vest);
      const pocket = mesh(new THREE.BoxGeometry(bodyR * 0.5, bodyR * 0.34, bodyR * 0.1), accent);
      pocket.position.set(0, torsoY - bodyR * 0.18, -bodyR * 0.92);
      g.add(pocket);
      break;
    }
    case 'casaco': {
      const coat = mesh(new THREE.CylinderGeometry(bodyR * 1.08, bodyR * 1.2, torsoH * 0.95, 16, 1, true), cloth());
      coat.position.y = torsoY - 0.04;
      g.add(coat);
      const collar = mesh(new THREE.TorusGeometry(bodyR * 0.92, bodyR * 0.09, 8, 18), accent);
      collar.position.y = torsoY + torsoH * 0.42;
      collar.rotation.x = Math.PI / 2;
      g.add(collar);
      const button = mesh(new THREE.SphereGeometry(bodyR * 0.06, 8, 6), skin(rig, '#ffd479'));
      button.position.set(0, torsoY - 0.02, -bodyR * 1.02);
      g.add(button);
      break;
    }
    case 'vestido': {
      const bodice = mesh(new THREE.CylinderGeometry(bodyR * 0.98, bodyR * 1.06, torsoH * 0.6, 16, 1, true), cloth());
      bodice.position.y = torsoY + torsoH * 0.1;
      g.add(bodice);
      const skirt = mesh(new THREE.ConeGeometry(bodyR * 1.5, torsoH * 0.85, 18, 1, true), cloth());
      skirt.position.y = torsoY - torsoH * 0.42;
      g.add(skirt);
      const hem = mesh(new THREE.TorusGeometry(bodyR * 1.48, bodyR * 0.05, 6, 20), accent);
      hem.position.y = torsoY - torsoH * 0.84;
      hem.rotation.x = Math.PI / 2;
      g.add(hem);
      break;
    }
    case 'uniforme': {
      const top = mesh(new THREE.CylinderGeometry(bodyR * 1.02, bodyR * 1.06, torsoH * 0.78, 16, 1, true), cloth());
      top.position.y = torsoY;
      g.add(top);
      const belt = mesh(new THREE.CylinderGeometry(bodyR * 1.09, bodyR * 1.09, bodyR * 0.16, 16, 1, true), accent);
      belt.position.y = torsoY - torsoH * 0.34;
      g.add(belt);
      const collar = mesh(new THREE.TorusGeometry(bodyR * 0.86, bodyR * 0.07, 6, 16), skin(rig, '#ffffff'));
      collar.position.y = torsoY + torsoH * 0.4;
      collar.rotation.x = Math.PI / 2;
      g.add(collar);
      break;
    }
    case 'armadura': {
      const plate = mesh(new THREE.CylinderGeometry(bodyR * 1.1, bodyR * 1.06, torsoH * 0.6, 8, 1, true), skin(rig, color));
      plate.position.y = torsoY;
      g.add(plate);
      const gem = mesh(new THREE.OctahedronGeometry(bodyR * 0.2, 0), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
      gem.position.set(0, torsoY + bodyR * 0.18, -bodyR * 1.05);
      g.add(gem);
      rig.updaters.push((dt, t) => { gem.rotation.y += dt * 1.4; gem.position.y = torsoY + bodyR * 0.18 + Math.sin(t * 2) * 0.01; });
      break;
    }
    case 'pijama': {
      const pj = mesh(new THREE.CylinderGeometry(bodyR * 1.04, bodyR * 1.12, torsoH * 0.9, 16, 1, true), cloth());
      pj.position.y = torsoY - 0.02;
      g.add(pj);
      const cloud = mesh(new THREE.SphereGeometry(bodyR * 0.18, 10, 8), skin(rig, '#ffffff'));
      cloud.position.set(bodyR * 0.3, torsoY + bodyR * 0.1, -bodyR * 0.98);
      cloud.scale.set(1.5, 0.7, 0.4);
      g.add(cloud);
      break;
    }
    default: break;
  }
  return g;
}

// ------------------------------------------------------------------ espécies
function buildPenguin(rig, cfg) {
  const body = rig.parts.body;
  const bodyMat = skin(rig, cfg.bodyColor);
  const bellyMat = skin(rig, '#fdfbf4');
  const beakMat = skin(rig, '#ffb04a');
  const footMat = skin(rig, '#ffb04a');

  const torso = mesh(new THREE.SphereGeometry(0.46, 20, 16), bodyMat);
  torso.position.y = 1.05;
  torso.scale.set(0.92, 1.12, 0.86);
  body.add(torso);

  const belly = mesh(new THREE.SphereGeometry(0.36, 18, 14), bellyMat);
  belly.position.set(0, 1.0, -0.16);
  belly.scale.set(1, 1.18, 0.62);
  body.add(belly);

  const head = new THREE.Group();
  head.position.y = 1.62;
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.34, 20, 16), bodyMat);
  head.add(skull);
  const facePatch = mesh(new THREE.SphereGeometry(0.28, 16, 12), bellyMat);
  facePatch.position.set(0, -0.02, -0.16);
  facePatch.scale.set(1, 1.05, 0.7);
  head.add(facePatch);

  const beakUpper = mesh(new THREE.ConeGeometry(0.09, 0.24, 10), beakMat);
  beakUpper.position.set(0, -0.06, -0.36);
  beakUpper.rotation.x = Math.PI / 2;
  head.add(beakUpper);

  // asas
  const wingMat = bodyMat;
  for (const s of [-1, 1]) {
    const arm = s < 0 ? rig.parts.armL : rig.parts.armR;
    const wing = mesh(new THREE.SphereGeometry(0.15, 12, 10), wingMat);
    wing.position.y = -0.26;
    wing.scale.set(0.5, 1.5, 0.75);
    arm.add(wing);
  }
  for (const s of [-1, 1]) {
    const leg = s < 0 ? rig.parts.legL : rig.parts.legR;
    const foot = mesh(new THREE.SphereGeometry(0.15, 12, 8), footMat);
    foot.position.set(0, -0.46, -0.06);
    foot.scale.set(1.1, 0.45, 1.5);
    leg.add(foot);
  }

  rig.parts.torso = torso;
  rig.parts.head = head;
  rig.parts.headR = 0.34;
  rig.parts.headY = 1.62;
  rig.parts.faceY = -0.02;
  rig.parts.sizes = { bodyR: 0.46, torsoY: 1.05, torsoH: 1.05 };
  return rig;
}

function buildIceCream(rig, cfg) {
  const body = rig.parts.body;
  const scoopMat = skin(rig, cfg.bodyColor);
  const coneMat = skin(rig, '#d8a05c');
  const drizzleMat = skin(rig, shade(cfg.bodyColor, -0.16));

  const cone = mesh(new THREE.ConeGeometry(0.4, 0.95, 16), coneMat);
  cone.position.y = 0.72;
  cone.rotation.x = Math.PI;
  cone.scale.set(1, 1, 0.9);
  body.add(cone);
  // linhas da casquinha
  for (let i = 0; i < 3; i++) {
    const line = mesh(new THREE.TorusGeometry(0.3 - i * 0.09, 0.014, 5, 18), skin(rig, '#b07f42'));
    line.position.y = 0.55 + i * 0.24;
    line.rotation.x = Math.PI / 2;
    body.add(line);
  }

  const scoop = mesh(new THREE.SphereGeometry(0.44, 22, 18), scoopMat);
  scoop.position.y = 1.32;
  scoop.scale.set(1, 0.95, 0.95);
  body.add(scoop);

  const drizzle = mesh(new THREE.SphereGeometry(0.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), drizzleMat);
  drizzle.position.y = 1.42;
  drizzle.scale.set(1.01, 0.72, 0.98);
  body.add(drizzle);

  const cherry = mesh(new THREE.SphereGeometry(0.09, 12, 10), skin(rig, '#e8485f'));
  cherry.position.set(0, 1.72, -0.06);
  body.add(cherry);
  const stem = mesh(new THREE.TorusGeometry(0.07, 0.014, 5, 10, Math.PI), skin(rig, '#5aa05c'));
  stem.position.set(0.03, 1.82, -0.06);
  stem.rotation.z = 0.4;
  body.add(stem);

  // confeitos
  const sprinkleColors = ['#ff9bd0', '#ffd479', '#8ff0d0', '#9bb8ff'];
  const sprinkles = [];
  for (let i = 0; i < 10; i++) {
    const s = mesh(new THREE.BoxGeometry(0.06, 0.018, 0.018), skin(rig, sprinkleColors[i % sprinkleColors.length]));
    const a = (i / 10) * Math.PI * 2;
    const y = 1.2 + ((i * 37) % 40) / 100;
    const r = 0.42;
    s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    s.rotation.set(a, a * 2, a);
    body.add(s);
    sprinkles.push(s);
  }

  const head = new THREE.Group();
  head.position.y = 1.34;
  body.add(head);
  // o rosto mora na própria bola de sorvete
  rig.parts.torso = scoop;
  rig.parts.head = head;
  rig.parts.headR = 0.46;
  rig.parts.headY = 1.34;
  rig.parts.faceZ = -0.4;

  for (const s of [-1, 1]) {
    const arm = s < 0 ? rig.parts.armL : rig.parts.armR;
    const stick = mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 8), skin(rig, '#f6e2c8'));
    stick.position.y = -0.2;
    arm.add(stick);
    const hand = mesh(new THREE.SphereGeometry(0.08, 10, 8), scoopMat);
    hand.position.y = -0.44;
    arm.add(hand);
  }
  for (const s of [-1, 1]) {
    const leg = s < 0 ? rig.parts.legL : rig.parts.legR;
    const foot = mesh(new THREE.SphereGeometry(0.11, 10, 8), skin(rig, '#f6e2c8'));
    foot.position.set(0, -0.5, -0.04);
    foot.scale.set(1, 0.7, 1.2);
    leg.add(foot);
  }

  rig.parts.sizes = { bodyR: 0.44, torsoY: 1.32, torsoH: 0.9 };
  rig.parts.faceY = 0.02;
  rig.updaters.push((dt, t) => {
    sprinkles.forEach((s, i) => { s.rotation.y += dt * (0.4 + i * 0.02); });
  });
  return rig;
}

function buildMammal(rig, cfg, kind) {
  const body = rig.parts.body;
  const fur = skin(rig, cfg.bodyColor);
  const light = skin(rig, shade(cfg.bodyColor, 0.22));
  const dark = skin(rig, shade(cfg.bodyColor, -0.2));

  const torso = mesh(new THREE.SphereGeometry(0.4, 20, 16), fur);
  torso.position.y = 1.02;
  torso.scale.set(0.92, 1.08, 0.82);
  body.add(torso);
  const tummy = mesh(new THREE.SphereGeometry(0.31, 16, 12), light);
  tummy.position.set(0, 0.98, -0.14);
  tummy.scale.set(1, 1.1, 0.65);
  body.add(tummy);

  const head = new THREE.Group();
  head.position.y = 1.6;
  body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.37, 20, 16), fur);
  head.add(skull);

  // focinho
  const muzzle = mesh(new THREE.SphereGeometry(0.18, 14, 10), light);
  muzzle.position.set(0, -0.1, -0.3);
  muzzle.scale.set(1.25, 0.85, 0.8);
  head.add(muzzle);
  const nose = mesh(new THREE.SphereGeometry(0.065, 10, 8), skin(rig, '#4c3a3f'));
  nose.position.set(0, -0.04, -0.44);
  nose.scale.set(1.2, 0.85, 0.9);
  head.add(nose);

  // orelhas por espécie
  if (kind === 'urso') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(0.15, 12, 10), fur);
      ear.position.set(s * 0.27, 0.28, 0.02);
      head.add(ear);
      const inner = mesh(new THREE.SphereGeometry(0.08, 10, 8), light);
      inner.position.set(s * 0.27, 0.28, -0.05);
      head.add(inner);
    }
  } else if (kind === 'gato') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.16, 0.3, 4), fur);
      ear.position.set(s * 0.24, 0.36, 0.01);
      ear.rotation.set(0.1, Math.PI / 4, s * 0.12);
      head.add(ear);
      const inner = mesh(new THREE.ConeGeometry(0.1, 0.2, 4), skin(rig, '#ffb0c0'));
      inner.position.set(s * 0.24, 0.33, -0.02);
      inner.rotation.set(0.1, Math.PI / 4, s * 0.12);
      head.add(inner);
    }
    // bigodes
    const whiskerMat = skin(rig, '#f6f2ec');
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const wh = mesh(new THREE.BoxGeometry(0.24, 0.012, 0.012), whiskerMat);
        wh.position.set(s * 0.34, -0.1 + i * 0.06, -0.32);
        wh.rotation.z = s * (0.1 + i * 0.14);
        head.add(wh);
      }
    }
  } else if (kind === 'coelho') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.CapsuleGeometry(0.1, 0.5, 6, 10), fur);
      ear.position.set(s * 0.16, 0.47, 0.02);
      ear.rotation.z = s * 0.1;
      head.add(ear);
      const inner = mesh(new THREE.CapsuleGeometry(0.055, 0.42, 6, 8), skin(rig, '#ffb0c0'));
      inner.position.set(s * 0.16, 0.47, -0.05);
      inner.rotation.z = s * 0.1;
      head.add(inner);
    }
  } else if (kind === 'raposa') {
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.2, 0.44, 5), fur);
      ear.position.set(s * 0.22, 0.4, 0.02);
      ear.rotation.z = s * 0.16;
      head.add(ear);
      const tip = mesh(new THREE.ConeGeometry(0.1, 0.16, 5), skin(rig, '#3a2a2c'));
      tip.position.set(s * 0.25, 0.55, 0.02);
      tip.rotation.z = s * 0.16;
      head.add(tip);
    }
  } else if (kind === 'estrela') {
    const starMat = skin(rig, '#fff2b8');
    for (const s of [-1, 1]) {
      const spike = mesh(new THREE.ConeGeometry(0.09, 0.22, 4), starMat);
      spike.position.set(s * 0.3, 0.3, 0.04);
      spike.rotation.z = s * 0.5;
      head.add(spike);
    }
    const antenna = mesh(new THREE.TorusGeometry(0.06, 0.014, 5, 10, Math.PI), starMat);
    antenna.position.set(0, 0.38, -0.06);
    head.add(antenna);
  }

  // cauda
  if (kind === 'raposa') {
    const tail = mesh(new THREE.ConeGeometry(0.2, 0.85, 10), fur);
    tail.position.set(0, 0.92, 0.42);
    tail.rotation.x = -0.9;
    body.add(tail);
    const tip = mesh(new THREE.SphereGeometry(0.13, 10, 8), skin(rig, '#fdf7ee'));
    tip.position.set(0, 1.25, 0.62);
    body.add(tip);
    rig.parts.tail = tail;
  } else if (kind === 'gato') {
    const tail = mesh(new THREE.CapsuleGeometry(0.05, 0.55, 6, 8), fur);
    tail.position.set(0.2, 0.95, 0.4);
    tail.rotation.x = -0.7;
    tail.rotation.z = 0.5;
    body.add(tail);
    rig.parts.tail = tail;
  } else if (kind === 'coelho') {
    const tail = mesh(new THREE.SphereGeometry(0.12, 10, 8), skin(rig, '#fffaf2'));
    tail.position.set(0, 0.9, 0.38);
    body.add(tail);
  }

  for (const s of [-1, 1]) {
    const arm = s < 0 ? rig.parts.armL : rig.parts.armR;
    const limb = mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), fur);
    limb.position.y = -0.22;
    arm.add(limb);
    const paw = mesh(new THREE.SphereGeometry(0.1, 10, 8), light);
    paw.position.y = -0.42;
    arm.add(paw);
  }
  for (const s of [-1, 1]) {
    const leg = s < 0 ? rig.parts.legL : rig.parts.legR;
    const foot = mesh(new THREE.SphereGeometry(0.13, 10, 8), dark);
    foot.position.set(0, -0.44, -0.05);
    foot.scale.set(1, 0.66, 1.35);
    leg.add(foot);
  }

  rig.parts.torso = torso;
  rig.parts.head = head;
  rig.parts.headR = 0.37;
  rig.parts.headY = 1.6;
  rig.parts.faceY = 0;
  rig.parts.faceZ = -0.34;
  rig.parts.sizes = { bodyR: 0.4, torsoY: 1.02, torsoH: 0.95 };
  return rig;
}

function buildStar(rig, cfg) {
  const body = rig.parts.body;
  const starMat = skin(rig, cfg.bodyColor);
  const light = skin(rig, shade(cfg.bodyColor, 0.3));

  const shape = new THREE.Shape();
  const spikes = 5, outer = 0.55, inner = 0.26;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const star = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.28, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09, bevelSegments: 3 }), starMat);
  star.position.set(0, 1.05, 0.16);
  star.rotation.z = 0;
  body.add(star);

  const torso = star;
  const head = new THREE.Group();
  head.position.y = 1.6;
  body.add(head);
  const core = mesh(new THREE.SphereGeometry(0.34, 18, 14), starMat);
  head.add(core);
  const cheek = mesh(new THREE.SphereGeometry(0.22, 14, 10), light);
  cheek.position.set(0, -0.02, -0.18);
  cheek.scale.set(1.15, 1, 0.6);
  head.add(cheek);

  for (const s of [-1, 1]) {
    const arm = s < 0 ? rig.parts.armL : rig.parts.armR;
    const nub = mesh(new THREE.SphereGeometry(0.12, 10, 8), starMat);
    nub.position.y = -0.16;
    nub.scale.set(0.8, 1.3, 0.8);
    arm.add(nub);
  }
  for (const s of [-1, 1]) {
    const leg = s < 0 ? rig.parts.legL : rig.parts.legR;
    const foot = mesh(new THREE.SphereGeometry(0.13, 10, 8), light);
    foot.position.set(0, -0.44, -0.04);
    foot.scale.set(1, 0.7, 1.2);
    leg.add(foot);
  }

  rig.parts.torso = torso;
  rig.parts.head = head;
  rig.parts.headR = 0.34;
  rig.parts.headY = 1.6;
  rig.parts.faceY = -0.02;
  rig.parts.faceZ = -0.3;
  rig.parts.sizes = { bodyR: 0.5, torsoY: 1.05, torsoH: 1.0 };
  rig.updaters.push((dt, t) => { star.rotation.z = Math.sin(t * 0.8) * 0.05; });
  return rig;
}

// ------------------------------------------------------------------ montagem
export function buildAvatar(config = {}) {
  const cfg = { ...DEFAULT_AVATAR, ...config };
  const rig = makeRig();
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.02;
  group.add(body);

  rig.group = group;
  rig.body = body;
  rig.parts.body = body;

  // esqueleto base — mesmas alturas usadas pelas animações do Player
  const armL = new THREE.Group();
  armL.position.set(-0.4, 1.34, 0);
  const armR = new THREE.Group();
  armR.position.set(0.4, 1.34, 0);
  const legL = new THREE.Group();
  legL.position.set(-0.16, 0.8, 0);
  const legR = new THREE.Group();
  legR.position.set(0.16, 0.8, 0);
  body.add(armL, armR, legL, legR);
  rig.armL = armL;
  rig.armR = armR;
  rig.legL = legL;
  rig.legR = legR;
  rig.parts.armL = armL;
  rig.parts.armR = armR;
  rig.parts.legL = legL;
  rig.parts.legR = legR;

  const builders = { pinguim: buildPenguin, sorvete: buildIceCream, urso: buildMammal, gato: buildMammal, coelho: buildMammal, raposa: buildMammal, estrela: buildStar };
  const builder = builders[cfg.species] || buildPenguin;
  const kind = ['urso', 'gato', 'coelho', 'raposa'].includes(cfg.species) ? cfg.species : cfg.species;
  builder(rig, cfg, kind);

  const head = rig.parts.head;
  const headR = rig.parts.headR || 0.35;
  const faceZ = rig.parts.faceZ ?? -headR * 0.9;
  const faceY = rig.parts.faceY ?? 0;

  // rosto expressivo
  const face = new THREE.Group();
  face.position.set(0, 0, 0);
  const eyes = bigEyes(rig, { spread: headR * 0.38, y: faceY + 0.04, z: faceZ, size: headR * 0.3, pupil: headR * 0.16, expression: cfg.expression });
  face.add(eyes);
  face.add(mouth(rig, cfg.expression, { y: faceY - headR * 0.42, z: faceZ - headR * 0.04 }));
  face.add(blush(rig, { spread: headR * 0.66, y: faceY - headR * 0.22, z: faceZ + 0.02, strength: cfg.expression === 'timido' ? 0.85 : 0.45 }));
  head.add(face);
  rig.parts.face = face;

  // cabelo
  const hair = itemById('hair', cfg.hair);
  if (hair?.style && hair.style !== 'nenhum') head.add(buildHair(rig, hair.style, cfg.hairColor, headR));

  // chapéu
  const hat = itemById('head', cfg.head);
  if (hat?.style && hat.style !== 'nenhum') head.add(buildHeadItem(rig, hat.style, headR));

  // acessório de rosto
  const faceItem = itemById('face', cfg.face);
  if (faceItem?.style && faceItem.style !== 'nenhum') head.add(buildFaceItem(rig, faceItem.style, headR));

  const sizes = rig.parts.sizes || { bodyR: 0.4, torsoY: 1.05, torsoH: 1 };

  // roupa
  const outfitItem = itemById('outfit', cfg.outfit);
  if (outfitItem?.style && outfitItem.style !== 'nenhum') body.add(buildOutfit(rig, outfitItem, cfg.outfitColor, sizes));

  // costas
  const backItem = itemById('back', cfg.back);
  if (backItem?.style && backItem.style !== 'nenhum') body.add(buildBackItem(rig, backItem.style, cfg.outfitColor, sizes));

  // aura / efeitos
  const auraItem = itemById('aura', cfg.aura);
  if (auraItem && auraItem.id !== 'nenhum') body.add(buildAura(rig, auraItem, sizes));

  // alça da lanterna na mão direita
  const handSocket = new THREE.Object3D();
  handSocket.position.set(0, -0.52, 0);
  armR.add(handSocket);

  rig.handSocket = handSocket;
  rig.torso = rig.parts.torso;
  rig.head = head;
  rig.face = face;
  rig.materials = rig.materials;
  rig.update = (dt, t) => { for (const fn of rig.updaters) fn(dt, t); };

  return rig;
}

/** Remove o avatar antigo (geometrias e materiais) da memória. */
export function disposeAvatar(rig) {
  if (!rig?.group) return;
  rig.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) m.dispose?.();
    }
  });
  rig.group.removeFromParent();
}
