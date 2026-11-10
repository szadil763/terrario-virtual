// Atmosfera viva do bosque: ciclo de dia e noite, céu procedural com sol, lua e
// estrelas, nuvens, clima em tempo real (limpo, chuva, neve, tempestade de areia),
// vento que mexe na vegetação e água que reflete o céu.
// Tudo procedural — nenhuma textura externa, nenhum asset binário.

import * as THREE from 'three';
import { grassWind } from './graphics.js';

const DAY_SECONDS = 480;      // um dia completo dura 8 minutos
const WEATHER_RAMP = 0.4;     // velocidade da transição de clima (por segundo)

// Paletas do céu ao longo do dia. Cada chave é interpolada com a próxima.
// Cores vibrantes e névoa leve o suficiente para as cordilheiras do horizonte
// aparecerem com perspectiva atmosférica.
const SKY_KEYS = [
  { h: 0, top: '#050a18', horizon: '#0e1b30', fog: '#0b1526', density: 0.013, hemiSky: '#3a4d76', hemiGround: '#141d2d', hemi: 0.78, sun: 0.0, moon: 0.8, sunColor: '#a8c0ff' },
  { h: 4.6, top: '#0c1a33', horizon: '#2b4468', fog: '#122036', density: 0.012, hemiSky: '#41578a', hemiGround: '#151e30', hemi: 0.82, sun: 0.10, moon: 0.6, sunColor: '#b7ccff' },
  { h: 6.4, top: '#3a6aa8', horizon: '#ffb579', fog: '#5a6076', density: 0.010, hemiSky: '#6f8ec4', hemiGround: '#3d4a45', hemi: 0.96, sun: 1.5, moon: 0.06, sunColor: '#ffc48a' },
  { h: 9.0, top: '#4f93cf', horizon: '#e6f4fb', fog: '#a6c6d8', density: 0.0055, hemiSky: '#b5d6f5', hemiGround: '#6f8048', hemi: 1.28, sun: 2.4, moon: 0.0, sunColor: '#fff4d6' },
  { h: 13.0, top: '#4c9ede', horizon: '#e9f7ff', fog: '#b6d5e4', density: 0.0048, hemiSky: '#c8e4fb', hemiGround: '#78874f', hemi: 1.38, sun: 2.7, moon: 0.0, sunColor: '#ffffff' },
  { h: 17.0, top: '#4f8fc4', horizon: '#f7d9a8', fog: '#adc0c2', density: 0.0062, hemiSky: '#b3c9dd', hemiGround: '#6b664a', hemi: 1.14, sun: 1.9, moon: 0.0, sunColor: '#ffdcaa' },
  { h: 18.8, top: '#2f4f7f', horizon: '#ff9c6b', fog: '#5e5566', density: 0.0085, hemiSky: '#7d78a8', hemiGround: '#2f2733', hemi: 0.80, sun: 0.85, moon: 0.06, sunColor: '#ff9a5e' },
  { h: 20.4, top: '#1c2e4a', horizon: '#6d5a80', fog: '#22304c', density: 0.0115, hemiSky: '#4a5b85', hemiGround: '#1a2334', hemi: 0.85, sun: 0.14, moon: 0.5, sunColor: '#c9a8d8' },
  { h: 22.0, top: '#070f20', horizon: '#16263f', fog: '#0f1a2c', density: 0.013, hemiSky: '#3b4d74', hemiGround: '#141d2d', hemi: 0.8, sun: 0.0, moon: 0.78, sunColor: '#a8c0ff' },
  { h: 24, top: '#050a18', horizon: '#0e1b30', fog: '#0b1526', density: 0.013, hemiSky: '#3a4d76', hemiGround: '#141d2d', hemi: 0.78, sun: 0.0, moon: 0.8, sunColor: '#a8c0ff' },
].map((k) => ({
  ...k,
  topC: new THREE.Color(k.top),
  horizonC: new THREE.Color(k.horizon),
  fogC: new THREE.Color(k.fog),
  hemiSkyC: new THREE.Color(k.hemiSky),
  hemiGroundC: new THREE.Color(k.hemiGround),
  sunC: new THREE.Color(k.sunColor),
}));

