// Pós-processamento cinematográfico do bosque.
//
// A cena é desenhada em um render target HDR (linear, sem tone mapping), passa
// por extração de brilho + blur separável (bloom), raios de luz radiais
// (god rays a partir da posição do sol na tela) e um passe final com tone
// mapping ACES, color grading, vinheta e grão sutil.
//
// Tudo com shaders próprios — sem dependências externas (o three é vendado sem
// os addons de EffectComposer).

import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float luma = max(c.r, max(c.g, c.b));
    float soft = clamp(luma - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float contribution = max(luma - uThreshold, soft) / max(luma, 1e-4);
    gl_FragColor = vec4(c * contribution, 1.0);
  }
`;

const BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;
  void main() {
    // gaussiano de 9 amostras (5 coefs + simetria)
    float w0 = 0.2270270270;
    float w1 = 0.1945945946;
    float w2 = 0.1216216216;
    float w3 = 0.0540540541;
    float w4 = 0.0162162162;
    vec3 acc = texture2D(tDiffuse, vUv).rgb * w0;
    acc += texture2D(tDiffuse, vUv + uDirection * 1.0).rgb * w1;
    acc += texture2D(tDiffuse, vUv - uDirection * 1.0).rgb * w1;
    acc += texture2D(tDiffuse, vUv + uDirection * 2.0).rgb * w2;
    acc += texture2D(tDiffuse, vUv - uDirection * 2.0).rgb * w2;
    acc += texture2D(tDiffuse, vUv + uDirection * 3.0).rgb * w3;
    acc += texture2D(tDiffuse, vUv - uDirection * 3.0).rgb * w3;
    acc += texture2D(tDiffuse, vUv + uDirection * 4.0).rgb * w4;
    acc += texture2D(tDiffuse, vUv - uDirection * 4.0).rgb * w4;
    gl_FragColor = vec4(acc, 1.0);
  }
`;

const RAYS_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uSun;
  uniform float uDensity;
  uniform float uDecay;
  uniform float uWeight;
  varying vec2 vUv;
  const int STEPS = 24;
  void main() {
    vec2 delta = (vUv - uSun) * (uDensity / float(STEPS));
    vec2 uv = vUv;
    vec3 acc = vec3(0.0);
    float decay = 1.0;
    for (int i = 0; i < STEPS; i++) {
      uv -= delta;
      vec2 clamped = clamp(uv, vec2(0.0), vec2(1.0));
      acc += texture2D(tDiffuse, clamped).rgb * decay;
      decay *= uDecay;
    }
    acc /= float(STEPS);
    gl_FragColor = vec4(acc * uWeight, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tRays;
  uniform vec2 uResolution;
  uniform vec3 uSunColor;
  uniform float uExposure;
  uniform float uBloom;
  uniform float uRays;
  uniform float uTime;
  uniform float uVignette;
  uniform float uSaturation;
  uniform float uWarmth;
  uniform float uNight;
  uniform float uGrain;
  varying vec2 vUv;

  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 centered = vUv - 0.5;
    float r2 = dot(centered, centered);

    // aberração cromática bem discreta nas bordas (lente de cinema)
    float ca = 0.0022 * r2;
    vec3 col;
    col.r = texture2D(tScene, vUv + centered * ca).r;
    col.g = texture2D(tScene, vUv).g;
    col.b = texture2D(tScene, vUv - centered * ca).b;

    col += texture2D(tBloom, vUv).rgb * uBloom;
    col += texture2D(tRays, vUv).rgb * uRays * uSunColor;

    col *= uExposure;

    // grading: sombras frias à noite, altas-luzes douradas no crepúsculo
    col = mix(col, col * vec3(0.93, 0.99, 1.12), uNight * 0.6);
    col = mix(col, col * vec3(1.10, 1.01, 0.90), uWarmth * 0.7);

    col = aces(col);

    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, uSaturation);
    col = clamp((col - 0.5) * 1.055 + 0.5, 0.0, 1.0);

    float vig = 1.0 - smoothstep(0.16, 0.86, r2 * 1.9);
    col *= mix(1.0, 0.55 + vig * 0.45, uVignette);

    col = toSRGB(col);

    float grain = hash(vUv * uResolution + fract(uTime) * 57.0) - 0.5;
    col += grain * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }
