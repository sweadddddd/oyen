'use strict';

const { EventEmitter } = require('events');

// Wraps uiohook-napi to provide SYSTEM-WIDE input events (mouse move/speed,
// clicks, scroll, keystrokes) regardless of which application has focus.
// Falls back to a no-op emitter if the native module cannot be loaded so the
// rest of the app keeps working (see README: `npm run rebuild`).

class InputHooks extends EventEmitter {
  constructor() {
    super();
    this.available = false;
    this.uIOhook = null;
    this._last = { x: 0, y: 0, t: 0 };
    // Rolling window of recent cursor points for pounce path prediction.
    this.trail = [];
    this._loadError = null;

    try {
      // eslint-disable-next-line global-require
      ({ uIOhook: this.uIOhook } = require('uiohook-napi'));
      this.available = !!this.uIOhook;
    } catch (err) {
      this._loadError = err;
      console.warn(
        '[input] uiohook-napi unavailable — global input disabled. ' +
          'Run `npm run rebuild`. Reason:',
        err.message
      );
    }
  }

  start() {
    if (!this.available) return false;
    const u = this.uIOhook;

    u.on('mousemove', (e) => this._onMove(e));
    u.on('mousedown', (e) =>
      this.emit('mousedown', { x: e.x, y: e.y, button: e.button })
    );
    u.on('mouseup', (e) =>
      this.emit('mouseup', { x: e.x, y: e.y, button: e.button })
    );
    u.on('click', (e) =>
      this.emit('click', { x: e.x, y: e.y, button: e.button, clicks: e.clicks })
    );
    u.on('wheel', (e) =>
      this.emit('wheel', {
        x: e.x,
        y: e.y,
        rotation: e.rotation,
        direction: e.direction,
        // Normalize a signed scroll delta (positive = scroll down).
        delta: (e.rotation || 0) * (e.direction === 3 ? -1 : 1),
      })
    );
    u.on('keydown', (e) =>
      this.emit('keydown', { keycode: e.keycode })
    );
    u.on('keyup', (e) => this.emit('keyup', { keycode: e.keycode }));

    try {
      u.start();
      return true;
    } catch (err) {
      console.error('[input] failed to start uiohook:', err.message);
      this.available = false;
      return false;
    }
  }

  _onMove(e) {
    const now = Date.now();
    const dt = Math.max(1, now - this._last.t);
    const dx = e.x - this._last.x;
    const dy = e.y - this._last.y;
    const dist = Math.hypot(dx, dy);
    const speed = (dist / dt) * 1000; // pixels per second

    this._last = { x: e.x, y: e.y, t: now };

    this.trail.push({ x: e.x, y: e.y, t: now });
    // Keep ~300ms of trail.
    while (this.trail.length > 0 && now - this.trail[0].t > 300) {
      this.trail.shift();
    }

    this.emit('mousemove', {
      x: e.x,
      y: e.y,
      speed,
      dx,
      dy,
      trail: this.trail.slice(),
    });
  }

  stop() {
    if (!this.available || !this.uIOhook) return;
    try {
      this.uIOhook.stop();
    } catch (err) {
      // ignore
    }
  }
}

module.exports = { InputHooks };
