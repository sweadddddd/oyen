'use strict';

// Procedural sound via WebAudio — no audio files. Soft purr loop + a little
// "meow" chirp. All output respects the mute setting.

class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.purrNodes = null;
  }

  _ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.muted) this.stopPurr();
  }

  startPurr() {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx || this.purrNodes) return;

    // Low rumble oscillator, amplitude-modulated by a slow LFO to get the
    // characteristic purr flutter.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 28;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 22; // flutter rate

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;

    lfo.connect(lfoGain).connect(gain.gain);
    osc.connect(lp).connect(gain).connect(ctx.destination);

    osc.start();
    lfo.start();
    this.purrNodes = { osc, lfo, gain };
  }

  stopPurr() {
    if (!this.purrNodes) return;
    const { osc, lfo, gain } = this.purrNodes;
    try {
      const now = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0, now, 0.1);
      osc.stop(now + 0.4);
      lfo.stop(now + 0.4);
    } catch (e) {
      // ignore
    }
    this.purrNodes = null;
  }

  meow() {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  chirp() {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Sound };
if (typeof window !== 'undefined') window.Sound = Sound;
