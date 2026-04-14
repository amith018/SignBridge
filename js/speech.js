/* ===== SIGNBRIDGE - SPEECH MODULE ===== */
/* Web Speech API: Recognition + Synthesis */

export const Speech = {
  recognition: null,
  synthesis: window.speechSynthesis,
  isListening: false,
  isSpeaking: false,
  onResult: null,
  onInterim: null,
  onEnd: null,
  onError: null,
  currentLang: 'en-US',

  LANG_MAP: {
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
    hi: 'hi-IN',
    ja: 'ja-JP',
    ar: 'ar-SA',
    pt: 'pt-BR',
  },

  init(lang = 'en') {
    this.currentLang = this.LANG_MAP[lang] || 'en-US';
    const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SRClass) {
      console.warn('SpeechRecognition not supported');
      return false;
    }
    this.recognition = new SRClass();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.currentLang;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText && this.onResult) this.onResult(finalText.trim());
      if (interimText && this.onInterim) this.onInterim(interimText.trim());
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEnd) this.onEnd();
    };

    this.recognition.onerror = (event) => {
      this.isListening = false;
      const msg = event.error === 'not-allowed'
        ? 'Microphone access denied'
        : `Speech error: ${event.error}`;
      if (this.onError) this.onError(msg);
    };

    return true;
  },

  start() {
    if (!this.recognition) this.init();
    if (this.isListening) return;
    try {
      this.recognition.start();
      this.isListening = true;
    } catch (e) {
      console.warn('Speech start error:', e);
    }
  },

  stop() {
    if (!this.recognition || !this.isListening) return;
    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (e) {}
  },

  toggle() {
    if (this.isListening) this.stop();
    else this.start();
  },

  speak(text, opts = {}) {
    if (!this.synthesis || !text) return;
    this.synthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = opts.lang || this.currentLang;
    utt.rate = opts.rate || 0.95;
    utt.pitch = opts.pitch || 1;
    utt.volume = opts.volume || 1;
    utt.onstart = () => { this.isSpeaking = true; };
    utt.onend = () => { this.isSpeaking = false; if (opts.onEnd) opts.onEnd(); };
    this.synthesis.speak(utt);
  },

  cancel() {
    this.synthesis?.cancel();
    this.isSpeaking = false;
  },

  setLanguage(lang) {
    this.currentLang = this.LANG_MAP[lang] || 'en-US';
    if (this.recognition) {
      const wasListening = this.isListening;
      this.stop();
      this.recognition.lang = this.currentLang;
      if (wasListening) this.start();
    }
  },

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  isTTSSupported() {
    return !!window.speechSynthesis;
  },
};
