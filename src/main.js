// Luz do Bosque — ponto de entrada. Monta renderizador, cena, sistemas,
// máquina de estados do jogo, ciclo principal, salvamento e integração da
// interface. Cada sistema vive em seu próprio módulo.

import * as THREE from 'three';
import { Emitter, StateMachine, clamp, randInt, rand } from './core/state.js';
import { Settings } from './core/settings.js';
import { SaveManager } from './core/save.js';
import { Input } from './core/input.js';
import { AudioManager } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { Effects } from './world/effects.js';
import { World } from './world/biome.js';
import { Player } from './player/player.js';
import { Lantern } from './player/lantern.js';
import { Combat } from './systems/combat.js';
import { EnemyManager } from './systems/enemies.js';
import { AncientGuardian } from './systems/miniboss.js';
import { Inventory, ITEMS } from './systems/loot.js';
import { QuestManager, DialogueSystem } from './systems/npc.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';

const SAVE_VERSION = 1;

class Game {
  constructor() {
    this.events = new Emitter();
    this.settings = new Settings(this.events);
    this.save = new SaveManager(this.events);
    this.canvas = document.getElementById('game');
    this.playtime = 0;
    this.tutorialFlags = new Set();
    this.autosaveTimer = 0;
    this.trackTimer = 0;
    this.locked = false;
    this.flags = {};
    this.ready = false;
  }

