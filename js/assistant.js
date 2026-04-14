/* ===== SIGNBRIDGE - VOICE ASSISTANT ===== */

import { Speech } from './speech.js';

export const Assistant = {
  isOpen: false,
  isListening: false,
  _overlayEl: null,
  _statusEl: null,
  onCommand: null,

  COMMANDS: [
    { trigger: ['start camera', 'open camera', 'camera'],     action: 'goto:camera',    label: 'Start camera' },
    { trigger: ['translate speech', 'speech', 'microphone', 'mic'], action: 'goto:speech', label: 'Translate speech' },
    { trigger: ['dual mode', 'both', 'split'],                action: 'goto:dual',      label: 'Dual mode' },
    { trigger: ['emergency', 'help me', 'urgent'],            action: 'goto:emergency', label: 'Emergency mode' },
    { trigger: ['history', 'conversations', 'past'],          action: 'goto:history',   label: 'View history' },
    { trigger: ['settings', 'preferences', 'options'],        action: 'goto:settings',  label: 'Open settings' },
    { trigger: ['home', 'main', 'back'],                      action: 'goto:home',      label: 'Go home' },
    { trigger: ['dark mode', 'dark'],                         action: 'toggle:theme',   label: 'Toggle dark mode' },
    { trigger: ['close', 'dismiss', 'stop listening'],        action: 'close',          label: 'Close assistant' },
  ],

  RESPONSES: {
    'goto:camera':    'Opening the camera for sign language detection.',
    'goto:speech':    'Opening speech to sign translation.',
    'goto:dual':      'Opening dual communication mode.',
    'goto:emergency': 'Opening emergency communication mode.',
    'goto:history':   'Here are your conversation history.',
    'goto:settings':  'Opening settings.',
    'goto:home':      'Going to the home screen.',
    'toggle:theme':   'Toggling the display theme.',
    'close':          'Closing the assistant. Tap the icon anytime to call me!',
    'unknown':        "I didn't catch that. Try saying: start camera, translate speech, or emergency.",
  },

  init(overlayEl) {
    this._overlayEl = overlayEl;
    this._statusEl = overlayEl.querySelector('.assistant-status-text');

    // Set up command chips
    const cmdsEl = overlayEl.querySelector('.assistant-commands');
    if (cmdsEl) {
      cmdsEl.innerHTML = this.COMMANDS.slice(0, 6).map(c => `
        <div class="assistant-cmd" data-action="${c.action}">
          <span>${this._cmdEmoji(c.action)}</span>
          <span>${c.trigger[0].charAt(0).toUpperCase() + c.trigger[0].slice(1)}</span>
        </div>
      `).join('');

      cmdsEl.querySelectorAll('.assistant-cmd').forEach(el => {
        el.addEventListener('click', () => {
          this._executeAction(el.dataset.action);
        });
      });
    }
  },

  _cmdEmoji(action) {
    const map = {
      'goto:camera': '📷',
      'goto:speech': '🎤',
      'goto:dual': '🔀',
      'goto:emergency': '🆘',
      'goto:history': '📋',
      'goto:settings': '⚙️',
      'goto:home': '🏠',
      'toggle:theme': '🌙',
      'close': '✕',
    };
    return map[action] || '🤖';
  },

  open() {
    if (!this._overlayEl) return;
    this.isOpen = true;
    this._overlayEl.classList.add('active');
    this._setStatus('Tap a command or say something...');
    this._startListening();
  },

  close() {
    if (!this._overlayEl) return;
    this.isOpen = false;
    this._overlayEl.classList.remove('active');
    this._stopListening();
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  _startListening() {
    if (!Speech.isSupported()) return;

    const ringEl = this._overlayEl?.querySelector('.assistant-avatar-ring');

    Speech.init();
    Speech.onResult = (text) => this._processInput(text);
    Speech.onInterim = (text) => this._setStatus(`Heard: "${text}"`);
    Speech.onEnd = () => {
      this.isListening = false;
      ringEl?.classList.remove('listening');
    };
    Speech.start();
    this.isListening = true;
    ringEl?.classList.add('listening');
    Speech.speak('Hello! How can I help you navigate SignBridge?');
  },

  _stopListening() {
    Speech.stop();
    Speech.onResult = null;
    Speech.onInterim = null;
    this.isListening = false;
  },

  _processInput(text) {
    const lower = text.toLowerCase().trim();
    this._setStatus(`You said: "${text}"`);

    for (const cmd of this.COMMANDS) {
      if (cmd.trigger.some(t => lower.includes(t))) {
        this._executeAction(cmd.action);
        return;
      }
    }
    // Unknown
    const resp = this.RESPONSES['unknown'];
    Speech.speak(resp);
    this._setStatus(resp);
  },

  _executeAction(action) {
    const resp = this.RESPONSES[action] || this.RESPONSES['unknown'];
    this._setStatus(resp);
    Speech.speak(resp);

    if (action === 'close') {
      setTimeout(() => this.close(), 1200);
      return;
    }

    if (this.onCommand) {
      setTimeout(() => {
        this.onCommand(action);
        if (action.startsWith('goto:')) {
          this.close();
        }
      }, 800);
    }
  },

  _setStatus(text) {
    if (this._statusEl) this._statusEl.textContent = text;
  },

  announce(text) {
    Speech.speak(text);
  },
};
