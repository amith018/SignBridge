/* ===== SIGNBRIDGE - CONVERSATION HISTORY ===== */

export const History = {
  KEY: 'signbridge_history',

  _items: null,

  load() {
    try {
      const stored = localStorage.getItem(this.KEY);
      this._items = stored ? JSON.parse(stored) : [];
    } catch {
      this._items = [];
    }
    return this._items;
  },

  getAll() {
    if (!this._items) this.load();
    return [...this._items].reverse();
  },

  add(entry) {
    if (!this._items) this.load();
    const item = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      type: entry.type || 'sign', // 'sign' | 'speech' | 'dual'
      text: entry.text || '',
      signs: entry.signs || [],
      duration: entry.duration || 0,
      language: entry.language || 'en',
    };
    this._items.push(item);
    // Keep last 200 entries
    if (this._items.length > 200) {
      this._items = this._items.slice(-200);
    }
    this._save();
    return item;
  },

  delete(id) {
    if (!this._items) this.load();
    this._items = this._items.filter(i => i.id !== id);
    this._save();
  },

  clear() {
    this._items = [];
    this._save();
  },

  search(query) {
    if (!this._items) this.load();
    const q = query.toLowerCase();
    return this._items
      .filter(i => i.text.toLowerCase().includes(q) || i.signs.join(' ').toLowerCase().includes(q))
      .reverse();
  },

  _save() {
    localStorage.setItem(this.KEY, JSON.stringify(this._items));
  },

  formatTime(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  },
};
