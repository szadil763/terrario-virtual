// Atmosfera viva do bosque: ciclo de dia e noite, céu procedural com sol, lua e
// estrelas, nuvens, clima em tempo real (limpo, chuva, neve, tempestade de areia),
// vento que mexe na vegetação e água que reflete o céu.
// Tudo procedural — nenhuma textura externa, nenhum asset binário.

import * as THREE from 'three';

const DAY_SECONDS = 480;      // um dia completo dura 8 minutos
const WEATHER_RAMP = 0.4;     // velocidade da transição de clima (por segundo)

// Paletas do céu ao longo do dia. Cada chave é interpolada com a próxima.
const SKY_KEYS = [
  { h: 0, top: '#04060d', horizon: '#0a1322', fog: '#0a1120', density: 0.026, hemiSky: '#1e2b47', hemiGround: '#08101c', hemi: 0.42, sun: 0.0, moon: 0.42, sunColor: '#a8c0ff' },
  { h: 4.6, top: '#081020', horizon: '#1b2b46', fog: '#0c1729', density: 0.024, hemiSky: '#28395c', hemiGround: '#0a1220', hemi: 0.48, sun: 0.08, moon: 0.32, sunColor: '#b7ccff' },
  { h: 6.4, top: '#2a4470', horizon: '#e0a071', fog: '#2a3c55', density: 0.019, hemiSky: '#5f7db0', hemiGround: '#24303f', hemi: 0.78, sun: 1.0, moon: 0.08, sunColor: '#ffd2a1' },
  { h: 9.0, top: '#4f8fd0', horizon: '#cfe6f2', fog: '#8fb6cf', density: 0.009, hemiSky: '#a9cdf0', hemiGround: '#4a5b46', hemi: 1.05, sun: 1.9, moon: 0.0, sunColor: '#fff4d6' },
  { h: 13.0, top: '#5ea6dd', horizon: '#dff0f8', fog: '#a9cbdc', density: 0.008, hemiSky: '#bcdcf7', hemiGround: '#55603f', hemi: 1.15, sun: 2.2, moon: 0.0, sunColor: '#ffffff' },
  { h: 17.2, top: '#4a7fb8', horizon: '#f6c08a', fog: '#9fb0b8', density: 0.011, hemiSky: '#a8bfd8', hemiGround: '#4e4a38', hemi: 0.95, sun: 1.5, moon: 0.0, sunColor: '#ffdcae' },
  { h: 19.2, top: '#243a63', horizon: '#c2707e', fog: '#4a4152', density: 0.017, hemiSky: '#6a6aa0', hemiGround: '#2a2230', hemi: 0.72, sun: 0.45, moon: 0.08, sunColor: '#ff9e7a' },
  { h: 21.2, top: '#0a1224', horizon: '#243050', fog: '#131d33', density: 0.023, hemiSky: '#2b3a5c', hemiGround: '#0a1220', hemi: 0.48, sun: 0.0, moon: 0.40, sunColor: '#a8c0ff' },
  { h: 24, top: '#04060d', horizon: '#0a1322', fog: '#0a1120', density: 0.026, hemiSky: '#1e2b47', hemiGround: '#08101c', hemi: 0.42, sun: 0.0, moon: 0.42, sunColor: '#a8c0ff' },
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

    this.hours = 20.4;            // começa no começo da noite, como no bosque original
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
  }

  // ------------------------------------------------------------ construção
  build() {
    this._buildSky();
    this._buildStars();
    this._buildClouds();
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
  }

  _buildSky() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color('#04060d') },
        uHorizon: { value: new THREE.Color('#0a1322') },
        uSunColor: { value: new THREE.Color('#a8c0ff') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
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
        varying vec3 vPos;
        void main() {
          vec3 dir = normalize(vPos);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 1.35));
          float facing = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(facing, 240.0) * 1.4 + pow(facing, 10.0) * 0.16);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 18), material);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _buildStars() {
    const count = 480;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.72 + 0.12;
      const r = Math.sqrt(1 - y * y);
      positions.set([Math.cos(a) * r * 168, y * 168, Math.sin(a) * r * 168], i * 3);
      sizes[i] = 0.6 + Math.random() * 1.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#e8f2ff', size: 1.1, sizeAttenuation: false, transparent: true,
      opacity: 0, depthWrite: false, fog: false,
    }));
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
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

    if (this.sky) {
      const u = this.sky.material.uniforms;
      u.uTop.value.copy(this._cTop);
      u.uHorizon.value.copy(this._cHorizon);
      u.uSunColor.value.copy(this._cSun);
      u.uSunDir.value.copy(this.sunDir);
      this.sky.position.set(focus.x, 0, focus.z);
    }

    if (this.stars) this.stars.material.opacity = clamp01(1 - s.sun / 0.7) * 0.85;

    // nuvens acompanham o jogador
    if (this.clouds) this.clouds.position.set(focus.x, 0, focus.z);

    if (this.hemi) {
      this.hemi.color.copy(this._cHemiSky);
      this.hemi.groundColor.copy(this._cHemiGround);
      this.hemi.intensity = s.hemi;
    }

    if (this.lightTarget) this.lightTarget.position.set(focus.x, focus.y, focus.z);

    if (this.sun) {
      this.sun.color.copy(this._cSun);
      this.sun.intensity = s.sun;
      this.sun.position.set(focus.x + this.sunDir.x * 70, focus.y + this.sunDir.y * 70 + 8, focus.z + this.sunDir.z * 70);
    }
    if (this.moon) {
      this.moon.intensity = s.moon;
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
    mat.uniforms.uSky.value.copy(this._cHorizon);
    mat.uniforms.uSun.value.copy(this._cSun);
    mat.uniforms.uTime.value = this.tick;
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

    this._updateWater();

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
