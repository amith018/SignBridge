/* ===== SIGNBRIDGE - SETTINGS & THEME ===== */

export const Settings = {
  defaults: {
    theme: 'light',
    language: 'en',
    fontSize: 'md',
    highContrast: false,
    voiceEnabled: true,
    hapticEnabled: true,
    autoTranslate: true,
    saveHistory: true,
    onboardingDone: false,
    avatarStyle: 'vector',
  },

  _data: null,

  load() {
    try {
      const stored = localStorage.getItem('signbridge_settings');
      this._data = stored ? { ...this.defaults, ...JSON.parse(stored) } : { ...this.defaults };
    } catch {
      this._data = { ...this.defaults };
    }
    this.apply();
    return this._data;
  },

  get(key) {
    return this._data?.[key] ?? this.defaults[key];
  },

  set(key, value) {
    if (!this._data) this.load();
    this._data[key] = value;
    this.save();
    this.apply();
  },

  save() {
    localStorage.setItem('signbridge_settings', JSON.stringify(this._data));
  },

  apply() {
    const root = document.documentElement;
    const body = document.body;

    // Theme
    const theme = this.get('theme');
    document.documentElement.setAttribute('data-theme', theme);

    // Font size
    const fsMap = { sm: '14px', md: '16px', lg: '18px', xl: '20px' };
    root.style.fontSize = fsMap[this.get('fontSize')] || '16px';

    // High contrast
    if (this.get('highContrast')) {
      body.classList.add('high-contrast');
    } else {
      body.classList.remove('high-contrast');
    }
  },

  toggleTheme() {
    const next = this.get('theme') === 'light' ? 'dark' : 'light';
    this.set('theme', next);
    return next;
  },
};
