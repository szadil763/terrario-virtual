// Kit visual do bosque: materiais procedurais (sem texturas externas), vegetação
// detalhada, água estilizada com espuma e reflexo do céu, cachoeira e o cenário
// distante (cordilheiras, castelo, ilhas flutuantes e muralha de rochas).

import * as THREE from 'three';
import { rand } from '../core/state.js';

// ------------------------------------------------------------------ utilitários
export function enableShadows(root, { cast = true, receive = true } = {}) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (o.userData.noShadow) return;
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
  return root;
}

/** Funde várias geometrias não indexadas em uma só (economiza draw calls). */
function mergeGeometries(geometries) {
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let offset = 0;
  for (const g of parts) {
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal ? g.attributes.normal.array : null;
    const col = g.attributes.color ? g.attributes.color.array : null;
    position.set(pos, offset * 3);
    if (nor) normal.set(nor, offset * 3);
    if (col) color.set(col, offset * 3);
    else for (let i = 0; i < pos.length; i++) color[offset * 3 + i] = 1;
    offset += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return merged;
}

// ------------------------------------------------------------------ terreno
const TERRAIN_COMMON = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  float b44Hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float b44Noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = b44Hash(i);
    float b = b44Hash(i + vec2(1.0, 0.0));
    float c = b44Hash(i + vec2(0.0, 1.0));
    float d = b44Hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float b44Fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * b44Noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

/**
 * Terreno com detalhe procedural: manchas de grama, terra, musgo e rocha em
 * encostas. A cor por vértice define a paleta do bioma; o shader adiciona a
 * variação fina que dá a sensação de textura em alta resolução.
 */
export function makeTerrainMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${TERRAIN_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bigPatch = b44Fbm(vWorldPos.xz * 0.11);
        float midPatch = b44Fbm(vWorldPos.xz * 0.62);
        float micro = b44Noise(vWorldPos.xz * 7.5);
        diffuseColor.rgb *= 0.84 + bigPatch * 0.36;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.04, 0.80), smoothstep(0.52, 0.95, midPatch) * 0.42);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.94, 0.88), smoothstep(0.55, 0.95, 1.0 - midPatch) * 0.30);
        diffuseColor.rgb *= 0.90 + micro * 0.20;
        float slope = 1.0 - clamp(vWorldNormal.y, 0.0, 1.0);
        vec3 rockTint = vec3(0.30, 0.31, 0.30) * (0.75 + micro * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, rockTint, smoothstep(0.30, 0.72, slope));
      `);
  };
  material.customProgramCacheKey = () => 'terrain-detail';
  return material;
}

// ------------------------------------------------------------------ vegetação
const grassWind = {
  time: { value: 0 },
  strength: { value: 1 },
};
export { grassWind };

function makeGrassBladeGeometry() {
  const geo = new THREE.PlaneGeometry(0.11, 0.8, 1, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.4;
    const f = Math.max(0, Math.min(1, y / 0.8));
    pos.setX(i, pos.getX(i) * (1 - 0.72 * f) + 0.14 * f * f);
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  return geo;
}

function makeGrassMaterial(color) {
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassTime = grassWind.time;
    shader.uniforms.uGrassStrength = grassWind.strength;
    shader.vertexShader = `uniform float uGrassTime;\nuniform float uGrassStrength;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 gAnchor = instanceMatrix[3].xyz;
      #else
        vec3 gAnchor = vec3(0.0);
      #endif
      float gPhase = uGrassTime * 1.9 + gAnchor.x * 0.55 + gAnchor.z * 0.42;
      float gHeight = clamp(position.y / 0.8, 0.0, 1.0);
      float gBend = gHeight * gHeight * uGrassStrength;
      transformed.x += sin(gPhase) * 0.26 * gBend;
      transformed.z += cos(gPhase * 0.83) * 0.17 * gBend;
      transformed.y -= gBend * 0.045;
    `);
  };
  material.customProgramCacheKey = () => 'grass-wind';
  return material;
}

/**
 * Campo de grama 3D em tufos: milhares de lâminas instanciadas que balançam com
 * o vento, com três tons de verde para dar profundidade.
 */
export function buildGrassField(scene, world, rng, { count = 3800 } = {}) {
  const blade = makeGrassBladeGeometry();
  const palettes = [
    { color: '#2f6a41', share: 0.4 },
    { color: '#3f8350', share: 0.35 },
    { color: '#548f4f', share: 0.25 },
  ];
  const meshes = [];
  let index = 0;
  for (const palette of palettes) {
    const n = Math.floor(count * palette.share);
    const mesh = new THREE.InstancedMesh(blade, makeGrassMaterial(palette.color), n);
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      let x = 0, z = 0, tries = 0;
      do {
        const a = rng() * Math.PI * 2;
        const r = 4 + Math.pow(rng(), 0.68) * 54;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        tries++;
      } while (tries < 6 && (
        Math.hypot(x, z) < 5.5
        || Math.hypot(x + 16, z - 9) < 7.4
        || Math.hypot(x + 24, z + 22) < 6.4
        || Math.hypot(x - 20, z - 24) < 4
      ));
      const y = world.terrainHeight(x, z);
      euler.set(0, rng() * Math.PI * 2, 0);
      quat.setFromEuler(euler);
      const s = 0.75 + rng() * 0.95;
      scale.set(s * (0.8 + rng() * 0.5), s, s * (0.8 + rng() * 0.5));
      matrix.compose(new THREE.Vector3(x, y, z), quat, scale);
      mesh.setMatrixAt(i, matrix);
      index++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, blades: index };
}

/** Flores coloridas e trevos espalhados pelo campo (instanciados). */
export function buildFlowerField(scene, world, rng, { count = 520 } = {}) {
  const colors = ['#ffe6a0', '#ffd0e2', '#d9c2ff', '#fff4f0', '#ffcf7a'];
  const geo = new THREE.IcosahedronGeometry(0.085, 0);
  const meshes = [];
  for (const color of colors) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color).multiplyScalar(0.18) }), Math.floor(count / colors.length));
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    mesh.count = Math.floor(count / colors.length);
    for (let i = 0; i < mesh.count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 6 + Math.pow(rng(), 0.7) * 46;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = world.terrainHeight(x, z) + 0.14 + rng() * 0.1;
      euler.set(0, rng() * 3, 0);
      quat.setFromEuler(euler);
      const s = 0.7 + rng() * 0.9;
      scale.set(s, s * 0.7, s);
      matrix.compose(new THREE.Vector3(x, y, z), quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

// ------------------------------------------------------------------ água
export function makeWaterMaterial({ center = new THREE.Vector2(), radius = 7, deep = '#0e3348', light = '#3f8f9e' } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDeep: { value: new THREE.Color(deep) },
      uSky: { value: new THREE.Color('#9fd0e8') },
      uSkyTop: { value: new THREE.Color('#4f8fd0') },
      uSun: { value: new THREE.Color('#ffe6a8') },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
      uShallow: { value: new THREE.Color(light) },
      uTime: { value: 0 },
      uCenter: { value: center.clone() },
      uRadius: { value: radius },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform vec3 uSkyTop;
      uniform vec3 uSun;
      uniform vec3 uSunDir;
      uniform vec3 uShallow;
      uniform float uTime;
      uniform vec2 uCenter;
      uniform float uRadius;
      varying vec3 vWorld;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 p = vWorld.xz;
        float w1 = sin(p.x * 1.35 + uTime * 0.95) * 0.5 + sin(p.y * 1.75 - uTime * 0.72) * 0.5;
        float w2 = sin(p.x * 2.9 - uTime * 1.5) * sin(p.y * 2.4 + uTime * 1.15);
        float ripple = noise(p * 2.4 + vec2(uTime * 0.35, -uTime * 0.28));
        vec3 n = normalize(vec3(w1 * 0.16 + w2 * 0.09 + ripple * 0.06, 1.0, w2 * 0.16 - w1 * 0.06));

        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 2.4);

        vec3 skyReflection = mix(uSky, uSkyTop, 0.35 + 0.35 * n.y);
        vec3 col = mix(uDeep, uShallow, 0.35 + w1 * 0.08);
        col = mix(col, skyReflection, clamp(fresnel * 1.25 + 0.18, 0.0, 0.92));

        // brilho do sol em ondas
        vec3 h = normalize(normalize(uSunDir) + viewDir);
        float spec = pow(max(dot(n, h), 0.0), 120.0);
        col += uSun * spec * 2.2;

        // espuma na margem
        float d = length(p - uCenter) / uRadius;
        float shore = smoothstep(0.66, 1.0, d);
        float foamNoise = noise(p * 6.0 + vec2(uTime * 0.6, uTime * 0.4));
        float foam = shore * smoothstep(0.35, 0.9, foamNoise + shore * 0.45);
        col = mix(col, vec3(0.92, 0.98, 1.0), clamp(foam, 0.0, 1.0) * 0.8);

        float alpha = mix(0.78, 0.94, fresnel) + foam * 0.25;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }`,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

