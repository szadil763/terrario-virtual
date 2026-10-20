// Telas e menus: início, pausa, opções/acessibilidade, melhorias da lanterna,
// mochila, missões, mapa completo, diálogo, morte e ajuda com remapeamento.

import { clamp } from '../core/state.js';
import { UPGRADES, TRICK_DEFS, BIOME_POWERS } from '../player/lantern.js';
import { ITEMS } from '../systems/loot.js';
import { BIOME_LIST } from '../world/biome.js';
import { ACTIONS, ACTION_LABELS } from '../core/input.js';

const $ = (id) => document.getElementById(id);
const TOUCH_LABELS = { auto: 'Automático', on: 'Sempre visível', off: 'Desligado' };

export class Menus {
  constructor({ events, settings, input, audio, save, hud }) {
    this.events = events;
    this.settings = settings;
    this.input = input;
    this.audio = audio;
    this.save = save;
    this.hud = hud;
    this.current = null; // id da tela aberta
    this.game = null;    // referência injetada pelo main

    this.screens = {
      title: $('title'), pause: $('screen-pause'), settings: $('screen-settings'), help: $('screen-help'),
      upgrades: $('screen-upgrades'), inventory: $('screen-inventory'), quests: $('screen-quests'),
      map: $('screen-map'), dead: $('screen-dead'), loading: $('loading'),
    };
    this.dialogueEl = $('dialogue');
    this.dialogueOpen = false;

    this.wireStatic();
    this.events.on('dialogue:open', (data) => this.showDialogue(data));
    this.events.on('dialogue:close', () => this.hideDialogue());
    this.events.on('settings:change', () => { if (this.current === 'settings') this.renderSettings(); });
    this.events.on('input:capture', () => { if (this.current === 'settings') this.renderSettings(); });
  }

