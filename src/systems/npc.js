// NPCs, diálogos com escolhas, missões principais/secundárias e reações
// divertidas às manobras da lanterna.

import * as THREE from 'three';
import { clamp, rand } from '../core/state.js';

export class QuestManager {
  constructor(events) {
    this.events = events;
    this.defs = {
      luz_do_bosque: {
        title: 'A origem da escuridão',
        steps: [
          { id: 'falar', text: 'Converse com Lumi, o vagalume-guia' },
          { id: 'fragmentos', text: 'Encontre 3 fragmentos mágicos', goal: 3 },
          { id: 'altar', text: 'Acenda o Altar da Clareira Antiga' },
        ],
      },
      teo_perdido: {
        title: 'O explorador perdido',
        steps: [
          { id: 'encontrar', text: 'Encontre Téo nas ruínas' },
          { id: 'levar', text: 'Leve Téo de volta ao acampamento' },
        ],
      },
      flores_da_clareira: {
        title: 'Flores da clareira',
        steps: [{ id: 'flores', text: 'Faça 5 flores luminosas desabrocharem', goal: 5 }],
      },
    };
    this.active = new Map(); // id -> {step, progress}
    this.completed = new Set();
  }

  isActive(id) { return this.active.has(id) && !this.completed.has(id); }

  has(id) { return this.active.has(id) || this.completed.has(id); }

  start(id) {
    if (this.active.has(id)) return false;
    this.active.set(id, { step: 0, progress: 0 });
    const def = this.defs[id];
    this.events?.emit('quest:started', { id, title: def?.title });
    this.events?.emit('ui:toast', { text: `Nova missão: ${def?.title}`, icon: '📜' });
    return true;
  }

  currentStep(id) {
    const state = this.active.get(id);
    const def = this.defs[id];
    if (!state || !def) return null;
    return def.steps[state.step] || null;
  }

  /** Avança para o próximo passo e devolve o texto atualizado. */
  advance(id) {
    const state = this.active.get(id);
    const def = this.defs[id];
    if (!state || !def) return null;
    state.step += 1;
    state.progress = 0;
    if (state.step >= def.steps.length) {
      this.completed.add(id);
      this.events?.emit('quest:completed', { id, title: def.title });
      this.events?.emit('ui:toast', { text: `Missão concluída: ${def.title}!`, icon: '🏅' });
      return null;
    }
    this.events?.emit('quest:advanced', { id, step: def.steps[state.step] });
    this.events?.emit('ui:toast', { text: def.steps[state.step].text, icon: '➡️' });
    return def.steps[state.step];
  }

  setProgress(id, value) {
    const state = this.active.get(id);
    const step = this.currentStep(id);
    if (!state || !step?.goal) return;
    state.progress = Math.max(state.progress, value);
  }

  /* Eventos do mundo alimentam as missões. */
  event(type, payload = {}) {
    switch (type) {
      case 'fragmento':
        if (this.isActive('luz_do_bosque') && this.currentStep('luz_do_bosque')?.id === 'fragmentos') {
          const state = this.active.get('luz_do_bosque');
          state.progress += payload.amount || 1;
          this.events?.emit('ui:toast', { text: `Fragmentos: ${Math.min(state.progress, 3)}/3`, icon: '✨' });
          if (state.progress >= 3) this.advance('luz_do_bosque');
        }
        break;
      case 'flower':
        if (this.isActive('flores_da_clareira') || this.has('flores_da_clareira')) {
          const state = this.active.get('flores_da_clareira');
          if (state) {
            state.progress += 1;
            this.events?.emit('ui:toast', { text: `Flores: ${Math.min(state.progress, 5)}/5`, icon: '🌸' });
            if (state.progress >= 5) this.advance('flores_da_clareira');
          }
        }
        break;
      case 'altar':
        if (this.isActive('luz_do_bosque') && this.currentStep('luz_do_bosque')?.id === 'altar') this.advance('luz_do_bosque');
        break;
      case 'npc':
        break;
      default:
        break;
    }
  }

  /** Texto mostrado no HUD. */
  trackerText() {
    for (const [id, state] of this.active) {
      if (this.completed.has(id)) continue;
      const step = this.defs[id]?.steps[state.step];
      if (!step) continue;
      const goal = step.goal ? ` (${Math.min(state.progress, step.goal)}/${step.goal})` : '';
      return { title: this.defs[id].title, text: step.text + goal };
    }
    return null;
  }

  serialize() {
    return { active: [...this.active.entries()], completed: [...this.completed] };
  }

  load(data = {}) {
    this.active = new Map(data.active || []);
    this.completed = new Set(data.completed || []);
  }
}