`;

class FullScreenQuad {
  constructor(material) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer, target) {
    renderer.setRenderTarget(target || null);
    renderer.render(this.scene, this.camera);
  }
}

const makeTarget = (w, h, { samples = 0, type = THREE.HalfFloatType } = {}) => {
  const target = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)), {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples,
  });
  target.texture.generateMipmaps = false;
  return target;
};

export class PostFX {
  constructor(renderer, scene, camera, { quality = 'high' } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.enabled = true;

    const ext = renderer.extensions;
    this.hdr = renderer.capabilities.isWebGL2 !== false
      && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.samples = this.hdr && quality !== 'low' ? 4 : 0;

    this.bloomStrength = quality === 'low' ? 0.5 : 0.72;
    this.rayStrength = 0.9;
    this.exposure = 1.14;
    this.saturation = 1.16;
    this.vignette = 0.45;
    this.grain = 0.016;
    this.warmth = 0.0;
    this.night = 0.0;
    this._sunAmount = 0;
    this._sunUv = new THREE.Vector2(0.5, 1.2);
    this._sunColor = new THREE.Color('#ffe9b8');
    this._time = 0;
    this._bloomIterations = quality === 'low' ? 1 : 2;

    this.rtScene = null;
    this.rtBrightA = null;
    this.rtBrightB = null;
    this.rtBloom = null;
    this.rtRays = null;

    this.brightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 1.02 },
        uKnee: { value: 0.55 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BRIGHT_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1 / 512, 0) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: BLUR_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.raysMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uSun: { value: new THREE.Vector2(0.5, 0.5) },
        uDensity: { value: 0.75 },
        uDecay: { value: 0.965 },
        uWeight: { value: 1.0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: RAYS_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tRays: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uSunColor: { value: new THREE.Color('#ffe9b8') },
        uExposure: { value: 1.0 },
        uBloom: { value: this.bloomStrength },
        uRays: { value: 0.0 },
        uTime: { value: 0 },
        uVignette: { value: this.vignette },
        uSaturation: { value: this.saturation },
        uWarmth: { value: 0 },
        uNight: { value: 0 },
        uGrain: { value: this.grain },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.brightQuad = new FullScreenQuad(this.brightMaterial);
    this.blurQuad = new FullScreenQuad(this.blurMaterial);
    this.raysQuad = new FullScreenQuad(this.raysMaterial);
    this.compositeQuad = new FullScreenQuad(this.compositeMaterial);

    this.setSize(window.innerWidth, window.innerHeight);
  }

  /** Ajusta exposição/estilo — chamado pelas opções e pelo ciclo do dia. */
  setLook({ exposure, saturation, vignette, grain, bloom, rays } = {}) {
    if (exposure !== undefined) this.exposure = exposure;
    if (saturation !== undefined) this.saturation = saturation;
    if (vignette !== undefined) this.vignette = vignette;
    if (grain !== undefined) this.grain = grain;
    if (bloom !== undefined) this.bloomStrength = bloom;
    if (rays !== undefined) this.rayStrength = rays;
  }

  /** Sol na tela: uv (0..1, pode sair da tela), intensidade e cor. */
  setSun(uv, amount, color, { warmth = 0, night = 0 } = {}) {
    if (uv) this._sunUv.copy(uv);
    this._sunAmount = Math.max(0, amount);
    if (color) this._sunColor.copy(color);
    this.warmth = warmth;
    this.night = night;
  }

  setSize(width, height) {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const w = Math.max(2, Math.floor(size.x));
    const h = Math.max(2, Math.floor(size.y));
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;

    this.dispose();
    this.rtScene = makeTarget(w, h, {
      samples: this.samples,
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });

    const bw = Math.max(8, Math.floor(w / 2));
    const bh = Math.max(8, Math.floor(h / 2));
    this.rtBrightA = makeTarget(bw, bh);
    this.rtBrightB = makeTarget(bw, bh);
    this.rtBloom = makeTarget(bw, bh);
    this.rtRays = makeTarget(Math.floor(w / 4), Math.floor(h / 4));

    this.blurMaterial.uniforms.uDirection.value.set(1 / bw, 0);
    this.compositeMaterial.uniforms.uResolution.value.set(w, h);
  }

  dispose() {
    for (const key of ['rtScene', 'rtBrightA', 'rtBrightB', 'rtBloom', 'rtRays']) {
      if (this[key]) { this[key].dispose(); this[key] = null; }
    }
  }

  render(dt = 0) {
    const r = this.renderer;
    if (!this.enabled || !this.rtScene) {
      r.setRenderTarget(null);
      r.render(this.scene, this.camera);
      return;
    }
    this._time += dt;

    // 1. cena em HDR linear
    const prevClear = r.getClearAlpha();
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);
    r.setClearAlpha(prevClear);

    // 2. extração de brilho
    this.brightMaterial.uniforms.tDiffuse.value = this.rtScene.texture;
    this.brightQuad.render(r, this.rtBrightA);

    // 3. bloom: blur separável em duas escalas
    const bw = this.rtBrightA.width;
    const dir = this.blurMaterial.uniforms.uDirection.value;
    let src = this.rtBrightA;
    for (let i = 0; i < this._bloomIterations; i++) {
      const spread = i === 0 ? 1 : 2.6;
      dir.set(spread / bw, 0);
      this.blurMaterial.uniforms.tDiffuse.value = src.texture;
      this.blurQuad.render(r, this.rtBrightB);
      dir.set(0, spread / this.rtBrightA.height);
      this.blurMaterial.uniforms.tDiffuse.value = this.rtBrightB.texture;
      const dst = i === this._bloomIterations - 1 ? this.rtBloom : this.rtBrightA;
      this.blurQuad.render(r, dst);
      src = dst;
    }

    // 4. raios volumétricos radiais a partir do sol
    const rays = this.raysMaterial.uniforms;
    rays.tDiffuse.value = this.rtBloom.texture;
    rays.uSun.value.copy(this._sunUv);
    rays.uWeight.value = this._sunAmount;
    this.raysQuad.render(r, this.rtRays);

    // 5. composição final
    const c = this.compositeMaterial.uniforms;
    c.tScene.value = this.rtScene.texture;
    c.tBloom.value = this.rtBloom.texture;
    c.tRays.value = this.rtRays.texture;
    c.uSunColor.value.copy(this._sunColor);
    c.uExposure.value = this.exposure;
    c.uBloom.value = this.bloomStrength;
    c.uRays.value = this.rayStrength * Math.min(1, this._sunAmount);
    c.uTime.value = this._time;
    c.uSaturation.value = this.saturation;
    c.uVignette.value = this.vignette;
    c.uGrain.value = this.grain;
    c.uWarmth.value = this.warmth;
    c.uNight.value = this.night;

    r.setRenderTarget(null);
    this.compositeQuad.render(r, null);
  }
}