export const WEATHER_INFO = {
  limpo: { label: 'Céu limpo', icon: '✨' },
  chuva: { label: 'Chuva suave', icon: '🌧' },
  neve: { label: 'Neve caindo', icon: '❄️' },
  areia: { label: 'Tempestade de areia', icon: '🌪' },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class Atmosphere {
  constructor(scene, { world, settings, events, effects }) {
    this.scene = scene;
    this.world = world;
    this.settings = settings;
    this.events = events;
    this.effects = effects;

    this.hours = 17.6;            // começa no fim da tarde: luz dourada, depois a noite chega
    this.weather = 'limpo';
    this.mix = { chuva: 0, neve: 0, areia: 0 };
    this.weatherTimer = 55 + Math.random() * 35;
    this.statusTimer = 0;
    this.tick = 0;
    this.sunIntensity = 0;

    // uniformes compartilhados por todos os materiais com vento
    this.wind = { time: { value: 0 }, strength: { value: 1 } };
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this._cTop = new THREE.Color();
    this._cHorizon = new THREE.Color();
    this._cFog = new THREE.Color();
    this._cHemiSky = new THREE.Color();
    this._cHemiGround = new THREE.Color();
    this._cSun = new THREE.Color();
    this._cCloudLit = new THREE.Color();
    this._cCloudShade = new THREE.Color();

    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.warmth = 0;   // 0 = luz neutra · 1 = pôr/nascer do sol
    this.night = 1;    // 1 = noite fechada
  }

  // ------------------------------------------------------------ construção
  build() {
    this._buildSky();
    this._buildStars();
    this._buildClouds();
    this._buildLeaves();
    this._buildWeather();
    this._takeLights();
    this._applySky(this.hours, new THREE.Vector3());
    for (const w of this.world.windables || []) this.applyWind(w.material, w.amp);
    return this;
  }

  _takeLights() {
    const lights = this.world.lights || {};
    this.hemi = lights.hemi || new THREE.HemisphereLight('#3c5a94', '#101a30', 0.85);
    if (!lights.hemi) this.scene.add(this.hemi);
    this.moon = lights.moon || new THREE.DirectionalLight('#9db8f0', 0.36);
    if (!lights.moon) this.scene.add(this.moon);

    this.sun = new THREE.DirectionalLight('#fff4d6', 0);
    this.scene.add(this.sun);

    // sol e lua apontam para o mesmo alvo, que segue o jogador
    this.lightTarget = new THREE.Object3D();
    this.scene.add(this.lightTarget);
    this.sun.target = this.lightTarget;
    this.moon.target = this.lightTarget;

    // sombras macias em tempo real do sol — acompanham o jogador
    const mobile = window.innerWidth < 900 || /Mobi|Android/i.test(navigator.userAgent);
    const mapSize = mobile ? 1024 : 2048;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -46; cam.right = 46; cam.top = 46; cam.bottom = -46;
    cam.near = 1; cam.far = 230;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
  }

  _buildSky() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#050a18') },
        uHorizon: { value: new THREE.Color('#0e1b30') },
        uSunColor: { value: new THREE.Color('#a8c0ff') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 1 },
        uSunStrength: { value: 0 },
        uTime: { value: 0 },
        uCloudLit: { value: new THREE.Color('#6f86a8') },
        uCloudShade: { value: new THREE.Color('#2a3a55') },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform vec3 uMoonDir;
        uniform vec3 uCloudLit;
        uniform vec3 uCloudShade;
        uniform float uNight;
        uniform float uSunStrength;
        uniform float uTime;
        varying vec3 vPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.52;
          for (int i = 0; i < 3; i++) {
            v += a * vnoise(p);
            p = p * 2.07 + 11.3;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.72));

          // brilho do horizonte (luz espalhada na atmosfera)
          col += uHorizon * pow(1.0 - h, 6.0) * 0.25;

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunDot, 5.0) * 0.12 * uSunStrength;
          col += uSunColor * pow(sunDot, 64.0) * 0.55 * uSunStrength;
          col += uSunColor * smoothstep(0.9992, 0.99965, sunDot) * 2.6 * uSunStrength;

          // lua
          float moonDot = max(dot(dir, normalize(uMoonDir)), 0.0);
          col += vec3(0.82, 0.90, 1.0) * smoothstep(0.99935, 0.99968, moonDot) * 2.2 * uNight;
          col += vec3(0.55, 0.72, 1.0) * pow(moonDot, 42.0) * 0.22 * uNight;

          // nuvens volumétricas (fbm projetada no domo)
          if (dir.y > 0.015) {
            vec2 p = dir.xz / max(dir.y, 0.02) * 0.55;
            float t = uTime * 0.012;
            float f = fbm(p * 0.85 + vec2(t, t * 0.45));
            float detail = vnoise(p * 3.2 - vec2(t * 1.9, t * 0.9));
            float density = f * 0.82 + detail * 0.24;
            float cover = smoothstep(0.44, 0.82, density) * smoothstep(0.015, 0.20, dir.y);
            float lit = clamp(density * 1.5 - 0.28, 0.0, 1.0);
            vec3 cloudCol = mix(uCloudShade, uCloudLit, lit);
            cloudCol += uSunColor * pow(sunDot, 8.0) * 0.35 * uSunStrength * lit;
            col = mix(col, cloudCol, clamp(cover, 0.0, 1.0) * 0.92);
          }

          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(260, 40, 24), material);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.sky.userData.noShadow = true;
    this.scene.add(this.sky);
  }

  _buildStars() {
    const count = 720;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.85 + 0.08;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      positions.set([Math.cos(a) * r * 240, y * 240, Math.sin(a) * r * 240], i * 3);
      sizes[i] = 0.8 + Math.random() * 2.2;
      phases[i] = Math.random() * 6.28;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: `
        attribute float size;
        attribute float phase;
        uniform float uTime;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (1.0 + sin(uTime * 1.6 + phase) * 0.22);
          gl_Position = projectionMatrix * mv;
          vAlpha = uOpacity * (0.55 + 0.45 * sin(uTime * 1.9 + phase * 1.7));
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d));
          gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }));
    this.stars.frustumCulled = false;
    this.stars.userData.noShadow = true;
    this.scene.add(this.stars);
  }

  /** Folhas e pétalas levadas pelo vento — o mundo respira mesmo parado. */
  _buildLeaves() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.translate(size / 2, size / 2);
    ctx.rotate(0.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.34, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, 0);
    ctx.lineTo(size * 0.3, 0);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const count = 110;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const data = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 34;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = 1.5 + Math.random() * 9;
      positions.set([x, y, z], i * 3);
      c.setHSL(0.18 + Math.random() * 0.14, 0.55, 0.55 + Math.random() * 0.2);
      colors.set([c.r, c.g, c.b], i * 3);
      data.push({
        base: new THREE.Vector3(x, y, z),
        phase: Math.random() * 6.28,
        speed: 0.5 + Math.random() * 0.9,
        fall: 0.25 + Math.random() * 0.5,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.leaves = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.5, map: texture, vertexColors: true, transparent: true,
      depthWrite: false, alphaTest: 0.02, opacity: 0.95, sizeAttenuation: true,
    }));
    this.leaves.frustumCulled = false;
    this.leaves.userData.noShadow = true;
    this.scene.add(this.leaves);
    this.leafData = data;
  }

  _buildClouds() {
    const texture = this.effects?.texture;
    if (!texture) return;
    this.clouds = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture, color: '#ffffff', transparent: true, opacity: 0.1,
        depthWrite: false, fog: false,
      }));
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 90;
      sprite.position.set(Math.cos(a) * r, 42 + Math.random() * 22, Math.sin(a) * r);
      const s = 26 + Math.random() * 34;
      sprite.scale.set(s, s * 0.42, 1);
      sprite.userData.speed = 0.25 + Math.random() * 0.35;
      this.clouds.add(sprite);
    }
    this.scene.add(this.clouds);
  }

  _buildWeather() {
    this.weatherGroup = new THREE.Group();
    this.weatherGroup.frustumCulled = false;
    this.scene.add(this.weatherGroup);

    // ---- chuva: riscos finos
    const rainCount = 520;
    this.rainDrops = [];
    const rainPos = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const d = { x: (Math.random() - 0.5) * 56, y: Math.random() * 32 - 6, z: (Math.random() - 0.5) * 56, v: 24 + Math.random() * 12 };
      this.rainDrops.push(d);
      rainPos.set([d.x, d.y, d.z, d.x, d.y + 0.9, d.z], i * 6);
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rain = new THREE.LineSegments(this.rainGeo, new THREE.LineBasicMaterial({
      color: '#a8d8ff', transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    this.rain.frustumCulled = false;
    this.weatherGroup.add(this.rain);

    // ---- neve e areia: pontos suaves
    this.snowGeo = this._pointCloud(360, '#ffffff', 0.24);
    this.snow = new THREE.Points(this.snowGeo, new THREE.PointsMaterial({
      color: '#ffffff', size: 0.32, map: this.effects?.texture, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.snow.frustumCulled = false;
    this.weatherGroup.add(this.snow);

    this.sandGeo = this._pointCloud(420, '#e2c08a', 0.2);
    this.sand = new THREE.Points(this.sandGeo, new THREE.PointsMaterial({
      color: '#e8c48c', size: 0.36, map: this.effects?.texture, transparent: true,
      opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false,
    }));
    this.sand.frustumCulled = false;
    this.weatherGroup.add(this.sand);
  }

  _pointCloud(count, _color, _size) {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr.set([(Math.random() - 0.5) * 54, Math.random() * 26 - 3, (Math.random() - 0.5) * 54], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  // ------------------------------------------------------------ vento
  /** Faz o material balançar com o vento (funciona também em InstancedMesh). */
  applyWind(material, amp = 1) {
    if (!material) return material;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = this.wind.time;
      shader.uniforms.uWindStrength = this.wind.strength;
      shader.vertexShader = `uniform float uWindTime;\nuniform float uWindStrength;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 windAnchor = instanceMatrix[3].xyz;
        #else
          vec3 windAnchor = vec3(0.0);
        #endif
        float windPhase = uWindTime * 1.7 + windAnchor.x * 0.5 + windAnchor.z * 0.37;
        float windAmount = uWindStrength * ${Number(amp).toFixed(2)} * max(0.0, position.y + 1.7);
        transformed.x += sin(windPhase) * windAmount * 0.2;
        transformed.z += cos(windPhase * 0.8) * windAmount * 0.12;
      `);
    };
    material.customProgramCacheKey = () => `wind-${amp}`;
    material.needsUpdate = true;
    return material;
  }

  // ------------------------------------------------------------ clima
  setWeather(id) {
    if (!WEATHER_INFO[id] || this.weather === id) return;
    this.weather = id;
    this.events?.emit('world:weather', { id, label: WEATHER_INFO[id].label });
    this._emitStatus(true);
  }

  _cycleWeather(dt) {
    this.weatherTimer -= dt;
    if (this.weatherTimer > 0) return;
    const biome = this.world.biomeId || 'floresta';
    const options = biome === 'gelo' ? ['neve', 'neve', 'limpo']
      : biome === 'deserto' ? ['areia', 'limpo', 'limpo']
        : ['limpo', 'limpo', 'chuva'];
    this.setWeather(options[Math.floor(Math.random() * options.length)]);
    this.weatherTimer = 50 + Math.random() * 45;
  }

  _updateWeather(dt, focus) {
    const target = { chuva: 0, neve: 0, areia: 0 };
    if (this.weather !== 'limpo') target[this.weather] = 1;
    const step = WEATHER_RAMP * dt;
    for (const key of Object.keys(this.mix)) {
      this.mix[key] += Math.max(-step, Math.min(step, target[key] - this.mix[key]));
    }

    if (focus) this.weatherGroup.position.set(focus.x, focus.y, focus.z);

    this.rain.material.opacity = this.mix.chuva * 0.5;
    this.snow.material.opacity = this.mix.neve * 0.9;
    this.sand.material.opacity = this.mix.areia * 0.55;

    if (this.mix.chuva > 0.01) this._animateRain(dt);
    if (this.mix.neve > 0.01) this._animateSnow(dt);
    if (this.mix.areia > 0.01) this._animateSand(dt);

    // nuvens ficam mais escuras com chuva e areia
    if (this.clouds) {
      const dark = clamp01(this.mix.chuva * 0.35 + this.mix.areia * 0.4);
      for (const cloud of this.clouds.children) {
        cloud.material.color.setRGB(1 - dark, 1 - dark * 0.85, 1 - dark * 0.7);
        cloud.material.opacity = 0.1 + this.mix.chuva * 0.16;
        cloud.position.x += cloud.userData.speed * dt * (1 + this.mix.areia * 6);
        if (cloud.position.x > 130) cloud.position.x = -130;
      }
    }
  }

  _animateRain(dt) {
    const attr = this.rainGeo.attributes.position;
    const arr = attr.array;
    const drift = this.wind.strength.value * 4 * dt;
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d.y -= d.v * dt;
      d.x += drift;
      if (d.y < -6) {
        d.y += 32;
        d.x = (Math.random() - 0.5) * 56;
        d.z = (Math.random() - 0.5) * 56;
      }
      if (d.x > 28) d.x -= 56;
      const o = i * 6;
      arr[o] = d.x; arr[o + 1] = d.y; arr[o + 2] = d.z;
      arr[o + 3] = d.x - 0.1; arr[o + 4] = d.y + 0.9; arr[o + 5] = d.z;
    }
    attr.needsUpdate = true;
  }

  _animateSnow(dt) {
    const attr = this.snowGeo.attributes.position;
    const arr = attr.array;
    const t = this.tick;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= dt * (1.1 + (i % 7) * 0.08);
      arr[i] += Math.sin(t * 0.7 + i) * dt * 0.5;
      arr[i + 2] += Math.cos(t * 0.5 + i * 0.7) * dt * 0.4;
      if (arr[i + 1] < -3) {
        arr[i + 1] += 29;
        arr[i] = (Math.random() - 0.5) * 54;
        arr[i + 2] = (Math.random() - 0.5) * 54;
      }
    }
    attr.needsUpdate = true;
  }

  _animateSand(dt) {
    const attr = this.sandGeo.attributes.position;
    const arr = attr.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += dt * (10 + (i % 5) * 1.6);
      arr[i + 1] += Math.sin(this.tick * 2 + i) * dt * 0.8;
      if (arr[i] > 27) {
        arr[i] -= 54;
        arr[i + 1] = Math.random() * 24 - 2;
        arr[i + 2] = (Math.random() - 0.5) * 54;
      }
    }
    attr.needsUpdate = true;
  }

  // ------------------------------------------------------------ ciclo
  _sampleSky(hours) {
    let a = SKY_KEYS[0], b = SKY_KEYS[1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (hours >= SKY_KEYS[i].h && hours <= SKY_KEYS[i + 1].h) {
        a = SKY_KEYS[i]; b = SKY_KEYS[i + 1];
        break;
      }
    }
    const raw = (hours - a.h) / Math.max(0.0001, b.h - a.h);
    const t = raw * raw * (3 - 2 * raw);
    this._cTop.copy(a.topC).lerp(b.topC, t);
    this._cHorizon.copy(a.horizonC).lerp(b.horizonC, t);
    this._cFog.copy(a.fogC).lerp(b.fogC, t);
    this._cHemiSky.copy(a.hemiSkyC).lerp(b.hemiSkyC, t);
    this._cHemiGround.copy(a.hemiGroundC).lerp(b.hemiGroundC, t);
    this._cSun.copy(a.sunC).lerp(b.sunC, t);
    return {
      density: a.density + (b.density - a.density) * t,
      hemi: a.hemi + (b.hemi - a.hemi) * t,
      sun: a.sun + (b.sun - a.sun) * t,
      moon: a.moon + (b.moon - a.moon) * t,
    };
  }

  _applySky(hours, focus) {
    const s = this._sampleSky(hours);
    this.sunIntensity = s.sun;

    // direção do sol: nasce a leste, se põe a oeste
    const angle = ((hours - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(angle), Math.max(-0.25, Math.sin(angle)), 0.35).normalize();

    // calor do crepúsculo e escuridão da noite alimentam o color grading
    this.warmth = clamp01(
      Math.max(0, 1 - Math.abs(hours - 6.4) / 1.7) + Math.max(0, 1 - Math.abs(hours - 18.9) / 1.9),
    );
    this.night = 1 - clamp01(s.sun * 1.6);

    // a lua fica do lado oposto ao sol
    this.moonDir.set(-this.sunDir.x, 0.72, -this.sunDir.z).normalize();

    if (this.sky) {
      const u = this.sky.material.uniforms;
      u.uTop.value.copy(this._cTop);
      u.uHorizon.value.copy(this._cHorizon);
      u.uSunColor.value.copy(this._cSun);
      u.uSunDir.value.copy(this.sunDir);
      u.uMoonDir.value.copy(this.moonDir);
      u.uNight.value = this.night;
      u.uSunStrength.value = clamp01(s.sun / 1.8);
      u.uTime.value = this.tick;

      // nuvens iluminadas pelo sol, sombreadas pelo céu
      this._cCloudLit.copy(this._cHorizon).lerp(new THREE.Color('#ffffff'), 0.42);
      this._cCloudLit.lerp(this._cSun, 0.3 * this.warmth + 0.12);
      this._cCloudLit.multiplyScalar(0.55 + 0.75 * clamp01(s.sun / 2.2));
      this._cCloudShade.copy(this._cTop).lerp(this._cFog, 0.45).multiplyScalar(0.85);
      u.uCloudLit.value.copy(this._cCloudLit);
      u.uCloudShade.value.copy(this._cCloudShade);

      this.sky.position.set(focus.x, 0, focus.z);
    }

    if (this.stars) {
      const u = this.stars.material.uniforms;
      u.uTime.value = this.tick;
      u.uOpacity.value = clamp01(1 - s.sun / 0.75) * 0.9;
    }

    // nuvens acompanham o jogador
    if (this.clouds) this.clouds.position.set(focus.x, 0, focus.z);

    const brightness = clamp(this.settings?.get('brightness') ?? 1, 0.6, 1.6);
    if (this.hemi) {
      this.hemi.color.copy(this._cHemiSky);
      this.hemi.groundColor.copy(this._cHemiGround);
      this.hemi.intensity = s.hemi * brightness;
    }

    if (this.lightTarget) this.lightTarget.position.set(focus.x, focus.y, focus.z);

    if (this.sun) {
      this.sun.color.copy(this._cSun);
      this.sun.intensity = s.sun * brightness;
      this.sun.position.set(focus.x + this.sunDir.x * 70, focus.y + this.sunDir.y * 70 + 8, focus.z + this.sunDir.z * 70);
    }
    if (this.moon) {
      this.moon.intensity = s.moon * brightness;
      this.moon.color.set('#9db8f0');
      this.moon.position.set(focus.x - this.sunDir.x * 70, focus.y + 55, focus.z - this.sunDir.z * 70);
    }

    // névoa do bioma, reforçada pelo clima
    const wet = this.mix.chuva * 0.35 + this.mix.neve * 0.55 + this.mix.areia * 1.1;
    if (this.scene.fog) {
      this.scene.fog.color.copy(this._cFog);
      if (this.mix.areia > 0.01) this.scene.fog.color.lerp(new THREE.Color('#b58a52'), this.mix.areia * 0.55);
      if (this.mix.neve > 0.01) this.scene.fog.color.lerp(new THREE.Color('#dbe8f5'), this.mix.neve * 0.35);
      this.scene.fog.density = s.density * (1 + wet);
    }
  }

  _updateWater() {
    const mat = this.world.pond?.material;
    if (!mat?.uniforms) return;
    if (mat.uniforms.uSky) mat.uniforms.uSky.value.copy(this._cHorizon);
    if (mat.uniforms.uSkyTop) mat.uniforms.uSkyTop.value.copy(this._cTop);
    if (mat.uniforms.uSun) mat.uniforms.uSun.value.copy(this._cSun);
    if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(this.sunDir);
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = this.tick;
  }

  _updateLeaves(dt, focus) {
    if (!this.leaves || !this.leafData) return;
    const pos = this.leaves.geometry.attributes.position;
    const arr = pos.array;
    this.leaves.position.set(focus.x, 0, focus.z);
    const windX = this.wind.strength.value * 1.2;
    const t = this.tick;
    for (let i = 0; i < this.leafData.length; i++) {
      const d = this.leafData[i];
      const o = i * 3;
      arr[o] += (Math.sin(t * d.speed + d.phase) * 0.5 + windX) * dt;
      arr[o + 1] -= d.fall * dt;
      arr[o + 2] += Math.cos(t * d.speed * 0.8 + d.phase) * 0.55 * dt;
      if (arr[o] > 30) arr[o] -= 60;
      if (arr[o] < -30) arr[o] += 60;
      if (arr[o + 2] > 30) arr[o + 2] -= 60;
      if (arr[o + 2] < -30) arr[o + 2] += 60;
      if (arr[o + 1] < 0.25) {
        arr[o + 1] = 9 + Math.random() * 3;
        arr[o] = (Math.random() - 0.5) * 40;
        arr[o + 2] = (Math.random() - 0.5) * 40;
      }
    }
    pos.needsUpdate = true;
  }

  _emitStatus(force = false) {
    if (!this.events) return;
    const hh = Math.floor(this.hours) % 24;
    const mm = Math.floor((this.hours % 1) * 60);
    const info = WEATHER_INFO[this.weather] || WEATHER_INFO.limpo;
    const icon = this.weather !== 'limpo' ? info.icon : (this.sunIntensity < 0.25 ? '🌙' : '☀️');
    const text = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${info.label}`;
    this.events.emit('world:status', { text, hours: this.hours, weather: this.weather, force });
  }

  // ------------------------------------------------------------ loop
  update(dt, focus) {
    if (!(dt > 0)) return;
    this.tick += dt;
    this.hours = (this.hours + (dt * 24) / DAY_SECONDS) % 24;

    const target = focus || this.world.respawn || new THREE.Vector3();
    this._cycleWeather(dt);
    this._updateWeather(dt, target);
    this._applySky(this.hours, target);

    this.wind.time.value = this.tick;
    this.wind.strength.value = 0.7 + this.mix.chuva * 0.8 + this.mix.areia * 1.5 + this.mix.neve * 0.3;
    grassWind.time.value = this.tick;
    grassWind.strength.value = this.wind.strength.value;

    this._updateWater();
    this._updateLeaves(dt, target);
    this.world.waterfall?.update(this.tick);

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      this._emitStatus();
    }
  }

  /** Texto curto para HUD/save (ex.: "🌙 20:24 · Céu limpo"). */
  get statusText() {
    const hh = Math.floor(this.hours) % 24;
    const mm = Math.floor((this.hours % 1) * 60);
    const info = WEATHER_INFO[this.weather] || WEATHER_INFO.limpo;
    return `${info.icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${info.label}`;
  }

  get isNight() { return this.sunIntensity < 0.25; }
}
