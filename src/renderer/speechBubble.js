'use strict';

// Tiny pixel-styled speech bubbles + a floating Pomodoro countdown readout,
// positioned in virtual-screen coordinates and rendered as DOM elements.

class Bubbles {
  constructor(root) {
    this.root = root;

    this.transient = document.createElement('div');
    this.transient.className = 'oyen-bubble transient hidden';
    this.root.appendChild(this.transient);

    this.pinned = document.createElement('div');
    this.pinned.className = 'oyen-bubble pinned hidden';
    this.root.appendChild(this.pinned);

    this.countdown = document.createElement('div');
    this.countdown.className = 'oyen-countdown hidden';
    this.root.appendChild(this.countdown);

    this._transientTimer = null;
  }

  // clientX/clientY are the cat's head anchor in window (client) coordinates.
  position(clientX, clientY) {
    this._anchor = { x: clientX, y: clientY };
    this._place(this.transient, clientX, clientY - 6, 'above');
    this._place(this.pinned, clientX, clientY - 34, 'above');
    this._place(this.countdown, clientX + 40, clientY - 20, 'side');
  }

  _place(el, x, y, mode) {
    if (el.classList.contains('hidden')) return;
    const w = el.offsetWidth || 80;
    const h = el.offsetHeight || 24;
    el.style.left = `${Math.round(x - w / 2)}px`;
    el.style.top = `${Math.round(y - h)}px`;
  }

  showTransient(text, ms = 4000) {
    this.transient.textContent = text;
    this.transient.classList.remove('hidden');
    if (this._anchor) this.position(this._anchor.x, this._anchor.y);
    if (this._transientTimer) clearTimeout(this._transientTimer);
    this._transientTimer = setTimeout(() => this.hideTransient(), ms);
  }

  hideTransient() {
    this.transient.classList.add('hidden');
  }

  setPinned(text) {
    if (text && text.trim()) {
      this.pinned.textContent = text;
      this.pinned.classList.remove('hidden');
    } else {
      this.pinned.classList.add('hidden');
    }
    if (this._anchor) this.position(this._anchor.x, this._anchor.y);
  }

  setCountdown(text, phase) {
    if (text) {
      this.countdown.textContent = text;
      this.countdown.dataset.phase = phase || 'focus';
      this.countdown.classList.remove('hidden');
    } else {
      this.countdown.classList.add('hidden');
    }
    if (this._anchor) this.position(this._anchor.x, this._anchor.y);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Bubbles };
if (typeof window !== 'undefined') window.Bubbles = Bubbles;
