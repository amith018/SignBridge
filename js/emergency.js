/* ===== SIGNBRIDGE - EMERGENCY MODULE ===== */

import { Speech } from './speech.js';

export const Emergency = {
  PHRASES: [
    { id: 'help',      icon: '🆘', text: 'Help!',                      color: '#FF4444' },
    { id: 'pain',      icon: '🤕', text: 'I am in pain',               color: '#FF6B6B' },
    { id: 'call911',   icon: '📞', text: 'Please call 911',            color: '#CC0000' },
    { id: 'silent',    icon: '🤫', text: 'I cannot speak',             color: '#AA0000' },
    { id: 'allergy',   icon: '⚠️', text: 'I have an allergy',          color: '#FF8800' },
    { id: 'doctor',    icon: '🏥', text: 'I need a doctor',            color: '#FF4444' },
    { id: 'water',     icon: '💧', text: 'I need water',               color: '#2196F3' },
    { id: 'lost',      icon: '📍', text: 'I am lost',                  color: '#FF8800' },
    { id: 'name',      icon: '🪪', text: 'My name is...',              color: '#9C27B0' },
    { id: 'deaf',      icon: '👂', text: 'I am deaf / mute',           color: '#6C63FF' },
    { id: 'ok',        icon: '✅', text: 'I am okay',                  color: '#4CAF50' },
    { id: 'thankyou',  icon: '🙏', text: 'Thank you',                  color: '#00D4AA' },
  ],

  speakPhrase(phraseId) {
    const phrase = this.PHRASES.find(p => p.id === phraseId);
    if (!phrase) return;
    Speech.speak(phrase.text, { rate: 0.9, pitch: 1.0 });
    return phrase;
  },

  speakText(text) {
    Speech.speak(text, { rate: 0.9 });
  },
};