// ------------------------------------------------------------------ NPCs
export const NPC_DEFS = {
  lumi: {
    name: 'Lumi, o vagalume-guia', color: '#ffe98a', kind: 'firefly',
    quest: 'luz_do_bosque',
    lines: {
      intro: [
        'Oi! Eu sou Lumi. Eu ilumino o caminho, mas ultimamente ando sem pilha… quer dizer, sem magia!',
        'A escuridão que caiu no bosque não é má. Ela só guardou coisas antigas e criaturas que esqueceram como brincar.',
        'Sua lanterna consegue ver o que ela esconde. Se juntar 3 fragmentos mágicos, você acende o Altar da Clareira Antiga e abre a passagem para outros lugares.',
      ],
      repeat: [
        'Cada fragmento aparece quando você ajuda alguém ou abre um baú bem escondido. Nada de pressa, tá?',
        'Toque uma manobra com R de vez em quando — as criaturas adoram!',
      ],
      story: [
        'Antes o bosque tinha lampiões vivos em cada árvore. Um dia a escuridão chegou devagarinho e todos dormiram.',
        'Ela não é má: guarda lembranças. A sua lanterna é a única que consegue conversar com essas lembranças.',
      ],
      help: [
        'M1 atira luz, segure M1 para um disparo carregado, M3 solta o pulso luminoso e segure M2 para o escudo.',
        'Aperte M4 para trocar de poder e R para fazer manobras divertidas. Ah, e Q é o dash: serve para desviar e atravessar vãos!',
      ],
      fragments: ['Você sente quando o fragmento está perto: ele faísca em volta da lanterna. Continue!'],
      altar: ['Agora é só acender o altar na clareira antiga, no meio das ruínas. A luz verde faz o resto.'],
      done: ['A passagem despertou! Outros biomas esperam por você — mas primeiro, aproveite o bosque.'],
    },
    choices: [
      { label: 'O que aconteceu com o bosque?', next: 'story' },
      { label: 'Como uso a lanterna?', next: 'help' },
      { label: 'Vou explorar!', next: null },
    ],
  },
  teo: {
    name: 'Téo, o explorador', color: '#ffb27a', kind: 'kid', quest: 'teo_perdido',
    lines: {
      intro: [
        'Ah! Uma luz! Eu vim explorar a torre e… bem, a escada quebrou e meu mapa virou morcego.',
        'Você me leva até o acampamento? Lá tem fogueira e a Mila faz um chá de folha brilhante.',
      ],
      following: ['Só um pouquinho mais devagar, tá?', 'Essas ruínas guardam um cristal que reflete luz. Sério!'],
      story: [
        'Eu vim atrás do mapa do meu avô. Ele dizia que a torre guarda um Guardião que só quer voltar a dormir em paz.',
        'O cristal do peito dele brilha quando ele baixa os braços. Foi o que meu avô escreveu, pelo menos!',
      ],
      safe: ['Chegamos! Muito obrigado! Toma, achei isso na torre.', 'Se um dia encontrar a Mila por aí, diga que estou bem.'],
    },
    choices: [
      { label: 'Vem comigo!', action: 'follow', next: null },
      { label: 'Como você chegou aqui?', next: 'story' },
      { label: 'Depois eu volto.', next: null },
    ],
  },
  mila: {
    name: 'Mila, guardiã do acampamento', color: '#9ee7ff', kind: 'keeper',
    lines: {
      intro: [
        'Bem-vindo ao acampamento. Aqui a escuridão é só um cobertor grande.',
        'Moedas compram enfeites; cristais melhoram a lanterna. E se quiser, eu guardo seu progresso.',
      ],
      shop: ['Olhe as melhorias no menu: a lanterna fica cada vez mais brilhante!'],
      repeat: ['Descanse na fogueira sempre que precisar. Coragem também pede pausa.'],
    },
    choices: [
      { label: 'Ver melhorias da lanterna', action: 'upgrades' },
      { label: 'Salvar meu progresso', action: 'save' },
      { label: 'Obrigado!', next: null },
    ],
  },
};

export class NPC {
  constructor(id, def, position, { effects }) {
    this.id = id;
    this.def = def;
    this.position = position.clone();
    this.effects = effects;
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.radius = 3;
    this.talked = false;
    this.reactionCooldown = 0;
    this.state = 'idle';
    this._build();
  }

