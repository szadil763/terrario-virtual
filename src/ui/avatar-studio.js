// Estúdio de avatares: tela de personalização com prévia 3D ao vivo,
// abas por categoria, raridades, desbloqueio com moedas e aplicar/resetar.
// O avatar em jogo só muda ao tocar em "Aplicar visual".

import * as THREE from 'three';
import {
  SPECIES, OUTFITS, HAIRS, HEADS, FACES, BACKS, AURAS, EXPRESSIONS,
  BODY_COLORS, OUTFIT_COLORS, HAIR_COLORS, ANIME_COLLECTIONS, RARITY, itemCost, itemById, listFor,
} from '../avatar/catalog.js';
import { buildAvatar, disposeAvatar } from '../avatar/builder.js';

const $ = (id) => document.getElementById(id);

const TABS = [
  { id: 'avatars', label: 'Avatares', icon: '🐧' },
  { id: 'outfits', label: 'Roupas', icon: '👕' },
  { id: 'hair', label: 'Cabelos', icon: '💇' },
  { id: 'accessories', label: 'Acessórios', icon: '🎩' },
  { id: 'anime', label: 'Anime Collection', icon: '✨' },
  { id: 'effects', label: 'Efeitos', icon: '🌟' },
  { id: 'collection', label: 'Minha coleção', icon: '📚' },
];

export class AvatarStudio {
  constructor({ events, settings, audio, game }) {
    this.events = events;
    this.settings = settings;
    this.audio = audio;
    this.game = game;
    this.el = {
      screen: $('avatar-studio'),
      canvas: $('studio-canvas'),
      tabs: $('studio-tabs'),
      grid: $('studio-grid'),
      title: $('studio-species-name'),
      coins: $('studio-coins'),
      sub: $('studio-sub'),
      reset: $('studio-reset'),
      apply: $('studio-apply'),
      close: $('studio-close'),
      stage: $('studio-stage'),
    };
    this.tab = 'avatars';
    this.open = false;
    this.rotateY = -0.5;
    this.autoRotate = true;
    this.cheerTimer = 0;
    this.blink = 0;
    this._raf = 0;
    this._last = 0;
    this._renderer = null;
    this._wire();
  }

  // ------------------------------------------------------------ abertura
  show() {
    if (this.open) return;
    this.config = { ...this.game.avatar.config };
    this.open = true;
    this.el.screen.classList.remove('hidden');
    this._setupScene();
    this.render();
    this._resize();
    this._last = performance.now();
    this._loop();
    this.audio?.sfx('ui');
  }

  hide() {
    this.open = false;
    this.el.screen.classList.add('hidden');
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    disposeAvatar(this._preview);
    this._preview = null;
    this.audio?.sfx('ui');
  }

  // ------------------------------------------------------------ cena 3D
  _setupScene() {
    if (this._renderer) return;
    const canvas = this.el.canvas;
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.15;

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    this._camera.position.set(0, 1.6, 4.9);
    this._camera.lookAt(0, 1.02, 0);

    const hemi = new THREE.HemisphereLight(new THREE.Color('#bcd4ff'), new THREE.Color('#2a2140'), 1.15);
    this._scene.add(hemi);
    const key = new THREE.DirectionalLight(new THREE.Color('#fff2d6'), 1.5);
    key.position.set(3, 6, 4);
    this._scene.add(key);
    const rim = new THREE.PointLight(new THREE.Color('#9be7ff'), 6, 14, 2);
    rim.position.set(-2.6, 2.4, -2.4);
    this._scene.add(rim);
    const warm = new THREE.PointLight(new THREE.Color('#ffb7e0'), 4, 12, 2);
    warm.position.set(2.4, 1.2, 2.2);
    this._scene.add(warm);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 40),
      new THREE.MeshBasicMaterial({ color: 0x2b2350, transparent: true, opacity: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this._scene.add(floor);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.9, 48),
      new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.005;
    this._scene.add(halo);
    this._floor = floor;
    this._halo = halo;

    this._wrap = new THREE.Group();
    this._scene.add(this._wrap);
  }

