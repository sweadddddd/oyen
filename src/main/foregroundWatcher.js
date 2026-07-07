'use strict';

const { EventEmitter } = require('events');

// Polls the focused foreground window (via active-win) and reports whether it
// covers (approximately) a full display — used to trigger the cat's "peek" mode
// so it gets out of the way of fullscreen games/videos.
// Degrades to "never fullscreen" if active-win is unavailable.

class ForegroundWatcher extends EventEmitter {
  constructor(screenApi, { intervalMs = 1500 } = {}) {
    super();
    this.screen = screenApi;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.fullscreen = false;
    this.activeWin = null;

    try {
      // active-win v8 is ESM-only; load lazily in poll() via dynamic import.
      this.available = true;
    } catch (err) {
      this.available = false;
    }
  }

  async _getActiveWin() {
    if (this.activeWin) return this.activeWin;
    try {
      const mod = await import('active-win');
      this.activeWin = mod.default || mod;
      return this.activeWin;
    } catch (err) {
      console.warn('[foreground] active-win unavailable:', err.message);
      this.available = false;
      return null;
    }
  }

  start() {
    if (this.timer) return;
    const tick = async () => {
      await this._poll();
      this.timer = setTimeout(tick, this.intervalMs);
    };
    tick();
  }

  async _poll() {
    if (!this.available) return;
    const activeWin = await this._getActiveWin();
    if (!activeWin) return;

    let win;
    try {
      win = await activeWin();
    } catch (err) {
      return;
    }
    if (!win || !win.bounds) return;

    const b = win.bounds;
    // Find the display the window sits on and compare bounds.
    const display =
      this.screen.getDisplayMatching({
        x: Math.round(b.x),
        y: Math.round(b.y),
        width: Math.round(b.width),
        height: Math.round(b.height),
      }) || this.screen.getPrimaryDisplay();

    const db = display.bounds;
    const coversW = b.width >= db.width - 4;
    const coversH = b.height >= db.height - 4;
    // Ignore our own overlay / the desktop shell.
    const owner = (win.owner && win.owner.name) || '';
    const isShell = /explorer\.exe|Finder|Electron/i.test(owner);

    const isFull = coversW && coversH && !isShell;

    if (isFull !== this.fullscreen) {
      this.fullscreen = isFull;
      // Report the display so the cat can dock at the nearest edge.
      this.emit('change', { fullscreen: isFull, display: db, owner });
    }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { ForegroundWatcher };