  wireStatic() {
    $('btn-new')?.addEventListener('click', () => this.audio?.sfx('ui') || this.events.emit('game:new', {}));
    $('btn-continue')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('game:continue', {}); });
    $('btn-help-title')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('help'); });
    $('btn-settings-title')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('settings'); });
    $('btn-wipe')?.addEventListener('click', () => {
      this.save.clear();
      this.audio?.sfx('ui');
      this.events.emit('ui:toast', { text: 'Progresso apagado.', icon: '🗑' });
      this.updateTitleButtons();
    });

    $('btn-resume')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('game:resume', {}); });
    $('btn-upgrades')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('upgrades'); });
    $('btn-inventory')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('inventory'); });
    $('btn-quests')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('quests'); });
    $('btn-map-full')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('map'); });
    $('btn-settings')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('settings'); });
    $('btn-help-pause')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.open('help'); });
    $('btn-save')?.addEventListener('click', () => { this.audio?.sfx('save'); this.events.emit('game:save', { manual: true }); });
    $('btn-load')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('game:load', {}); });
    $('btn-quit')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('game:quit', {}); });
    $('btn-respawn')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('game:respawn', {}); });

    // delegação: as telas de melhorias/mochila/missões/mapa/opções são
    // desenhadas dinamicamente, então o botão "Voltar" precisa ser capturado aqui.
    document.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-close]');
      if (!btn) return;
      this.audio?.sfx('ui');
      this.back();
    });
    $('btn-dialogue-close')?.addEventListener('click', () => { this.audio?.sfx('ui'); this.events.emit('dialogue:closed', {}); });
  }

  updateTitleButtons() {
    const has = this.save.has();
    $('btn-continue')?.classList.toggle('hidden', !has);
  }

  /** Abre uma tela; guarda de onde veio para voltar corretamente. */
  open(id) {
    const previous = this.current;
    if (previous && ['settings', 'help', 'upgrades', 'inventory', 'quests', 'map'].includes(previous) && ['settings', 'help', 'upgrades', 'inventory', 'quests', 'map'].includes(id)) {
      this.returnTo = this.returnTo || previous;
    } else {
      this.returnTo = previous;
    }
    this.hideAll();
    const screen = this.screens[id];
    if (screen) screen.classList.remove('hidden');
    this.current = id;
    if (id === 'settings') this.renderSettings();
    if (id === 'help') this.renderHelp();
    if (id === 'upgrades') this.renderUpgrades();
    if (id === 'inventory') this.renderInventory();
    if (id === 'quests') this.renderQuests();
    if (id === 'map') this.renderMap();
    this.events.emit('ui:screen', { id });
  }

  back() {
    const target = this.returnTo;
    this.returnTo = null;
    if (target && this.screens[target]) this.open(target);
    else this.hideAll();
  }

  hideAll() {
    Object.values(this.screens).forEach((s) => s?.classList.add('hidden'));
    this.current = null;
  }

  show(id) {
    this.hideAll();
    this.screens[id]?.classList.remove('hidden');
    this.current = id;
  }

  get isOpen() { return !!this.current || this.dialogueOpen; }

  // ------------------------------------------------------------ opções
  renderSettings() {
    const s = this.settings;
    const panel = $('settings-panel');
    if (!panel) return;
    const slider = (key, label, min, max, step, fmt) => `
      <label class="field">
        <span class="lab"><span>${label}</span><span id="val-${key}">${fmt(s.get(key))}</span></span>
        <input type="range" id="set-${key}" min="${min}" max="${max}" step="${step}" value="${s.get(key)}">
      </label>`;
    const toggle = (key, label, hint) => `
      <div class="switch">
        <div><div>${label}</div><span class="hint">${hint}</span></div>
        <button class="btn small ${s.get(key) ? 'primary' : 'ghost'}" data-toggle="${key}">${s.get(key) ? 'Ligado' : 'Desligado'}</button>
      </div>`;
    const diff = s.get('difficulty') <= 0.7 ? 'facil' : s.get('difficulty') >= 1.3 ? 'desafiador' : 'normal';

    panel.innerHTML = `
      <h2>⚙ Opções e acessibilidade</h2>
      <h3>Conforto visual</h3>
      ${slider('brightness', 'Brilho da cena', 0.6, 1.6, 0.05, (v) => `${Math.round(v * 100)}%`)}
      ${slider('fx', 'Intensidade dos efeitos', 0, 1.5, 0.1, (v) => `${Math.round(v * 100)}%`)}
      ${slider('textScale', 'Tamanho do texto', 0.9, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`)}
      <h3>Som</h3>
      ${slider('music', 'Música', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
      ${slider('sfx', 'Efeitos sonoros', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
      ${slider('ambient', 'Ambiente', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
      <p class="hint">Nada de sustos sonoros: o volume ambiente começa baixinho e sobe devagar.</p>
      <h3>Controle e conforto</h3>
      ${toggle('calm', 'Exploração tranquila', 'Inimigos mais gentis, menos dano e mais tolerância a erros.')}
      ${toggle('tutorials', 'Dicas de tutorial', 'Mostra dicas curtas durante a aventura.')}
      ${toggle('invertY', 'Inverter eixo vertical', 'Para quem prefere a câmera invertida.')}
      <div class="switch">
        <div><div>Controles de toque</div><span class="hint">Botões na tela para jogar sem teclado.</span></div>
        <button class="btn small ghost" data-touch-cycle>${TOUCH_LABELS[s.get('touch')] || TOUCH_LABELS.auto}</button>
      </div>
      ${slider('sensitivity', 'Sensibilidade da câmera', 0.4, 2, 0.1, (v) => `${Math.round(v * 100)}%`)}
      <h3>Dificuldade do combate</h3>
      <div class="row">
        <button class="btn small ${diff === 'facil' ? 'primary' : 'ghost'}" data-diff="0.6">Tranquilo</button>
        <button class="btn small ${diff === 'normal' ? 'primary' : 'ghost'}" data-diff="1">Normal</button>
        <button class="btn small ${diff === 'desafiador' ? 'primary' : 'ghost'}" data-diff="1.5">Desafiador</button>
      </div>
      <h3>Comandos</h3>
      <p class="hint">Toque em um comando e pressione a tecla ou o botão do mouse que quiser usar. M1–M4 funcionam em mouses com botões extras e podem ser remapeados para o teclado.</p>
      <div id="bind-list"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn small ghost" id="btn-reset-settings">Restaurar padrões</button>
      </div>
      <div class="closebar"><button class="btn" data-close>Voltar</button></div>`;

    const bindList = panel.querySelector('#bind-list');
    for (const action of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'kv';
      const capturing = this.input.capture === action;
      row.innerHTML = `<span>${ACTION_LABELS[action] || action}</span>
        <button class="btn small ${capturing ? 'gold' : 'ghost'}" data-bind="${action}">${capturing ? 'Pressione…' : s.label(action)}</button>`;
      bindList.appendChild(row);
    }

    panel.querySelectorAll('[data-bind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.input.beginCapture(btn.dataset.bind);
        this.renderSettings();
      });
    });
    panel.querySelector('[data-touch-cycle]')?.addEventListener('click', () => {
      const order = ['auto', 'on', 'off'];
      const next = order[(order.indexOf(String(this.settings.get('touch'))) + 1) % order.length];
      this.settings.set('touch', next);
      this.hud?.applyTouchPreference();
      this.audio?.sfx('ui');
      this.renderSettings();
    });
    panel.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        this.settings.set(key, !this.settings.get(key));
        this.audio?.sfx('ui');
        this.renderSettings();
      });
    });
    panel.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.set('difficulty', Number(btn.dataset.diff));
        this.settings.set('calm', Number(btn.dataset.diff) <= 0.7);
        this.audio?.sfx('ui');
        this.renderSettings();
      });
    });
    panel.querySelector('#btn-reset-settings')?.addEventListener('click', () => {
      this.settings.reset();
      this.audio?.sfx('ui');
      this.renderSettings();
    });
    ['brightness', 'fx', 'textScale', 'music', 'sfx', 'ambient', 'sensitivity'].forEach((key) => {
      const input = panel.querySelector(`#set-${key}`);
      input?.addEventListener('input', () => {
        const value = Number(input.value);
        this.settings.set(key, value);
        const label = panel.querySelector(`#val-${key}`);
        if (label) label.textContent = `${Math.round(value * 100)}%`;
      });
    });
  }

  // ------------------------------------------------------------ ajuda
  renderHelp() {
    const body = $('help-body');
    if (!body) return;
    const s = this.settings;
    body.innerHTML = `
      <h2>🎮 Controles</h2>
      <div class="kv"><span>Mover</span><span><span class="key">W</span> <span class="key">A</span> <span class="key">S</span> <span class="key">D</span></span></div>
      <div class="kv"><span>Dash (desviar e passar por espaços)</span><span class="key">${s.keyLabel('dash')}</span></div>
      <div class="kv"><span>Pular</span><span class="key">${s.keyLabel('jump')}</span></div>
      <div class="kv"><span>Ataque da lanterna (M1) — segure para carregar</span><span class="key">${s.keyLabel('attack')}</span></div>
      <div class="kv"><span>Defesa / mira com escudo de luz (M2)</span><span class="key">${s.keyLabel('defense')}</span></div>
      <div class="kv"><span>Pulso luminoso (M3)</span><span class="key">${s.keyLabel('special')}</span></div>
      <div class="kv"><span>Alternar poder (M4)</span><span class="key">${s.keyLabel('toggle')}</span></div>
      <div class="kv"><span>Manobras divertidas com a lanterna</span><span class="key">${s.keyLabel('trick')}</span></div>
      <div class="kv"><span>Interagir (baús, portas, NPCs, placas)</span><span class="key">${s.keyLabel('interact')}</span></div>
      <div class="kv"><span>Mapa</span><span class="key">${s.keyLabel('map')}</span></div>
      <div class="kv"><span>Pausa</span><span class="key">${s.keyLabel('pause')}</span></div>
      <p style="margin-top:10px">Mouse: <b>M1</b> ataque, <b>M2</b> defesa/mira, <b>M3</b> especial, <b>M4</b> alternar poder. Sem esses botões? Remapeie tudo em <b>Opções → Comandos</b> ou use os controles de toque.</p>
      <h3>Dicas para explorar o escuro</h3>
      <p>• A luz da lanterna revela passagens, inscrições e objetos escondidos.<br>
         • Criaturas corrompidas ficam em paz quando iluminadas com purificação (modo Revelação).<br>
         • Cristais refletem a luz: use-os para atingir alvos distantes.<br>
         • O pulso luminoso (M3) cresce raízes, abre flores e afasta criaturas.<br>
         • Use R perto de amigos: eles adoram manobras!</p>
      <h3>Missões e progressão</h3>
      <p>Converse com todos, abra baús, purifique criaturas e acenda o Altar da Clareira Antiga para despertar a passagem entre biomas.</p>`;
  }

  // ------------------------------------------------------------ melhorias
  renderUpgrades() {
    const panel = $('upgrades-panel');
    const game = this.game;
    if (!panel || !game) return;
    const lantern = game.lantern;
    const crystals = game.inventory.count('cristal');
    const rows = UPGRADES.map((u) => {
      const lv = lantern.upgradeLevel(u.id);
      const cost = lantern.nextUpgradeCost(u.id);
      const pips = Array.from({ length: u.max }, (_, i) => `<span class="pill ${i < lv ? '' : 'off'}">${i < lv ? '●' : '○'}</span>`).join(' ');
      const canBuy = cost !== null && crystals >= cost;
      return `<div class="item">
        <div class="ico">${u.icon}</div>
        <div class="grow"><div class="t">${u.name} ${pips}</div><div class="d">${u.desc}</div></div>
        ${cost === null
          ? '<span class="pill">Máximo</span>'
          : `<button class="btn small ${canBuy ? 'primary' : 'ghost'}" data-upgrade="${u.id}" ${canBuy ? '' : 'disabled'}>🔷 ${cost}</button>`}
      </div>`;
    }).join('');

    const relics = game.inventory.list().filter((i) => i.def?.kind === 'relic');
    const skins = game.inventory.list().filter((i) => i.def?.kind === 'skin');
    const modes = Object.entries(BIOME_POWERS).map(([id, p]) => `
      <div class="item">
        <div class="ico">${id === 'floresta' ? '🌲' : id === 'cristal' ? '💎' : id === 'deserto' ? '🏜' : id === 'pantano' ? '🍄' : id === 'gelo' ? '❄️' : id === 'ruinas' ? '🏛' : '🌑'}</div>
        <div class="grow"><div class="t" style="color:${p.color}">${p.name}</div><div class="d">${p.locked ? '🔒 Bioma adormecido — desperte o Altar para explorar.' : p.desc}</div></div>
      </div>`).join('');

    panel.innerHTML = `
      <h2>🏮 Melhorias da lanterna</h2>
      <p>Cristais disponíveis: <b>🔷 ${crystals}</b> · Fragmentos: <b>✨ ${game.inventory.count('fragmento')}</b></p>
      <div class="list" style="margin-top:10px">${rows}</div>
      <h3>Relíquias encontradas</h3>
      <div class="list">${relics.length ? relics.map((r) => `<div class="item"><div class="ico">${r.def.icon}</div><div class="grow"><div class="t">${r.def.name}</div><div class="d">${r.def.desc}</div></div><span class="pill">${r.amount}</span></div>`).join('') : '<p>Nenhuma ainda. Explore baús secretos!</p>'}</div>
      <h3>Aparência da lanterna</h3>
      <div class="list">
        ${skins.length ? skins.map((s) => `<div class="item"><div class="ico">${s.def.icon}</div><div class="grow"><div class="t">${s.def.name}</div><div class="d">${s.def.desc}</div></div><button class="btn small" data-skin="${s.def.skin}">Usar</button></div>`).join('') : '<p>Nenhuma cor extra ainda.</p>'}
      </div>
      <h3>Poderes dos biomas</h3>
      <div class="list">${modes}</div>
      <div class="closebar"><button class="btn" data-close>Voltar</button></div>`;

    panel.querySelectorAll('[data-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.events.emit('game:upgrade', { id: btn.dataset.upgrade });
        this.renderUpgrades();
      });
    });
    panel.querySelectorAll('[data-skin]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.events.emit('game:skin', { skin: btn.dataset.skin });
        this.renderUpgrades();
      });
    });
  }

  // ------------------------------------------------------------ mochila
  renderInventory() {
    const panel = $('inventory-panel');
    const game = this.game;
    if (!panel || !game) return;
    const items = game.inventory.list();
    const tricks = Object.entries(TRICK_DEFS).map(([id, def]) => `
      <div class="item">
        <div class="ico">${def.icon}</div>
        <div class="grow"><div class="t">${def.name}</div><div class="d">${def.desc}</div></div>
        <span class="pill ${game.lantern.unlockedTricks.has(id) ? '' : 'off'}">${game.lantern.unlockedTricks.has(id) ? 'Aprendida' : 'Bloqueada'}</span>
      </div>`).join('');

    panel.innerHTML = `
      <h2>🎒 Mochila</h2>
      <p>Itens coletados explorando o bosque.</p>
      <div class="list" style="margin-top:10px">
        ${items.length ? items.map((i) => `<div class="item"><div class="ico">${i.def?.icon || '•'}</div><div class="grow"><div class="t">${i.def?.name || i.id}</div><div class="d">${i.def?.desc || ''}</div></div><span class="pill">×${i.amount}</span></div>`).join('') : '<p>Sua mochila está vazia. Procure baús e criaturas!</p>'}
      </div>
      <h3>Manobras da lanterna (R)</h3>
      <div class="list">${tricks}</div>
      <div class="closebar"><button class="btn" data-close>Voltar</button></div>`;
  }

  // ------------------------------------------------------------ missões
  renderQuests() {
    const panel = $('quests-panel');
    const game = this.game;
    if (!panel || !game) return;
    const q = game.quests;
    const active = [...q.active.entries()].filter(([id]) => !q.completed.has(id));
    const done = [...q.completed];
    const renderSteps = (id) => {
      const def = q.defs[id];
      const state = q.active.get(id) || { step: 0, progress: 0 };
      return def.steps.map((s, i) => {
        const status = i < state.step ? '✔' : i === state.step ? '▶' : '•';
        const goal = s.goal && i === state.step ? ` (${Math.min(state.progress, s.goal)}/${s.goal})` : '';
        return `<div class="kv"><span>${status} ${s.text}${goal}</span></div>`;
      }).join('');
    };
    panel.innerHTML = `
      <h2>📜 Missões</h2>
      ${active.length ? active.map(([id]) => `<h3>${q.defs[id].title}</h3>${renderSteps(id)}`).join('') : '<p>Nenhuma missão ativa. Converse com Lumi no acampamento.</p>'}
      <h3>Concluídas</h3>
      ${done.length ? done.map((id) => `<div class="kv"><span>🏅 ${q.defs[id].title}</span></div>`).join('') : '<p>Ainda nenhuma.</p>'}
      <h3>Onde ir agora</h3>
      <p>Acampamento (🔥 fogueira) · Clareira das flores (🌸) · Ruínas da torre (🏛) · Altar da Clareira Antiga (💫) · Passagem adormecida (🌈) · Planalto com gancho luminoso (🧗)</p>
      <div class="closebar"><button class="btn" data-close>Voltar</button></div>`;
  }

  // ------------------------------------------------------------ mapa
  renderMap() {
    const panel = $('map-panel');
    const game = this.game;
    if (!panel || !game) return;
    const biomes = BIOME_LIST.map((b) => `
      <div class="item">
        <div class="ico">${b.icon}</div>
        <div class="grow"><div class="t" style="color:${b.color}">${b.name}</div><div class="d">${b.locked ? '🔒 Adormecido — acenda o altar e ajude o bosque.' : b.desc}</div></div>
        <span class="pill ${b.locked ? 'off' : ''}">${b.locked ? 'Em breve' : 'Explorando'}</span>
      </div>`).join('');
    panel.innerHTML = `
      <h2>🗺 Mapa do bosque</h2>
      <canvas id="map-canvas" width="640" height="640" style="width:100%;max-width:420px;display:block;margin:0 auto;border-radius:16px;background:rgba(6,10,20,.8);border:1px solid rgba(150,220,255,.3)"></canvas>
      <p style="text-align:center">Bússola: <b>N</b> aponta para o topo. Os ícones mostram baús, NPCs, flores e o altar.</p>
      <h3>Biomas do mundo</h3>
      <div class="list">${biomes}</div>
      <div class="closebar"><button class="btn" data-close>Voltar</button></div>`;
    this.drawFullMap(panel.querySelector('#map-canvas'));
  }

  drawFullMap(canvas) {
    const game = this.game;
    if (!canvas || !game) return;
    const g = canvas.getContext('2d');
    const size = canvas.width;
    const scale = size / 130;
    const toX = (x) => size / 2 + x * scale;
    const toY = (z) => size / 2 + z * scale;
    g.clearRect(0, 0, size, size);
    // terreno
    g.strokeStyle = 'rgba(140,200,255,.10)';
    for (let r = 10; r < 60; r += 12) {
      g.beginPath(); g.arc(size / 2, size / 2, r * scale, 0, Math.PI * 2); g.stroke();
    }
    // zona segura
    for (const z of game.world.safeZones || []) {
      g.beginPath(); g.arc(toX(z.x), toY(z.z), z.radius * scale, 0, Math.PI * 2);
      g.fillStyle = 'rgba(126,242,176,.16)'; g.fill();
      g.strokeStyle = 'rgba(126,242,176,.5)'; g.stroke();
    }
    // rio/lago
    g.beginPath(); g.arc(toX(-16), toY(9), 7 * scale, 0, Math.PI * 2);
    g.fillStyle = 'rgba(60,150,190,.35)'; g.fill();
    // torre
    g.beginPath(); g.arc(toX(-24), toY(-22), 7.4 * scale, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(200,200,255,.4)'; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
    // pontos
    g.font = '18px serif'; g.textAlign = 'center';
    for (const p of game.world.mapData()) {
      if (p.hidden) continue;
      g.fillText(p.icon, toX(p.x), toY(p.z) + 6);
    }
    // jogador
    g.save();
    g.translate(toX(game.player.position.x), toY(game.player.position.z));
    g.rotate(-game.player.facing + Math.PI);
    g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath();
    g.fillStyle = '#bff6ff'; g.fill();
    g.restore();
    // norte
    g.fillStyle = '#cfe8ff'; g.font = 'bold 16px sans-serif';
    g.fillText('N', size / 2, 20);
  }

  // ------------------------------------------------------------ diálogo
  showDialogue(data) {
    this.dialogueOpen = true;
    this.dialogueEl.classList.remove('hidden');
    $('dialogue-name').textContent = data.name || '—';
    $('dialogue-text').textContent = data.text || '';
    const choices = $('dialogue-choices');
    choices.innerHTML = '';
    (data.choices || []).forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = choice.label;
      btn.addEventListener('click', () => this.events.emit('dialogue:choice', { index: i }));
      choices.appendChild(btn);
    });
    $('btn-dialogue-close').classList.toggle('hidden', (data.choices || []).length > 0);
    this.events.emit('ui:dialogue', { open: true });
  }

  hideDialogue() {
    this.dialogueOpen = false;
    this.dialogueEl.classList.add('hidden');
    this.events.emit('ui:dialogue', { open: false });
  }

  updatePauseStats(game) {
    const el = $('pause-stats');
    if (!el || !game) return;
    el.innerHTML = `❤️ ${Math.ceil(game.player.health)}/${game.player.maxHealth} · ⚡ ${Math.ceil(game.player.energy)}/${game.player.maxEnergy}
      · 🪙 ${game.inventory.count('moeda')} · 🔷 ${game.inventory.count('cristal')} · ✨ ${game.inventory.count('fragmento')}`;
    $('btn-load')?.classList.toggle('hidden', !this.save.has());
  }
}