/** Cachoeira: cortina de água em scroll + neblina e respingos na base. */
export function buildWaterfall(scene, effects, { x, y, z, width = 2.6, height = 5.2, facing = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = facing;

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#cfeaff') } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float flow = noise(vec2(uv.x * 9.0, uv.y * 3.5 - uTime * 2.6));
        float flow2 = noise(vec2(uv.x * 18.0 + 3.0, uv.y * 7.0 - uTime * 4.1));
        float streak = smoothstep(0.32, 0.85, flow * 0.65 + flow2 * 0.45);
        float edge = smoothstep(0.0, 0.10, uv.x) * smoothstep(1.0, 0.90, uv.x);
        float bottom = smoothstep(0.0, 0.22, uv.y);
        float alpha = streak * edge * (0.45 + bottom * 0.5);
        vec3 col = mix(uColor * 0.75, uColor, streak);
        gl_FragColor = vec4(col, alpha * 0.95);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), material);
  sheet.position.set(0, height / 2, 0);
  sheet.userData.noShadow = true;
  group.add(sheet);

  // neblina na base
  const mist = [];
  for (let i = 0; i < 3; i++) {
    const sprite = effects._sprite('#dff2ff', 2.4 + i * 1.1);
    sprite.position.set(rand(-0.7, 0.7), 0.15 + i * 0.12, rand(0.2, 0.9));
    sprite.material.opacity = 0.10 - i * 0.02;
    group.add(sprite);
    mist.push(sprite);
  }

  scene.add(group);
  return {
    group,
    material,
    update(t) {
      material.uniforms.uTime.value = t;
      mist.forEach((sprite, i) => {
        sprite.material.opacity = 0.08 + Math.sin(t * 1.6 + i) * 0.03;
        sprite.position.y = 0.15 + i * 0.12 + Math.sin(t * 0.9 + i) * 0.06;
      });
    },
  };
}

