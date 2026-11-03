// Estado do sistema de avatares: visual escolhido + itens desbloqueados.
// Persistido junto do save do jogo.

import { DEFAULT_AVATAR, ALL_ITEMS, itemCost } from './catalog.js';

const keyOf = (slot, id) => `${slot}:${id}`;

export class AvatarState {
  constructor() {
    this.config = { ...DEFAULT_AVATAR };
    this.unlocked = new Set();
    for (const item of ALL_ITEMS) {
      if (itemCost(item) === 0) this.unlocked.add(keyOf(item.slot, item.id));
    }
  }

  has(slot, id) { return this.unlocked.has(keyOf(slot, id)); }

  unlock(slot, id) { this.unlocked.add(keyOf(slot, id)); }

  /** Itens desbloqueados de um slot (para a coleção). */
  unlockedIn(slot) {
    return ALL_ITEMS.filter((i) => i.slot === slot && this.has(slot, i.id));
  }

  get count() { return this.unlocked.size; }

  apply(config) {
    this.config = { ...this.config, ...config };
    return { ...this.config };
  }

  reset() {
    this.config = { ...DEFAULT_AVATAR };
    return { ...this.config };
  }

  serialize() {
    return { config: { ...this.config }, unlocked: [...this.unlocked] };
  }

  load(data = {}) {
    if (data.unlocked?.length) for (const k of data.unlocked) this.unlocked.add(k);
    if (data.config) this.config = { ...DEFAULT_AVATAR, ...data.config };
    // garante que o visual salvo continua disponível
    for (const [slot, id] of Object.entries(this.config)) {
      if (typeof id === 'string' && id !== 'nenhum') this.unlocked.add(keyOf(slot, id));
    }
  }
}