  _rebuildPreview() {
    disposeAvatar(this._preview);
    const rig = buildAvatar(this.config);
    rig.group.position.y = 0;
    this._preview = rig;
    this._wrap.add(rig.group);
    if (this.el.title) {
      const species = itemById('species', this.config.species);
      this.el.title.textContent = species.name;
    }
  }

  _resize() {
    const stage = this.el.stage;
    if (!stage || !this._renderer) return;
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.open) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const t = now / 1000;

    if (this.autoRotate && !this._dragging) this.rotateY += dt * 0.55;
    this._wrap.rotation.y = this.rotateY;

    const rig = this._preview;
    if (rig) {
      rig.update?.(dt, t);
      const bob = Math.sin(t * 2.2) * 0.035;
      rig.group.position.y = bob;
      // piscada simpática
      this.blink -= dt;
      if (this.blink < -2.6 && Math.random() < 0.02) this.blink = 0.13;
      if (rig.face) rig.face.scale.y = this.blink > 0 ? 0.08 : 1;
      if (rig.head) rig.head.rotation.z = Math.sin(t * 1.6) * 0.05;
      if (rig.armL && rig.armR) {
        rig.armL.rotation.z = 0.12 + Math.sin(t * 1.8) * 0.06;
        rig.armR.rotation.z = -0.12 - Math.sin(t * 1.8) * 0.06;
      }
      // comemoração
      if (this.cheerTimer > 0) {
        this.cheerTimer -= dt;
        rig.group.position.y = Math.abs(Math.sin(t * 9)) * 0.28;
        this._wrap.rotation.y += dt * 4;
        if (rig.face) rig.face.scale.y = 1;
      }
    }
    this._halo.material.opacity = 0.18 + Math.sin(t * 1.8) * 0.07;
    this._renderer.render(this._scene, this._camera);
  }

  // ------------------------------------------------------------ interface
  _wire() {
    this.el.tabs?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.tab = btn.dataset.tab;
      this.audio?.sfx('ui');
      this.render();
    });

    this.el.grid?.addEventListener('click', (e) => {
      const swatch = e.target.closest('[data-color]');
      if (swatch) {
        this.config[swatch.dataset.color] = swatch.dataset.hex;
        this.audio?.sfx('ui');
        this._rebuildPreview();
        this.render();
        return;
      }
      const expr = e.target.closest('[data-expr]');
      if (expr) {
        this.config.expression = expr.dataset.expr;
        this.audio?.sfx('ui');
        this._rebuildPreview();
        this.render();
        return;
      }
      const card = e.target.closest('[data-slot]');
      if (!card) return;
      this._choose(card.dataset.slot, card.dataset.id);
    });

    this.el.apply?.addEventListener('click', () => this._apply());
    this.el.reset?.addEventListener('click', () => this._reset());
    this.el.close?.addEventListener('click', () => this._close());

    this.el.screen?.addEventListener('click', (e) => {
      const action = e.target.closest('[data-studio]')?.dataset.studio;
      if (action === 'rotate') { this.autoRotate = !this.autoRotate; this.audio?.sfx('ui'); }
      if (action === 'cheer') { this.cheerTimer = 1.6; this.audio?.sfx('ui'); }
    });

    // arrastar para girar
    const canvas = this.el.canvas;
    if (canvas) {
      let dragId = null, lastX = 0;
      canvas.addEventListener('pointerdown', (e) => {
        if (dragId !== null) return;
        dragId = e.pointerId; lastX = e.clientX; this._dragging = true;
        try { canvas.setPointerCapture(e.pointerId); } catch { /* sintético */ }
      });
      canvas.addEventListener('pointermove', (e) => {
        if (dragId !== e.pointerId) return;
        this.rotateY += (e.clientX - lastX) * 0.012;
        lastX = e.clientX;
      });
      const end = (e) => { if (dragId === e.pointerId) { dragId = null; this._dragging = false; } };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
    }

    window.addEventListener('resize', () => { if (this.open) this._resize(); });
  }

  _locked(slot, id) { return !this.game.avatar.has(slot, id); }

  _choose(slot, id) {
    if (this._locked(slot, id)) {
      this._tryUnlock(slot, id);
      return;
    }
    this.config[slot] = id;
    if (slot === 'species') {
      // cada personagem tem sua paleta; mantém uma cor válida
      const species = itemById('species', id);
      if (species.colors && !species.colors.includes(this.config.bodyColor)) this.config.bodyColor = species.colors[0];
    }
    this.audio?.sfx('ui');
    this._rebuildPreview();
    this.render();
  }

  _tryUnlock(slot, id) {
    const item = itemById(slot, id);
    const cost = itemCost(item);
    const coins = this.game.inventory.count('moeda');
    if (coins < cost) {
      this.events.emit('ui:toast', { text: `Faltam ${cost - coins} moedas para desbloquear ${item.name}.`, icon: '🪙' });
      this.audio?.sfx('hurtSoft');
      return;
    }
    this.game.inventory.remove('moeda', cost);
    this.game.avatar.unlock(slot, id);
    this.config[slot] = id;
    this.audio?.sfx('save');
    this.events.emit('ui:toast', { text: `${item.name} desbloqueado!`, icon: '🎉' });
    this.events.emit('avatar:unlocked', { slot, id, cost });
    this.game.autosave(true);
    this._rebuildPreview();
    this.render();
  }

  _apply() {
    this.game.applyAvatar({ ...this.config });
    this.audio?.sfx('save');
    this.events.emit('ui:toast', { text: 'Visual aplicado!', icon: '✨' });
    this.cheerTimer = 1.4;
    this._close();
  }

  _reset() {
    this.config = { ...this.game.avatar.config };
    this.audio?.sfx('ui');
    this._rebuildPreview();
    this.render();
  }

  /** Fecha o estúdio (botão, Esc ou aplicar). */
  close() { this._close(); }

  _close() {
    this.hide();
    this.events.emit('avatar:closed', {});
  }

  // ------------------------------------------------------------ render
  render() {
    if (!this.el.tabs) return;
    this.el.tabs.innerHTML = TABS.map((t) => `
      <button class="studio-tab ${this.tab === t.id ? 'on' : ''}" data-tab="${t.id}">
        <span>${t.icon}</span>${t.label}
      </button>`).join('');

    const coins = this.game.inventory.count('moeda');
    if (this.el.coins) this.el.coins.textContent = String(coins);

    const parts = [];
    switch (this.tab) {
      case 'avatars':
        parts.push(this._sectionTitle('Personagens', 'Escolha quem vai carregar a lanterna.'));
        parts.push(this._grid(SPECIES, 'species'));
        parts.push(this._colors(BODY_COLORS, 'bodyColor', 'Cor do corpo'));
        parts.push(this._expressions());
        break;
      case 'outfits':
        parts.push(this._sectionTitle('Roupas', 'Combina com qualquer personagem.'));
        parts.push(this._grid(OUTFITS, 'outfit'));
        parts.push(this._colors(OUTFIT_COLORS, 'outfitColor', 'Cor da roupa'));
        break;
      case 'hair':
        parts.push(this._sectionTitle('Cabelos', 'Do topete atrevido ao espetado.'));
        parts.push(this._grid(HAIRS, 'hair'));
        parts.push(this._colors(HAIR_COLORS, 'hairColor', 'Cor do cabelo'));
        break;
      case 'accessories':
        parts.push(this._sectionTitle('Chapéus', ''));
        parts.push(this._grid(HEADS, 'head'));
        parts.push(this._sectionTitle('Rosto', ''));
        parts.push(this._grid(FACES, 'face'));
        parts.push(this._sectionTitle('Costas', ''));
        parts.push(this._grid(BACKS, 'back'));
        break;
      case 'anime':
        for (const col of ANIME_COLLECTIONS) {
          const items = this._animeItems(col.id);
          const owned = items.filter((i) => this.game.avatar.has(i.slot, i.id)).length;
          parts.push(`<div class="studio-col-head">
            <span class="dot" style="background:${col.color}"></span>
            <b>${col.icon} ${col.name}</b>
            <span class="hint">${owned}/${items.length}</span>
          </div>`);
          parts.push(this._cards(items));
        }
        break;
      case 'effects':
        parts.push(this._sectionTitle('Efeitos especiais', 'Auras e partículas ao redor do avatar.'));
        parts.push(this._grid(AURAS, 'aura'));
        break;
      case 'collection': {
        const owned = [...this.game.avatar.unlocked]
          .map((k) => { const [slot, id] = k.split(':'); return { slot, item: itemById(slot, id) }; })
          .filter((x) => x.item && x.item.id !== 'nenhum');
        parts.push(this._sectionTitle('Minha coleção', `${owned.length} itens desbloqueados.`));
        parts.push(owned.length
          ? `<div class="studio-cards">${owned.map(({ slot, item }) => this._card(item, slot)).join('')}</div>`
          : '<p class="hint">Ainda não há itens aqui: desbloqueie na loja de cada aba.</p>');
        break;
      }
      default: break;
    }
    this.el.grid.innerHTML = parts.join('');
    if (this.el.sub) {
      const species = itemById('species', this.config.species);
      this.el.sub.textContent = species.desc || '';
    }
  }

  _sectionTitle(title, sub) {
    return `<div class="studio-section"><b>${title}</b>${sub ? `<span class="hint">${sub}</span>` : ''}</div>`;
  }

  _grid(list, slot) {
    return `<div class="studio-cards">${list.map((item) => this._card(item, slot)).join('')}</div>`;
  }

  _cards(items) {
    return `<div class="studio-cards">${items.map((i) => this._card(i, i.slot)).join('')}</div>`;
  }

  _card(item, slot) {
    const selected = this.config[slot] === item.id;
    const locked = this._locked(slot, item.id);
    const cost = itemCost(item);
    const rarity = RARITY[item.rarity] || RARITY.comum;
    return `<button class="acard rar-${rarity.id} ${selected ? 'sel' : ''} ${locked ? 'locked' : ''}"
        data-slot="${slot}" data-id="${item.id}" title="${item.desc || item.name}">
      <span class="acard-ico">${item.icon || '·'}</span>
      <span class="acard-name">${item.name}</span>
      <span class="acard-rar">${rarity.label}</span>
      ${locked ? `<span class="acard-lock">🔒 ${cost > 0 ? `${cost} 🪙` : 'Bloqueado'}</span>` : (cost > 0 ? '<span class="acard-lock free">Desbloqueado</span>' : '<span class="acard-lock free">Grátis</span>')}
      ${selected ? '<span class="acard-sel">✓</span>' : ''}
    </button>`;
  }

  _colors(list, field, label) {
    return `<div class="studio-section"><b>${label}</b></div>
      <div class="studio-swatches">
        ${list.map((c) => `<button class="swatch ${this.config[field] === c.hex ? 'on' : ''}"
          data-color="${field}" data-hex="${c.hex}" style="--c:${c.hex}" title="${c.id}"></button>`).join('')}
      </div>`;
  }

  _expressions() {
    return `<div class="studio-section"><b>Expressão</b></div>
      <div class="studio-cards tight">
        ${EXPRESSIONS.map((e) => `<button class="acard expr ${this.config.expression === e.id ? 'sel' : ''}"
          data-expr="${e.id}"><span class="acard-ico">${e.icon}</span><span class="acard-name">${e.name}</span></button>`).join('')}
      </div>`;
  }

  _animeItems(collectionId) {
    const all = [...OUTFITS, ...HAIRS, ...HEADS, ...FACES, ...BACKS, ...AURAS].filter((i) => i.anime === collectionId);
    return all.map((i) => {
      const slot = listFor('outfit').includes(i) ? 'outfit'
        : listFor('hair').includes(i) ? 'hair'
          : listFor('head').includes(i) ? 'head'
            : listFor('face').includes(i) ? 'face'
              : listFor('back').includes(i) ? 'back' : 'aura';
      return { ...i, slot };
    });
  }
}