  // ============================================================== inicialização
  async boot() {
    this.setupRenderer();

    const steps = [
      ['Acendendo a lanterna mágica…', () => this.setupCore()],
      ['Plantando a Floresta Encantada…', () => this.setupWorld()],
      ['Acordando criaturas e amizades…', () => this.setupEntities()],
      ['Ligando a música do bosque…', () => this.setupUI()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [text, fn] = steps[i];
      await this.step(text, i / steps.length);
      fn();
    }
    await this.step('Pronto para explorar!', 1);
    this.ready = true;
    this.fsm.set('title');
    this.menus.updateTitleButtons();
    this.startLoop();
  }

  step(text, progress) {
    const label = document.getElementById('loading-text');
    const fill = document.getElementById('loading-fill');
    if (label) label.textContent = text;
    if (fill) fill.style.transform = `scaleX(${clamp(progress, 0.02, 1)})`;
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 300);
    this.camera.position.set(0, 6, 12);
    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.onResize());
  }

  setupCore() {
    this.input = new Input(this.canvas, this.settings, this.events);
    this.audio = new AudioManager(this.settings, this.events);
    this.effects = new Effects(this.scene, this.settings);
    this.cameraRig = new CameraRig(this.camera, this.settings);
    this.inventory = new Inventory();
    this.quests = new QuestManager(this.events);
    this.dialogue = new DialogueSystem(this.events, this.audio);
    this.combat = new Combat(this.scene, { effects: this.effects, audio: this.audio, settings: this.settings, events: this.events });
  }

  setupWorld() {
    this.world = new World(this.scene, {
      effects: this.effects, audio: this.audio, events: this.events, settings: this.settings,
    });
    this.world.build('floresta');
  }

  setupEntities() {
    this.player = new Player(this.scene, {
      settings: this.settings, events: this.events, effects: this.effects, audio: this.audio,
    });
    this.lantern = new Lantern(this.scene, {
      player: this.player, settings: this.settings, events: this.events,
      effects: this.effects, audio: this.audio, combat: this.combat,
    });
    this.miniboss = new AncientGuardian(
      this.scene,
      new THREE.Vector3(-24, this.world.terrainHeight(-24, -22), -22),
      { effects: this.effects, audio: this.audio, events: this.events, settings: this.settings, combat: this.combat },
    );
    this.world.deps.miniboss = this.miniboss;
    this.enemies = new EnemyManager(this.scene, {
      effects: this.effects, audio: this.audio, events: this.events, settings: this.settings,
    });
    this.world.populate(this.enemies);

    // poderes iniciais
    this.lantern.unlockMode('escudo');
    this.lantern.setBiome('floresta');

    // posição inicial no acampamento
    const start = new THREE.Vector3(0, this.world.terrainHeight(0, 7), 7);
    this.player.position.copy(start);
    this.player.facing = Math.PI;
    this.world.setRespawn(start.clone());
  }

  setupUI() {
    this.hud = new HUD({ events: this.events, settings: this.settings, input: this.input, audio: this.audio });
    this.menus = new Menus({ events: this.events, settings: this.settings, input: this.input, audio: this.audio, save: this.save, hud: this.hud });
    this.menus.game = this;
    this.hud.applyTouchPreference();

    // máquina de estados do jogo
    this.fsm = new StateMachine('loading', {
      title: { enter: () => { this.menus.show('title'); this.hud.setVisible(false); } },
      playing: { enter: () => { this.menus.hideAll(); this.hud.setVisible(true); this.applySettings(); } },
      paused: { enter: () => { this.menus.open('pause'); this.menus.updatePauseStats(this); } },
      dead: { enter: () => { this.menus.show('dead'); } },
    });

    this.bindEvents();
    this.applySettings();
  }

  applySettings() {
    this.renderer.toneMappingExposure = 1.08 * clamp(this.settings.get('brightness'), 0.6, 1.6);
    document.documentElement.style.setProperty('--ui', String(this.settings.get('textScale')));
    this.hud.applyTouchPreference();
  }

  // ============================================================== eventos
  bindEvents() {
    const e = this.events;

    e.on('game:new', () => this.startNew());
    e.on('game:continue', () => this.continueGame());
    e.on('game:resume', () => this.fsm.set('playing'));
    e.on('game:pause', () => { if (this.fsm.is('playing')) this.fsm.set('paused'); });
    e.on('game:quit', () => { this.autosave(true); this.fsm.set('title'); });
    e.on('game:save', ({ manual } = {}) => this.autosave(manual));
    e.on('game:load', () => this.loadFromSave());
    e.on('game:respawn', () => this.respawn());
    e.on('game:upgrade', ({ id }) => this.buyUpgrade(id));
    e.on('game:skin', ({ skin }) => { this.lantern.applySkin(skin); this.hud.toast('Nova aparência da lanterna!', '🎨'); });
    e.on('ui:pause-request', () => { if (this.fsm.is('playing')) this.fsm.set('paused'); });
    e.on('settings:change', () => this.applySettings());

    e.on('npc:talk', ({ id }) => {
      const npc = this.world.npcs.find((n) => n.id === id);
      if (!npc) return;
      this.dialogue.startFor(npc, this.makeCtx());
    });

    e.on('dialogue:choice', ({ index }) => this.chooseDialogue(index));
    e.on('dialogue:closed', () => { this.dialogue.close(); });

    e.on('player:damage', () => { this.cameraRig.shake(0.28); });
    e.on('player:blocked', () => { this.effects.ring(this.player.chestPosition, { color: '#bff6ff', from: 0.6, to: 2.2, life: 0.3 }); this.audio.sfx('shieldHit'); });
    e.on('player:down', () => this.onPlayerDown());
    e.on('camera:shake', (amount) => this.cameraRig.shake(amount));

    e.on('enemy:defeated', ({ position, drops }) => {
      for (const [id, min, max] of drops || []) this.world.spawnPickup(id, randInt(min, max), position.clone().add(new THREE.Vector3(rand(-1, 1), 0.4, rand(-1, 1))));
    });
    e.on('enemy:purified', ({ position }) => {
      this.world.spawnPickup('fragmento', 1, position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      this.quests.event('fragmento', { amount: 1 });
    });

    e.on('boss:start', ({ name }) => {
      this.audio.setTrack('boss');
      this.hud.setBoss(true, name, 1);
      this.hud.hint('Ataque o cristal do peito quando o Guardião baixar os braços! Use o dash para escapar do golpe.', 7);
    });
    e.on('boss:damage', ({ hp, maxHp }) => this.hud.setBoss(true, null, hp / maxHp));
    e.on('boss:defeated', ({ rewards, position }) => {
      this.hud.setBoss(false);
      this.audio.setTrack('explore');
      for (const [id, amount] of rewards) {
        for (let i = 0; i < Math.min(amount, 8); i++) {
          this.world.spawnPickup(id, Math.max(1, Math.ceil(amount / Math.min(amount, 8))), position.clone().add(new THREE.Vector3(rand(-4, 4), 0.6, rand(-4, 4))));
        }
      }
      this.hud.toast('O Guardião Antigo descansou em paz. A chave do cofre é sua!', '🏅');
      this.autosave(true);
    });
    e.on('boss:summon', ({ position, count }) => {
      for (let i = 0; i < count; i++) {
        this.enemies.spawn('sombra', position.clone().add(new THREE.Vector3(rand(-5, 5), 0.4, rand(-5, 5))));
      }
    });

    e.on('checkpoint:reached', ({ position }) => {
      this.world.setRespawn(new THREE.Vector3(position.x, this.world.terrainHeight(position.x, position.z), position.z));
      this.autosave(true);
    });
    e.on('quest:completed', ({ id }) => {
      this.onQuestCompleted(id);
      this.autosave(true);
    });
    e.on('world:altar', () => { this.autosave(true); this.hud.hint('A passagem entre biomas despertou! Explore tudo antes de seguir.', 7); });

    e.on('lantern:trick', ({ position }) => {
      for (const npc of this.world.npcs) {
        if (npc.position.distanceTo(position) < 9) npc.reactToTrick(null, this.makeCtx());
      }
    });
    e.on('lever:pulled', () => this.world.onLeverPulled(this.makeCtx()));

    // primeiro gesto: libera o áudio
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  // ============================================================== ciclo
  startLoop() {
    let last = performance.now();
    const loop = (now) => {
      const raw = (now - last) / 1000;
      last = now;
      const dt = clamp(raw, 0, 0.05);
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    const slow = this.combat?.hitStop > 0 ? 0.35 : 1;
    const d = dt * slow;
    this.audio?.update(dt);

    if (this.fsm.is('title') || this.fsm.is('loading')) {
      this.world?.update(dt, this.makeCtx());
      this.effects?.update(dt);
      this.cameraRig && this.spinCameraAtTitle(dt);
      this.input?.endFrame();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.fsm.is('dead')) {
      this.world.update(dt, this.makeCtx());
      this.effects.update(dt);
      this.updateCamera(dt);
      this.input.endFrame();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // teclas de conforto quando há telas abertas (consome a tecla para não
    // ser lida de novo no mesmo quadro por updatePlaying)
    if (this.dialogue.openData) {
      if (this.input.justPressed('interact') || this.input.justPressed('jump') || this.input.justPressed('pause')) {
        this.dialogue.close();
        this.input.consume('interact', 'jump', 'pause');
      }
    } else if (this.fsm.is('paused')) {
      if (this.input.justPressed('pause')) {
        if (this.menus.current && this.menus.current !== 'pause') this.menus.back();
        else this.fsm.set('playing');
        this.input.consume('pause');
        this.audio.sfx('ui');
      }
    } else if (this.menus.current) {
      if (this.input.justPressed('map') || this.input.justPressed('pause')) {
        this.menus.back();
        this.input.consume('map', 'pause');
      }
    }

    this.locked = this.menus.isOpen || this.fsm.is('paused');
    const ctx = this.makeCtx();
    this.world.update(this.locked ? dt * 0.15 : d, ctx);
    this.hud.update(dt, ctx);

    if (this.locked) {
      this.effects.update(dt * 0.4);
      this.updateCamera(dt);
    } else {
      this.updatePlaying(d, ctx);
      this.playtime += d;
    }
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  updatePlaying(dt, ctx) {
    const aiming = this.input.isDown('defense');

    // pausa
    if (this.input.justPressed('pause')) { this.fsm.set('paused'); this.audio.sfx('ui'); return; }
    if (this.input.justPressed('map')) { this.menus.open('map'); this.audio.sfx('ui'); return; }

    // diálogo / interação
    if (this.dialogue.openData) {
      if (this.input.justPressed('interact') || this.input.justPressed('jump')) this.dialogue.close();
      this.updateCamera(dt);
      return;
    }

    this.player.rememberCamera(this.cameraRig);
    this.player.update(dt, { input: this.input, world: this.world, cameraRig: this.cameraRig, aiming, inCombat: this.enemies.engaged, locked: false });

    this.lantern.update(dt, {
      input: this.input, aiming, world: this.world, enemies: this.enemies.list,
      miniboss: this.miniboss, inCombat: this.enemies.engaged,
    });

    this.world.interactions.update(dt, ctx);
    if (this.input.justPressed('interact')) {
      if (!this.world.interactions.interact(ctx)) this.audio.sfx('hurtSoft');
    }

    this.enemies.update(dt, {
      player: this.player, world: this.world, combat: this.combat, camera: this.camera,
      settings: this.settings, lantern: this.lantern,
    });
    this.miniboss.update(dt, { player: this.player, world: this.world, settings: this.settings, combat: this.combat });
    for (const npc of this.world.npcs) npc.update(dt, ctx);

    this.combat.update(dt, {
      player: this.player, enemies: this.enemies.list, miniboss: this.miniboss, world: this.world, crystals: this.world.crystals,
    });

    this.updateEscort(dt);
    this.updateTutorials(dt);
    this.updateCamera(dt);
    this.effects.update(dt);

    this.trackTimer -= dt;
    if (this.trackTimer <= 0) { this.trackTimer = 0.8; this.updateMusicTrack(); }

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = 25; this.autosave(); }
  }

  updateCamera(dt) {
    this.cameraRig.lookFromPointer(this.input, dt);
    const moving = this.player.moveSpeedRatio > 0.3 && this.player.grounded;
    this.cameraRig.update(dt, this.player.position, this.input, {
      aiming: this.player.aiming, moveDir: this.player.moveDir,
      world: this.world, autoAlign: moving && !this.player.aiming,
    });
  }

  spinCameraAtTitle(dt) {
    this.cameraRig.yaw += dt * 0.06;
    const target = this.player?.position || new THREE.Vector3(0, 0, 0);
    this.cameraRig.update(dt, target, this.input, { aiming: false });
  }

  // ============================================================== contexto
  makeCtx() {
    if (!this._ctx) {
      const game = this;
      this._ctx = {
        get player() { return game.player; },
        get lantern() { return game.lantern; },
        get world() { return game.world; },
        get enemies() { return game.enemies; },
        get miniboss() { return game.miniboss; },
        get combat() { return game.combat; },
        get inventory() { return game.inventory; },
        get quests() { return game.quests; },
        get settings() { return game.settings; },
        get audio() { return game.audio; },
        get effects() { return game.effects; },
        get events() { return game.events; },
        get input() { return game.input; },
        get npcs() { return game.world.npcs; },
        dialogue: { open: (data) => this.dialogue.open(data), close: () => this.dialogue.close() },
        give: (id, amount) => game.give(id, amount),
        toast: (text, icon) => game.hud.toast(text, icon),
        actions: {
          upgrades: () => this.menus.open('upgrades'),
          save: () => { this.autosave(true); },
          follow: () => this.startEscort(),
        },
      };
    }
    return this._ctx;
  }

  /** Entrega itens ao jogador, aplicando efeitos de relíquias, poderes e missões. */
  give(id, amount = 1) {
    const def = ITEMS[id];
    if (!def) return;
    this.inventory.add(id, amount);
    this.events.emit('item:gained', { id, amount });
    if (def.kind === 'relic') {
      for (let i = 0; i < amount; i++) {
        this.lantern.applyRelic(def.effect || {});
        this.hud.toast(`${def.name}: efeito permanente ativado!`, def.icon);
      }
    } else if (def.kind === 'trick') {
      if (this.lantern.unlockTrick(def.trick)) this.hud.toast(`Nova manobra aprendida: ${def.name}`, def.icon);
    } else if (def.kind === 'skin') {
      this.hud.toast(`Nova aparência: ${def.name}`, def.icon);
    } else if (def.kind === 'map') {
      this.hud.toast('Mapa do bosque: novos pontos marcados!', '🗺');
    } else if (id === 'fragmento') {
      this.quests.event('fragmento', { amount });
    }
  }

  buyUpgrade(id) {
    const cost = this.lantern.nextUpgradeCost(id);
    if (cost === null) { this.hud.toast('Essa melhoria já está no máximo.', '🔷'); return; }
    if (!this.inventory.has('cristal', cost)) { this.hud.toast(`Cristais insuficientes (faltam ${cost - this.inventory.count('cristal')}).`, '🔷'); return; }
    this.inventory.remove('cristal', cost);
    this.lantern.applyUpgrade(id);
    this.audio.sfx('levelup');
    this.hud.toast('Lanterna melhorada!', '🏮');
    this.autosave(true);
  }

  // ============================================================== fluxo
  startNew() {
    this.inventory = new Inventory();
    this.quests = new QuestManager(this.events);
    this.lantern.load({ unlockedModes: [], unlockedTricks: ['giro', 'orbita'] });
    this.miniboss.load({ hp: this.miniboss.maxHp, defeated: false });
    this.world.load({ flags: {}, interactions: [], gates: [], respawn: [0, this.world.terrainHeight(0, 7), 7] });
    this.player.maxHealth = 100;
    this.player.health = 100;
    this.player.maxEnergy = 100;
    this.player.energy = 100;
    this.player.position.set(0, this.world.terrainHeight(0, 7), 7);
    this.world.setRespawn(this.player.position.clone());
    this.enemies.clear();
    this.world.populate(this.enemies);
    this.lantern.unlockMode('escudo');
    this.fsm.set('playing');
    this.hud.hint('WASD anda · SHIFT corre · setas ou mouse giram a câmera · M1 atira luz · segure M1 para carregar!', 9);
    this.hud.toast('Encontre Lumi, o vagalume-guia, no acampamento.', '🏮');
    this.autosave(true);
  }

  continueGame() {
    if (!this.loadFromSave()) this.startNew();
    else this.fsm.set('playing');
  }

  onPlayerDown() {
    this.fsm.set('dead');
    this.audio.setTrack('safe');
  }

  respawn() {
    const spawn = this.world.respawn.clone();
    this.player.position.copy(new THREE.Vector3(spawn.x, this.world.terrainHeight(spawn.x, spawn.z), spawn.z));
    this.player.velocity.set(0, 0, 0);
    this.player.health = this.player.maxHealth * 0.7;
    this.player.energy = this.player.maxEnergy;
    this.player.invulnerable = 2.4;
    this.combat.clearOwner('enemy');
    this.fsm.set('playing');
    this.hud.toast('Você levantou de novo. A escuridão pode esperar!', '🔆');
  }

  // ------------------------------------------------------------- missões
  chooseDialogue(index) {
    const data = this.dialogue.openData;
    const choice = data?.choices?.[index];
    if (!choice) { this.dialogue.close(); return; }
    this.audio.sfx('ui');
    if (choice.action) this.makeCtx().actions[choice.action]?.();
    const npc = this.dialogue.npc;
    if (!choice.next) {
      this.dialogue.close();
      // Lumi ensina um poder na primeira conversa
      if (npc?.id === 'lumi' && !this.lantern.unlockedModes.has('revelacao')) {
        this.lantern.unlockMode('revelacao');
        this.hud.toast('Novo poder: Revelação! Use M4 para alternar e M1 para revelar segredos.', '👁');
        this.audio.sfx('levelup');
      }
      return;
    }
    const lines = npc?.def?.lines || {};
    const node = lines[choice.next];
    const text = Array.isArray(node) ? node[0] : node || 'Hmm…';
    this.dialogue.open({ name: npc?.def?.name || '—', text, choices: npc?.def?.choices || [{ label: 'Ok', next: null }] });
  }

  startEscort() {
    const teo = this.world.npcs.find((n) => n.id === 'teo');
    if (!teo) return;
    teo.follow();
    this.flags.teoFollowing = true;
    this.hud.toast('Téo está seguindo você. Leve-o até o acampamento!', '🚶');
  }

  updateEscort(dt) {
    if (!this.flags.teoFollowing) return;
    const teo = this.world.npcs.find((n) => n.id === 'teo');
    if (!teo) return;
    const camp = new THREE.Vector3(0, 0, 0);
    if (Math.hypot(teo.position.x - camp.x, teo.position.z - camp.z) < 7) {
      teo.stopFollowing();
      this.flags.teoFollowing = false;
      this.quests.advance('teo_perdido');
      this.give('moeda', 45);
      this.give('cristal', 5);
      this.give('reliquia_leveza', 1);
      this.audio.sfx('quest');
    }
  }

  updateTutorials() {
    const p = this.player.position;
    const hint = (id, text, seconds = 6) => {
      if (this.tutorialFlags.has(id)) return;
      this.tutorialFlags.add(id);
      this.hud.hint(text, seconds);
    };
    if (!this.tutorialFlags.has('started')) {
      this.tutorialFlags.add('started');
      setTimeout(() => this.hud.hint('Chegue perto de objetos brilhantes e aperte E para interagir.', 7), 11000);
    }
    if (Math.hypot(p.x - 10, p.z + 16) < 12) hint('bramble', 'Estas raízes fecham o caminho: use o Pulso luminoso (M3) para fazer uma ponte de raízes!');
    if (Math.hypot(p.x + 24, p.z + 22) < 16) hint('tower', 'As ruínas da torre guardam um Guardião. Ilumine o cristal dele quando ele baixar os braços.');
    if (Math.hypot(p.x - 20, p.z - 24) < 14) hint('plateau', 'Use o gancho luminoso (M4 para alternar, M1 perto do anel brilhante) para subir.');
    if (Math.hypot(p.x + 16, p.z - 9) < 12) hint('pond', 'Cristais acesos pela luz revelam esconderijos. Tente acertar os quatro!');
    if (this.world.isSafe(p) && !this.tutorialFlags.has('camp')) {
      hint('camp', 'Área segura: aqui você pode conversar, salvar e descansar na fogueira (E).', 7);
    }
  }

  onQuestCompleted(id) {
    if (id === 'luz_do_bosque') {
      if (this.lantern.unlockMode('gancho')) {
        this.hud.toast('Poder desbloqueado: Gancho luminoso! Use M4 para alternar.', '🪝');
      }
      this.give('cristal', 10);
    }
    if (id === 'flores_da_clareira') this.give('reliquia_foco', 1);
    this.audio.sfx('levelup');
  }

  // ------------------------------------------------------------- música
  updateMusicTrack() {
    const p = this.player.position;
    if (this.miniboss.alive && this.miniboss.awake) { this.audio.setTrack('boss'); return; }
    if (this.enemies.engaged) { this.audio.setTrack('combat'); return; }
    if (this.world.isSafe(p)) { this.audio.setTrack('safe'); return; }
    const nearSecret = this.world.interactions.list.some((o) => o.revealed && o.hidden && o.position.distanceTo(p) < 10);
    this.audio.setTrack(nearSecret ? 'secret' : 'explore');
  }

  // ------------------------------------------------------------- salvamento
  buildState() {
    return {
      version: SAVE_VERSION,
      playtime: this.playtime,
      player: {
        position: Number.isFinite(this.player.position.x + this.player.position.z)
          ? this.player.position.toArray()
          : this.world.respawn.toArray(),
        facing: this.player.facing,
        health: this.player.health, maxHealth: this.player.maxHealth,
        energy: this.player.energy, maxEnergy: this.player.maxEnergy,
      },
      lantern: this.lantern.serialize(),
      inventory: this.inventory.serialize(),
      quests: this.quests.serialize(),
      world: this.world.serialize(),
      flags: this.flags,
      tutorials: [...this.tutorialFlags],
    };
  }

  autosave(force = false) {
    if (!this.ready) return;
    if (force) this.save.write(this.buildState());
    else this.save.writeThrottled(this.buildState(), 25);
  }

  loadFromSave() {
    const data = this.save.read();
    if (!data) return false;
    try {
      if (data.player && Array.isArray(data.player.position) && data.player.position.every((v) => Number.isFinite(v))) {
        this.player.position.fromArray(data.player.position);
        this.player.facing = data.player.facing || 0;
        this.player.maxHealth = data.player.maxHealth || 100;
        this.player.maxEnergy = data.player.maxEnergy || 100;
        this.player.health = clamp(data.player.health ?? this.player.maxHealth, 1, this.player.maxHealth);
        this.player.energy = clamp(data.player.energy ?? this.player.maxEnergy, 0, this.player.maxEnergy);
      }
      this.inventory.load(data.inventory || []);
      this.quests.load(data.quests || {});
      this.lantern.load(data.lantern || {});
      this.world.load(data.world || {});
      this.flags = data.flags || {};
      this.tutorialFlags = new Set(data.tutorials || []);
      this.playtime = data.playtime || 0;
      if (this.flags.teoFollowing) {
        const teo = this.world.npcs.find((n) => n.id === 'teo');
        teo?.follow();
      }
      this.hud.toast('Progresso carregado. Bem-vindo de volta!', '📂');
      return true;
    } catch (err) {
      console.error('[save] falha ao carregar', err);
      this.hud.toast('Não foi possível carregar o progresso.', '⚠️');
      return false;
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

const game = new Game();
window.__game = game; // acesso de depuração/verificação
game.boot().catch((err) => {
  console.error('[boot] falha ao iniciar', err);
  const label = document.getElementById('loading-text');
  if (label) label.textContent = 'Não foi possível iniciar o jogo. Veja o console para detalhes.';
});