// ------------------------------------------------------------------ cenário distante
function makePeakGeometry(radius, height, segments, bottomColor, topColor, snowLine = 0.68) {
  const geo = new THREE.ConeGeometry(radius, height, segments, 2, false).toNonIndexed();
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const cb = new THREE.Color(bottomColor);
  const ct = new THREE.Color(topColor);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) + height / 2) / height));
    const snow = Math.min(1, Math.max(0, (t - snowLine) / (1 - snowLine)));
    c.copy(cb).lerp(ct, Math.pow(snow, 0.8) * 0.9 + t * 0.12);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Cordilheiras em camadas, muralha de rochas no limite do mapa, castelo ao
 * longe e ilhas flutuantes. Tudo fundido em poucos meshes para não pesar.
 */
export function buildDistantLandscape(scene, { terrainHeight = () => 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'distant';
  const meshes = [];

  const buildRing = ({ count, minR, maxR, minH, maxH, base, rock, snow, seed = 1 }) => {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898 + seed) * 0.12;
      const r = minR + Math.abs(Math.sin(i * 3.7 + seed)) * (maxR - minR);
      const h = minH + Math.abs(Math.sin(i * 7.3 + seed * 2.1)) * (maxH - minH);
      const width = h * (0.55 + Math.abs(Math.cos(i * 2.3)) * 0.45);
      const geo = makePeakGeometry(width, h, 5 + (i % 3), rock, snow);
      geo.translate(Math.cos(a) * r, h / 2 + base, Math.sin(a) * r);
      parts.push(geo);
    }
    const merged = mergeGeometries(parts);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.userData.noShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // cordilheira distante (silhueta azulada, neve no topo)
  buildRing({ count: 34, minR: 150, maxR: 235, minH: 46, maxH: 96, base: -8, rock: '#5c7085', snow: '#e8f1fb', seed: 1.7 });
  // serra intermediária
  buildRing({ count: 26, minR: 100, maxR: 142, minH: 28, maxH: 58, base: -4, rock: '#41605c', snow: '#cfe0e4', seed: 4.2 });
  // muralha de rochas que fecha o horizonte logo além do limite jogável
  buildRing({ count: 30, minR: 66, maxR: 82, minH: 12, maxH: 30, base: -3, rock: '#33463f', snow: '#4c6153', seed: 8.9 });

  // ---- castelo medieval ao longe
  const castle = new THREE.Group();
  const castlePos = new THREE.Vector3(-78, 0, -104);
  const stone = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6a7896') });
  const stoneDark = new THREE.MeshLambertMaterial({ color: new THREE.Color('#4f5d7a') });
  const roof = new THREE.MeshLambertMaterial({ color: new THREE.Color('#41618c') });
  const windowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd479') });

  const hill = new THREE.Mesh(
    makePeakGeometry(34, 40, 7, '#3d5a4c', '#4d6b57', 0.95),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  hill.position.set(castlePos.x, 6, castlePos.z);
  castle.add(hill);

  const addTower = (x, z, w, h, withRoof = true) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.1, h, 8), stone);
    tower.position.set(x, 26 + h / 2, z);
    castle.add(tower);
    if (withRoof) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(w * 1.25, h * 0.5, 8), roof);
      cone.position.set(x, 26 + h + h * 0.25, z);
      castle.add(cone);
    }
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, h * 0.16), windowMat);
    win.position.set(x, 26 + h * 0.72, z + w * 1.02);
    castle.add(win);
  };

  const keep = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 13), stoneDark);
  keep.position.set(castlePos.x, 26 + 8, castlePos.z);
  castle.add(keep);

  const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(26, 7, 2), stone);
  wallMesh.position.set(castlePos.x, 26 + 3.5, castlePos.z + 9);
  castle.add(wallMesh);

  addTower(castlePos.x - 9, castlePos.z - 5, 2.4, 20);
  addTower(castlePos.x + 9, castlePos.z - 5, 2.4, 22);
  addTower(castlePos.x - 12, castlePos.z + 8, 2.0, 15);
  addTower(castlePos.x + 12, castlePos.z + 8, 2.0, 15);
  addTower(castlePos.x, castlePos.z, 3.2, 26);

  castle.traverse((o) => { o.userData.noShadow = true; });
  group.add(castle);

  // ---- ilhas flutuantes
  const islands = [];
  const islandDefs = [
    { a: 2.2, r: 62, y: 27, s: 1.0 },
    { a: 4.4, r: 78, y: 34, s: 1.35 },
    { a: 0.6, r: 88, y: 30, s: 0.85 },
  ];
  for (const def of islandDefs) {
    const island = new THREE.Group();
    const x = Math.cos(def.a) * def.r;
    const z = Math.sin(def.a) * def.r;
    island.position.set(x, def.y, z);
    island.scale.setScalar(def.s);
    const rockBottom = new THREE.Mesh(
      new THREE.ConeGeometry(5, 12, 7),
      new THREE.MeshLambertMaterial({ color: new THREE.Color('#4a4a5c'), flatShading: true }),
    );
    rockBottom.rotation.x = Math.PI;
    rockBottom.position.y = -5.5;
    island.add(rockBottom);
    const grassTop = new THREE.Mesh(
      new THREE.CylinderGeometry(5.4, 4.6, 1.6, 9),
      new THREE.MeshLambertMaterial({ color: new THREE.Color('#3f8a58'), flatShading: true }),
    );
    island.add(grassTop);
    for (let i = 0; i < 3; i++) {
      const tree = new THREE.Mesh(
        new THREE.ConeGeometry(1.15, 3.4, 6),
        new THREE.MeshLambertMaterial({ color: new THREE.Color('#2c6b45'), flatShading: true }),
      );
      const a = (i / 3) * Math.PI * 2;
      tree.position.set(Math.cos(a) * 2.4, 2.4, Math.sin(a) * 2.4);
      island.add(tree);
    }
    island.traverse((o) => { o.userData.noShadow = true; });
    group.add(island);
    islands.push({ group: island, baseY: def.y, phase: def.a });
  }

  // ---- floresta distante (silhuetas para dar profundidade ao vale)
  const trunkGeo = new THREE.CylinderGeometry(0.34, 0.5, 3.2, 5);
  const canopyGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#3b3227') });
  const canopyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#204634'), flatShading: true });
  const farTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 420);
  const farCanopies = new THREE.InstancedMesh(canopyGeo, canopyMat, 420);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let placed = 0;
  for (let i = 0; i < 420; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 56 + Math.pow(Math.random(), 0.7) * 52;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    const s = 0.9 + Math.random() * 1.5;
    quat.setFromEuler(new THREE.Euler(0, Math.random() * 3, 0));
    scale.set(s, s * (1 + Math.random() * 0.5), s);
    matrix.compose(new THREE.Vector3(x, y + 1.9 * s, z), quat, scale);
    farTrunks.setMatrixAt(placed, matrix);
    matrix.compose(new THREE.Vector3(x, y + 4.4 * s, z), quat, scale);
    farCanopies.setMatrixAt(placed, matrix);
    placed++;
  }
  farTrunks.count = placed;
  farCanopies.count = placed;
  farTrunks.instanceMatrix.needsUpdate = true;
  farCanopies.instanceMatrix.needsUpdate = true;
  farTrunks.frustumCulled = false;
  farCanopies.frustumCulled = false;
  farTrunks.userData.noShadow = true;
  farCanopies.userData.noShadow = true;
  group.add(farTrunks);
  group.add(farCanopies);

  scene.add(group);

  return {
    group,
    update(t) {
      for (const island of islands) {
        island.group.position.y = island.baseY + Math.sin(t * 0.35 + island.phase) * 1.3;
        island.group.rotation.y = Math.sin(t * 0.06 + island.phase) * 0.15;
      }
    },
  };
}
