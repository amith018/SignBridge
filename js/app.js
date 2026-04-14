/* ===== SIGNBRIDGE - APP ROUTER & CONTROLLER ===== */

import { Settings }   from './settings.js';
import { History }    from './history.js';
import { Speech }     from './speech.js';
import { Camera }     from './camera.js';
import { Gesture }    from './gesture.js';
import { Avatar }     from './avatar.js';
import { Assistant }  from './assistant.js';
import { Emergency }  from './emergency.js';

/* ── Utility helpers ── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const toast = (() => {
  const container = document.getElementById('toast-container');
  return (msg, icon = 'ℹ️', duration = 3000) => {
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 350);
    }, duration);
  };
})();

/* ── Time display ── */
function updateTime() {
  $$('.status-time').forEach(el => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
}
setInterval(updateTime, 10000);
updateTime();

/* ───────────────────────────────────────────
   ROUTER
─────────────────────────────────────────── */
const Router = {
  _current: null,
  _history: [],

  navigate(screenId, addHistory = true) {
    const prev = this._current;
    const next = document.getElementById(`screen-${screenId}`);
    if (!next) return;

    // Clean up previous screen
    if (prev) {
      prev.classList.add('slide-out');
      prev.classList.remove('active');
      setTimeout(() => prev.classList.remove('slide-out'), 400);
      App.onLeave(prev.id.replace('screen-', ''));
    }

    // Activate new screen
    next.classList.add('active');
    this._current = next;

    if (addHistory && prev) {
      this._history.push(prev.id.replace('screen-', ''));
    }

    App.onEnter(screenId);
    this._updateNav(screenId);
    window.scrollTo(0, 0);
  },

  back() {
    const prev = this._history.pop();
    if (prev) this.navigate(prev, false);
    else this.navigate('home', false);
  },

  _updateNav(screenId) {
    const navMap = {
      home: 'nav-home',
      camera: 'nav-camera',
      dual: 'nav-dual',
      history: 'nav-history',
      settings: 'nav-settings',
    };
    $$('.nav-item').forEach(el => el.classList.remove('active'));
    const active = document.getElementById(navMap[screenId]);
    if (active) active.classList.add('active');

    // Hide/show FAB
    const fab = document.getElementById('fab-assistant');
    if (fab) {
      fab.style.display = ['emergency', 'onboarding'].includes(screenId) ? 'none' : 'flex';
    }

    // Hide/show bottom nav
    const nav = document.getElementById('bottom-nav');
    if (nav) {
      nav.style.display = ['emergency', 'onboarding'].includes(screenId) ? 'none' : 'flex';
    }
  },
};

/* ───────────────────────────────────────────
   SCREEN CONTROLLERS
─────────────────────────────────────────── */
const App = {
  _cameraObserver: null,
  _sessionStart: null,
  _detectedSigns: [],
  _speechText: '',

  init() {
    // Register Service Worker for PWA Offline Mode
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
          .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch(err => console.error('[PWA] Service Worker registration failed:', err));
      });
    }

    // Initialize modules
    Settings.load();
    History.load();
    Speech.init(Settings.get('language'));
    Assistant.init(document.getElementById('assistant-overlay'));

    this._bindNav();
    this._bindAssistant();
    this._bindOnboarding();
    this._bindHome();
    this._bindCamera();
    this._bindSpeech();
    this._bindDual();
    this._bindHistory();
    this._bindEmergency();
    this._bindSettings();

    // Start on onboarding or home
    const done = Settings.get('onboardingDone');
    Router.navigate(done ? 'home' : 'onboarding', false);
  },

  onEnter(screenId) {
    switch (screenId) {
      case 'camera':   this._startCamera();   break;
      case 'speech':   this._initSpeech();    break;
      case 'dual':     this._startDual();     break;
      case 'history':  this._renderHistory(); break;
      case 'settings': this._renderSettings();break;
      case 'emergency':this._enterEmergency();break;
    }
  },

  onLeave(screenId) {
    switch (screenId) {
      case 'camera':
        Camera.stop();
        Gesture.stop();
        this._saveCameraSession();
        if (this._cameraObserver) { this._cameraObserver.disconnect(); this._cameraObserver = null; }
        break;
      case 'speech':
        Speech.stop();
        Speech.cancel();
        this._saveSpeechSession();
        break;
      case 'dual':
        Camera.stop();
        Gesture.stop();
        Speech.stop();
        break;
    }
  },

  /* ── NAV ── */
  _bindNav() {
    const navItems = {
      'nav-home':     'home',
      'nav-camera':   'camera',
      'nav-dual':     'dual',
      'nav-history':  'history',
      'nav-settings': 'settings',
    };
    Object.entries(navItems).forEach(([id, screen]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => Router.navigate(screen));
    });

    // Back buttons
    $$('[data-back]').forEach(el => {
      el.addEventListener('click', () => Router.back());
    });

    // data-goto buttons
    $$('[data-goto]').forEach(el => {
      el.addEventListener('click', () => Router.navigate(el.dataset.goto));
    });
  },

  /* ── ASSISTANT ── */
  _bindAssistant() {
    const fab = document.getElementById('fab-assistant');
    fab?.addEventListener('click', () => Assistant.toggle());

    const closeBtn = $('#assistant-close');
    closeBtn?.addEventListener('click', () => Assistant.close());

    Assistant.onCommand = (action) => {
      if (action.startsWith('goto:')) {
        Router.navigate(action.replace('goto:', ''));
      } else if (action === 'toggle:theme') {
        const t = Settings.toggleTheme();
        toast(`Switched to ${t} mode`, '🌙');
        this._syncThemeToggle();
      }
    };
  },

  /* ── ONBOARDING ── */
  _bindOnboarding() {
    let page = 0;
    const pages = $$('.onboarding-page');
    const dots = $$('.onboarding-dot');
    const nextBtn = document.getElementById('ob-next');
    const skipBtn = document.getElementById('ob-skip');

    const setPage = (n) => {
      pages.forEach((p, i) => {
        p.style.display = i === n ? 'flex' : 'none';
        p.classList.toggle('anim-fade-up', i === n);
      });
      dots.forEach((d, i) => d.classList.toggle('active', i === n));
      nextBtn.textContent = n === pages.length - 1 ? 'Get Started 🚀' : 'Next →';
      page = n;
    };

    setPage(0);

    nextBtn?.addEventListener('click', () => {
      if (page < pages.length - 1) {
        setPage(page + 1);
      } else {
        this._finishOnboarding();
      }
    });

    skipBtn?.addEventListener('click', () => this._finishOnboarding());

    dots.forEach((d, i) => d.addEventListener('click', () => setPage(i)));
  },

  _finishOnboarding() {
    Settings.set('onboardingDone', true);
    Router.navigate('home');
  },

  /* ── HOME ── */
  _bindHome() {
    // Mode cards
    $$('[data-goto]').forEach(el => {
      el.addEventListener('click', () => Router.navigate(el.dataset.goto));
    });

    // Home avatar -> settings
    $('#home-avatar')?.addEventListener('click', () => Router.navigate('settings'));
  },

  /* ── CAMERA / SIGN DETECTION ── */
  _startCamera() {
    this._sessionStart = Date.now();
    this._detectedSigns = [];

    const video = document.getElementById('cam-video');
    const canvas = document.getElementById('cam-canvas');
    const statusEl = document.getElementById('cam-status-text');
    const recognizedEl = document.getElementById('recognized-text');
    const confidenceEl = document.getElementById('confidence-fill');
    const signLogEl = document.getElementById('sign-log');

    if (!video || !canvas) return;

    const setStatus = (txt, color = 'rgba(0,0,0,0.5)') => {
      if (statusEl) statusEl.textContent = txt;
    };

    const tryStart = async () => {
      setStatus('📷 Starting camera...');
      const ok = await Camera.start(video);
      if (ok) {
        setStatus('🟢 Detecting...');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        this._cameraObserver = Camera.syncCanvas(canvas);

        await Gesture.init(video, canvas);
        Gesture.onSign = (sign, conf) => {
          this._detectedSigns.push(sign);

          // Update recognized text
          const word = document.createElement('span');
          word.className = 'recognized-word';
          word.textContent = sign;
          recognizedEl?.appendChild(word);

          // Auto-scroll
          recognizedEl?.scrollTo({ left: 99999, behavior: 'smooth' });

          // Confidence bar
          if (confidenceEl) {
            confidenceEl.style.width = `${Math.round(conf * 100)}%`;
          }

          // Log entry
          const info = Gesture.getSignInfo(sign) || { emoji: '✋' };
          const item = document.createElement('div');
          item.className = 'sign-log-item';
          item.innerHTML = `
            <div class="sign-log-icon">${info.emoji || '✋'}</div>
            <div class="sign-log-text">${sign}</div>
            <div class="sign-log-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          `;
          signLogEl?.prepend(item);
          if (signLogEl?.children.length > 10) {
            signLogEl.lastChild?.remove();
          }

          setStatus(`🟢 Detected: ${sign}`);
          toast(`Detected: ${sign}`, info.emoji || '✋', 1800);
        };
        Gesture.start(false);
      } else {
        // Simulation mode (no camera or permission)
        setStatus('🔴 Simulation mode');
        toast('Camera unavailable — using simulation mode', '⚠️', 4000);
        Gesture.onSign = (sign, conf) => {
          this._detectedSigns.push(sign);
          const word = document.createElement('span');
          word.className = 'recognized-word';
          word.textContent = sign;
          recognizedEl?.appendChild(word);
          if (confidenceEl) confidenceEl.style.width = `${Math.round(conf * 100)}%`;
          const info = Gesture.getSignInfo(sign) || {};
          const item = document.createElement('div');
          item.className = 'sign-log-item';
          item.innerHTML = `
            <div class="sign-log-icon">${info.emoji || '✋'}</div>
            <div class="sign-log-text">${sign}</div>
            <div class="sign-log-time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
          `;
          signLogEl?.prepend(item);
        };
        Gesture.start(true);
      }
    };

    tryStart();
  },

  _bindCamera() {
    // TTS icon
    document.getElementById('cam-speak-btn')?.addEventListener('click', () => {
      const textEl = document.getElementById('recognized-text');
      const text = [...(textEl?.querySelectorAll('.recognized-word') || [])]
        .map(w => w.textContent).join(' ');
      if (text) {
        Speech.speak(text);
        toast('Speaking detected text 🔊', '🔊', 2000);
      } else {
        toast('No text detected yet', '📝', 2000);
      }
    });

    // Clear button
    document.getElementById('cam-clear-btn')?.addEventListener('click', () => {
      const textEl = document.getElementById('recognized-text');
      if (textEl) textEl.innerHTML = '';
      const logEl = document.getElementById('sign-log');
      if (logEl) logEl.innerHTML = '';
      this._detectedSigns = [];
    });

    // Flip camera
    document.getElementById('cam-flip-btn')?.addEventListener('click', async () => {
      await Camera.flip();
      toast('Camera flipped', '🔄', 1500);
    });

    // Start/stop toggle
    document.getElementById('cam-toggle-btn')?.addEventListener('click', () => {
      if (Gesture.isRunning) {
        Gesture.stop();
        Camera.stop();
        document.getElementById('cam-toggle-btn').textContent = '▶️';
        document.getElementById('cam-status-text').textContent = '⏸ Paused';
      } else {
        this._startCamera();
        document.getElementById('cam-toggle-btn').textContent = '⏸';
      }
    });

    // Back
    document.getElementById('cam-back')?.addEventListener('click', () => Router.back());
  },

  _saveCameraSession() {
    if (this._detectedSigns.length === 0) return;
    const dur = Math.round((Date.now() - this._sessionStart) / 1000);
    History.add({
      type: 'sign',
      text: this._detectedSigns.join(' '),
      signs: this._detectedSigns,
      duration: dur,
      language: Settings.get('language'),
    });
    this._detectedSigns = [];
  },

  /* ── SPEECH-TO-SIGN ── */
  _initSpeech() {
    this._speechText = '';
    const avatarSvg = document.getElementById('speech-avatar-svg');
    const signNameEl = document.getElementById('speech-sign-name');
    Avatar.init(avatarSvg, signNameEl);

    // Word-by-word avatar display
    Speech.onResult = (text) => {
      this._speechText += ' ' + text;
      const transcriptEl = document.getElementById('speech-transcript-text');
      if (transcriptEl) {
        transcriptEl.innerHTML = `<span class="speech-text">${this._speechText.trim()}</span>`;
      }
      document.getElementById('speech-interim').textContent = '';

      // Find best matching sign for last word
      const words = text.trim().split(/\s+/);
      const lastWord = words[words.length - 1];
      const match = Gesture.SIGN_VOCAB.find(v =>
        v.name.toLowerCase().includes(lastWord.toLowerCase()) ||
        lastWord.toLowerCase().includes(v.name.toLowerCase().split(' ')[0])
      );
      if (match) Avatar.showSign(match.name);
    };

    Speech.onInterim = (text) => {
      const el = document.getElementById('speech-interim');
      if (el) el.textContent = text;
    };

    Speech.onEnd = () => {
      this._updateMicUI(false);
    };

    Speech.onError = (msg) => {
      toast(msg, '⚠️');
      this._updateMicUI(false);
    };
  },

  _bindSpeech() {
    const micBtn = document.getElementById('speech-mic-btn');

    micBtn?.addEventListener('click', () => {
      if (Speech.isListening) {
        Speech.stop();
        this._updateMicUI(false);
      } else {
        Speech.start();
        this._updateMicUI(true);
        toast('Listening... speak now', '🎤', 2000);
      }
    });

    document.getElementById('speech-clear-btn')?.addEventListener('click', () => {
      this._speechText = '';
      const el = document.getElementById('speech-transcript-text');
      if (el) el.innerHTML = '<span class="speech-placeholder">Your speech will appear here...</span>';
      document.getElementById('speech-interim').textContent = '';
      Avatar.clearSign();
    });

    document.getElementById('speech-tts-btn')?.addEventListener('click', () => {
      if (this._speechText.trim()) {
        Speech.speak(this._speechText.trim());
        toast('Reading aloud 🔊', '🔊', 2000);
      }
    });

    document.getElementById('speech-back')?.addEventListener('click', () => Router.back());
  },

  _updateMicUI(listening) {
    const btn = document.getElementById('speech-mic-btn');
    const hint = document.getElementById('mic-hint');
    const waveform = document.getElementById('speech-waveform');
    const transcript = document.getElementById('speech-transcript-box');

    if (btn) btn.classList.toggle('recording', listening);
    if (hint) hint.textContent = listening ? 'Listening... tap to stop' : 'Tap to speak';
    if (waveform) waveform.classList.toggle('paused', !listening);
    if (transcript) transcript.classList.toggle('listening', listening);
  },

  _saveSpeechSession() {
    if (!this._speechText.trim()) return;
    History.add({
      type: 'speech',
      text: this._speechText.trim(),
      language: Settings.get('language'),
    });
    this._speechText = '';
  },

  /* ── DUAL MODE ── */
  _startDual() {
    const video = document.getElementById('dual-video');
    const signTextEl = document.getElementById('dual-sign-text');
    const transcriptEl = document.getElementById('dual-transcript');
    const avatarSvg = document.getElementById('dual-avatar-svg');
    const signNameEl = document.getElementById('dual-sign-name');

    if (avatarSvg) Avatar.init(avatarSvg, signNameEl);

    // Camera
    Camera.start(video).then(ok => {
      if (!ok) toast('Using simulation for camera', '⚠️');
    });

    // Gesture
    Gesture.onSign = (sign) => {
      if (signTextEl) signTextEl.textContent = sign;
    };
    Gesture.start(true); // simulation for dual

    // Speech
    Speech.init(Settings.get('language'));
    Speech.onResult = (text) => {
      if (transcriptEl) transcriptEl.textContent = text;
      const words = text.split(/\s+/);
      const lastWord = words[words.length - 1];
      const match = Gesture.SIGN_VOCAB.find(v =>
        v.name.toLowerCase().includes(lastWord.toLowerCase())
      );
      if (match) Avatar.showSign(match.name);
    };
    Speech.onInterim = (text) => {
      if (transcriptEl) transcriptEl.textContent = text + '...';
    };

    // Toggle buttons
    document.getElementById('dual-toggle-cam')?.addEventListener('click', () => {
      Camera.flip();
    });
  },

  _bindDual() {
    document.getElementById('dual-mic-btn')?.addEventListener('click', () => {
      Speech.toggle();
      const btn = document.getElementById('dual-mic-btn');
      btn?.classList.toggle('recording', Speech.isListening);
      toast(Speech.isListening ? 'Listening...' : 'Mic off', Speech.isListening ? '🎤' : '🔇', 1500);
    });

    document.getElementById('dual-back')?.addEventListener('click', () => Router.back());
  },

  /* ── HISTORY ── */
  _renderHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    const items = History.getAll();

    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:48px 24px;color:var(--text-muted);">
          <div style="font-size:48px;margin-bottom:16px;">💬</div>
          <div style="font-size:15px;font-weight:600;">No conversations yet</div>
          <div style="font-size:13px;margin-top:6px;">Start detecting signs or translating speech</div>
        </div>`;
      return;
    }

    const typeIcon = { sign: '✋', speech: '🎤', dual: '🔀' };
    const typeColor = { sign: '#6C63FF', speech: '#00D4AA', dual: '#FF6B6B' };
    const typeLabel = { sign: 'Sign', speech: 'Speech', dual: 'Dual' };

    listEl.innerHTML = items.map(item => `
      <div class="history-card" data-id="${item.id}">
        <div class="history-card-icon"
          style="background:${typeColor[item.type] || '#6C63FF'}22;color:${typeColor[item.type] || '#6C63FF'};">
          ${typeIcon[item.type] || '💬'}
        </div>
        <div class="history-card-body">
          <div class="history-card-title">${item.text.slice(0, 60)}${item.text.length > 60 ? '…' : ''}</div>
          <div class="history-card-preview">
            <span class="badge badge-primary" style="font-size:10px;">${typeLabel[item.type] || 'Chat'}</span>
            ${item.language ? `<span class="badge" style="background:${typeColor[item.type]}22;color:${typeColor[item.type]};font-size:10px;">${item.language.toUpperCase()}</span>` : ''}
          </div>
          <div class="history-card-meta">
            <span style="color:var(--text-muted);font-size:11px;">⏱ ${item.duration || 0}s</span>
            <span style="color:var(--text-muted);font-size:11px;">· ${History.formatTime(item.timestamp)}</span>
          </div>
        </div>
        <div style="color:var(--text-muted);font-size:20px;align-self:center;">›</div>
      </div>
    `).join('');

    // Click to speak
    listEl.querySelectorAll('.history-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.id);
        const item = History.getAll().find(i => i.id === id);
        if (item) {
          Speech.speak(item.text);
          toast('Reading aloud...', '🔊', 2000);
        }
      });
    });
  },

  _bindHistory() {
    document.getElementById('history-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      const listEl = document.getElementById('history-list');
      if (!listEl) return;
      if (!q) {
        this._renderHistory();
        return;
      }
      const results = History.search(q);
      if (results.length === 0) {
        listEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);">No results for "${q}"</div>`;
      } else {
        this._renderHistoryItems(results, listEl);
      }
    });

    document.getElementById('history-clear-btn')?.addEventListener('click', () => {
      if (confirm('Clear all conversation history?')) {
        History.clear();
        this._renderHistory();
        toast('History cleared', '🗑️', 2000);
      }
    });

    document.getElementById('history-back')?.addEventListener('click', () => Router.back());
  },

  _renderHistoryItems(items, listEl) {
    // reuse logic (simplified)
    this._renderHistory(); // re-render with current data
  },

  /* ── EMERGENCY ── */
  _enterEmergency() {
    const gridEl = document.getElementById('emergency-grid');
    if (!gridEl) return;

    gridEl.innerHTML = Emergency.PHRASES.map(p => `
      <button class="emergency-btn ${['help','call911','silent','deaf'].includes(p.id) ? 'emergency-pulse' : ''}"
        data-phrase="${p.id}"
        style="--emr-color:${p.color}">
        <div class="emergency-btn-icon">${p.icon}</div>
        <div class="emergency-btn-text">${p.text}</div>
      </button>
    `).join('');

    gridEl.querySelectorAll('.emergency-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const phrase = Emergency.speakPhrase(btn.dataset.phrase);
        if (phrase) {
          btn.style.background = 'rgba(255,255,255,0.35)';
          setTimeout(() => btn.style.background = '', 500);
          toast(`🔊 Speaking: "${phrase.text}"`, '📢', 2500);
        }
      });
    });

    document.getElementById('emergency-exit')?.addEventListener('click', () => {
      Router.navigate('home');
    });
  },

  _bindEmergency() {
    // already handled in _enterEmergency
  },

  /* ── SETTINGS ── */
  _renderSettings() {
    this._syncThemeToggle();
    this._syncLangPicker();
    this._syncAvatarStyle();
    this._syncFontSize();
    this._syncToggles();
  },

  _bindSettings() {
    // Theme toggle
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      Settings.toggleTheme();
      this._syncThemeToggle();
    });

    // High contrast
    document.getElementById('contrast-toggle')?.addEventListener('click', () => {
      Settings.set('highContrast', !Settings.get('highContrast'));
      this._syncToggles();
    });

    // Voice toggle
    document.getElementById('voice-toggle')?.addEventListener('click', () => {
      Settings.set('voiceEnabled', !Settings.get('voiceEnabled'));
      this._syncToggles();
    });

    // Save history toggle
    document.getElementById('history-toggle')?.addEventListener('click', () => {
      Settings.set('saveHistory', !Settings.get('saveHistory'));
      this._syncToggles();
    });

    // Language chips
    document.getElementById('lang-picker')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.lang-chip');
      if (!chip) return;
      const lang = chip.dataset.lang;
      Settings.set('language', lang);
      Speech.setLanguage(lang);
      this._syncLangPicker();
      toast(`Language set to ${chip.textContent.trim()}`, '🌐', 2000);
    });

    // Avatar Style chips
    document.getElementById('avatar-style-picker')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.lang-chip');
      if (!chip) return;
      const style = chip.dataset.style;
      Settings.set('avatarStyle', style);
      this._syncAvatarStyle();
      toast(`Avatar Style: ${chip.textContent.trim()}`, '🎨', 2000);
    });

    // Font size options
    document.getElementById('font-size-options')?.addEventListener('click', (e) => {
      const opt = e.target.closest('.font-size-opt');
      if (!opt) return;
      Settings.set('fontSize', opt.dataset.size);
      this._syncFontSize();
    });

    // Clear data
    document.getElementById('clear-data-btn')?.addEventListener('click', () => {
      if (confirm('Clear all app data including history and settings?')) {
        History.clear();
        localStorage.clear();
        Settings.load();
        this._renderSettings();
        toast('All data cleared', '🗑️', 2000);
      }
    });

    // Rate app (demo)
    document.getElementById('rate-app-btn')?.addEventListener('click', () => {
      toast('Thank you for your feedback! ⭐⭐⭐⭐⭐', '❤️', 3000);
    });

    document.getElementById('settings-back')?.addEventListener('click', () => Router.back());
  },

  _syncThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const isDark = Settings.get('theme') === 'dark';
    toggle.classList.toggle('on', isDark);
    const label = document.getElementById('theme-label');
    if (label) label.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  },

  _syncLangPicker() {
    const lang = Settings.get('language');
    $$('.lang-chip[data-lang]').forEach(chip => {
      chip.classList.toggle('selected', chip.dataset.lang === lang);
    });
  },

  _syncAvatarStyle() {
    const style = Settings.get('avatarStyle') || 'vector';
    $$('#avatar-style-picker .lang-chip').forEach(chip => {
      chip.classList.toggle('selected', chip.dataset.style === style);
    });
  },

  _syncFontSize() {
    const size = Settings.get('fontSize');
    $$('.font-size-opt').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.size === size);
    });
  },

  _syncToggles() {
    const toggleMap = {
      'contrast-toggle': 'highContrast',
      'voice-toggle':    'voiceEnabled',
      'history-toggle':  'saveHistory',
    };
    Object.entries(toggleMap).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('on', Settings.get(key));
    });
  },
};

/* ── Boot ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