  _build() {
    const mat = (c) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), flatShading: true });
    const color = this.def.color;
    if (this.def.kind === 'firefly') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mat('#3d3355'));
      body.position.y = 1.1;
      this.group.add(body);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
      bulb.position.y = 0.82;
      this.group.add(bulb);
      for (const sx of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8), new THREE.MeshBasicMaterial({ color: 0xd9f6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        wing.position.set(sx * 0.22, 1.2, 0.05);
        wing.rotation.y = sx * 0.6;
        this.group.add(wing);
        if (!this.wings) this.wings = [];
        this.wings.push(wing);
      }
      this.group.position.y = 0.8 + Math.sin(rand(0, 6)) * 0.1;
      this.effects?.attachGlow(bulb, color, 1.6);
      this.floatBase = this.group.position.y;
    } else if (this.def.kind === 'kid') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), mat('#6fb7e8'));
      body.position.y = 0.95;
      this.group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), mat('#ffd39b'));
      head.position.y = 1.5;
      this.group.add(head);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 12), mat('#e8b45c'));
      hat.position.y = 1.74;
      this.group.add(hat);
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#20263a'));
        eye.position.set(sx * 0.11, 1.53, -0.26);
        this.group.add(eye);
      }
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.2), mat('#d97a4a'));
      backpack.position.set(0, 1.0, 0.32);
      this.group.add(backpack);
    } else {
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 12), mat('#4a6fa8'));
      robe.position.y = 0.75;
      this.group.add(robe);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), mat('#ffd39b'));
      head.position.y = 1.6;
      this.group.add(head);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), mat('#3a5a90'));
      hood.position.y = 1.63;
      this.group.add(hood);
      const lantern = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
      lantern.position.set(0.55, 1.0, 0);
      this.group.add(lantern);
      this.effects?.attachGlow(lantern, color, 1.1);
    }
  }

  /** Reação divertida quando o jogador faz manobras por perto. */
  reactToTrick(name, ctx) {
    if (this.reactionCooldown > 0) return;
    this.reactionCooldown = 3.5;
    const reactions = {
      lumi: ['Uau! Faz de novo!', 'Ai, que brilho bonito!', 'Eu tentava isso e caía no chão.'],
      teo: ['Como você fez isso?!', 'Isso foi incrível!', 'Depois me ensina!'],
      mila: ['Hahaha, a lanterna está feliz hoje!', 'Cuidado para não queimar o cachecol!'],
    };
    const text = reactions[this.id]?.[Math.floor(Math.random() * 3)] || 'Que legal!';
    this.effects?.burst(this.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), { color: this.def.color, count: 18, speed: 3.4, size: 0.3, life: 0.9, gravity: 1 });
    ctx?.events?.emit('ui:toast', { text: `${this.def.name.split(',')[0]}: “${text}”`, icon: '💬' });
    this.talked = true;
  }

  update(dt, ctx) {
    this.reactionCooldown = Math.max(0, this.reactionCooldown - dt);
    const t = performance.now() / 1000;
    if (this.wings) {
      this.wings.forEach((w, i) => { w.rotation.z = Math.sin(t * 18 + i) * 0.5; });
    }
    if (this.floatBase !== undefined) {
      this.group.position.y = this.floatBase + Math.sin(t * 1.6) * 0.16;
      this.group.rotation.y = Math.sin(t * 0.5) * 0.5;
    } else {
      this.group.rotation.y += dt * 0.2 * Math.sin(t * 0.7);
    }
    // NPC segue o jogador quando a missão pede
    if (this.state === 'following' && ctx.player) {
      const dir = new THREE.Vector3().subVectors(ctx.player.position, this.position);
      dir.y = 0;
      const d = dir.length();
      if (d > 3.2) {
        dir.normalize();
        const speed = d > 8 ? 6.4 : 3.6;
        this.position.addScaledVector(dir, speed * dt);
        this.group.position.x = this.position.x;
        this.group.position.z = this.position.z;
      }
    }
  }

  follow() { this.state = 'following'; }

  stopFollowing() {
    this.state = 'idle';
    this.group.position.x = this.position.x;
    this.group.position.z = this.position.z;
  }
}

/** Árvore de diálogos simples, com ações e escolhas. */
export class DialogueSystem {
  constructor(events, audio) {
    this.events = events;
    this.audio = audio;
    this.openData = null;
    this.npc = null;
  }

  open(data) {
    this.openData = data;
    this.events?.emit('dialogue:open', data);
    this.audio?.sfx('ui');
  }

  choose(index, ctx) {
    const choice = this.openData?.choices?.[index];
    if (!choice) return;
    if (choice.action) ctx?.actions?.[choice.action]?.();
    const next = choice.next;
    if (!next) { this.close(); return; }
    const node = this.npc?.def?.lines?.[next];
    const text = Array.isArray(node) ? node[Math.floor(Math.random() * node.length)] : node;
    const choices = this.npc?.def?.choices || [{ label: 'Ok', next: null }];
    this.open({ name: this.npc.def.name, text, choices });
  }

  close() {
    this.openData = null;
    this.npc = null;
    this.events?.emit('dialogue:close', {});
  }

  startFor(npc, ctx) {
    this.npc = npc;
    const def = npc.def;
    const lines = def.lines;
    let key = 'intro';
    let text;
    if (def.quest && ctx.quests?.isActive(def.quest)) {
      const step = ctx.quests.currentStep(def.quest)?.id;
      key = step || 'repeat';
    } else if (def.quest && ctx.quests?.has(def.quest)) {
      key = 'done';
    } else if (npc.talked) {
      key = 'repeat';
    }
    const node = lines[key] || lines.intro;
    text = Array.isArray(node) ? node[0] : node;
    npc.talked = true;
    this.open({ name: def.name, text, choices: def.choices });
    if (def.quest && !ctx.quests?.has(def.quest)) ctx.quests?.start(def.quest);
    ctx.quests?.event('npc', { id: npc.id });
    return key;
  }
}
