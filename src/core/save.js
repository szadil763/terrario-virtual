// Salvamento e carregamento local (localStorage).

const KEY = 'luzdobosque.save.v1';

export class SaveManager {
  constructor(events) {
    this.events = events;
  }

  has() {
    try { return !!localStorage.getItem(KEY); } catch { return false; }
  }

  read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[save] arquivo inválido', err);
      return null;
    }
  }

  write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
      this.events?.emit('save:written', data);
      return true;
    } catch (err) {
      console.warn('[save] não foi possível salvar', err);
      return false;
    }
  }

  /** Salva com throttling, para não escrever a cada quadro. */
  writeThrottled(data, seconds = 20) {
    const now = Date.now();
    if (this.lastWrite && now - this.lastWrite < seconds * 1000) return false;
    this.lastWrite = now;
    return this.write(data);
  }

  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignorado */ }
  }
}
