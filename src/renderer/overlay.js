'use strict';

// Overlay orchestrator: owns the Cat (position + physics), the render loop,
// coordinate mapping between OS-screen and window-client space, and wires the
// global input / settings / fullscreen / status feeds into the behavior layer,
// reminders, particles, sound and speech bubbles.

const { OYEN } = window;
const { OyenState } = window;
const { Behaviors } = window;
const { Reminders } = window;
const { Particles } = window;
const { Bubbles } = window;
const { Sound } = window;

const BASE_W = OYEN.BASE_W;
const BASE_H = OYEN.BASE_H;
const ANCHOR_X = 24; // base x that maps to the cat's centre
const ANCHOR_FEET = 41; // base y that maps to the ground point

class Cat {
  constructor(app) {
    this.app = app;
    this.state = new OyenState();
    this.scale = 5;
    this.extraScale = 1; // transient growth (stretch reminder)

    // Rest position in OS-screen coordinates.
    this.sx = 400;
    this.groundY = 400;
    this.hop = 0; // upward offset in px

    this.dragging = false;
    this.suppressed = false; // peek/fullscreen suppression
    this.lastTrail = [];
    this.kneadingUntil = 0;
    this.lastActivity = Date.now();
    this.pomoPhase = 'idle';

    this._drag = null;
    this._release = null;
    this._pounceAnim = null;
    this._pendingPounce = null;
    this._hopAnim = null;
    this._steamAcc = 0;
    this._zAcc = 0;
    this._wander = { nextAt: Date.now() + 8000, target: null };
  }

  setScale(s) {
    this.scale = s;
  }

  // ---- geometry helpers (screen space) ----
  visual() {
    if (this.dragging && this._drag) {
      return { x: this._drag.x, feetY: this._drag.feetY };
    }
    return { x: this.sx, feetY: this.groundY - this.hop };
  }

  headCenter() {
    const v = this.visual();
    const s = this.scale * this.extraScale;
    return { x: v.x, y: v.feetY + (19 - ANCHOR_FEET) * s };
  }

  bodyCenter() {
    const v = this.visual();
    const s = this.scale * this.extraScale;
    return { x: v.x, y: v.feetY + (28 - ANCHOR_FEET) * s };
  }

  bodyRect() {
    const v = this.visual();
    const s = this.scale * this.extraScale;
    return {
      x: v.x + (9 - ANCHOR_X) * s,
      y: v.feetY + (4 - ANCHOR_FEET) * s,
      w: 30 * s,
      h: 38 * s,
    };
  }

  headRect() {
    const v = this.visual();
    const s = this.scale * this.extraScale;
    return {
      x: v.x + (13 - ANCHOR_X) * s,
      y: v.feetY + (8 - ANCHOR_FEET) * s,
      w: 22 * s,
      h: 22 * s,
    };
  }

  distanceTo(x, y) {
    const c = this.bodyCenter();
    return Math.hypot(x - c.x, y - c.y);
  }

  overBody(x, y) {
    return pointIn(this.bodyRect(), x, y);
  }

  overHead(x, y) {
    return pointIn(this.headRect(), x, y);
  }

  faceToward(x) {
    const v = this.visual();
    if (Math.abs(x - v.x) > 20) this.state.mods.facing = x >= v.x ? 1 : -1;
  }

  pupilOffsetToward(x, y) {
    const h = this.headCenter();
    const nx = clamp((x - h.x) / 130, -1, 1);
    const ny = clamp((y - h.y) / 130, -1, 1);
    // Facing flip: when flipped, screen-right is sprite-left.
    return { x: nx * this.state.mods.facing, y: ny };
  }

  // ---- reactions the behavior layer calls ----
  beginDrag(mx, my) {
    this.dragging = true;
    this.lastActivity = Date.now();
    const v = this.visual();
    this._drag = {
      grabDX: v.x - mx,
      grabDFeetY: v.feetY - my,
      x: v.x,
      feetY: v.feetY,
      prevX: mx,
      prevY: my,
      vy: 0,
    };
    this.state.set('idle', { force: true });
    window.oyen.setCapture(true);
    this.app.sound._ensure();
  }

  dragTo(mx, my) {
    if (!this.dragging || !this._drag) return;
    const d = this._drag;
    d.vy = my - d.prevY;
    d.x = mx + d.grabDX;
    d.feetY = my + d.grabDFeetY;
    d.prevX = mx;
    d.prevY = my;
    this.lastActivity = Date.now();
    // Mochi stretch: fling up -> stretch tall; press down -> squash.
    const stretch = clamp(1 - d.vy * 0.02, 0.7, 1.7);
    this.state.mods.stretchY = stretch;
    this.state.mods.squashY = 1 / Math.sqrt(stretch);
  }

  endDrag() {
    if (!this.dragging) return;
    const d = this._drag;
    this.dragging = false;
    this.sx = d.x;
    this.groundY = d.feetY;
    this._drag = null;
    window.oyen.setCapture(false);
    this.clampPosition();
    // Snap-back wobble + small drop bounce.
    this._release = { t: 0, dur: 0.6 };
    this._hopAnim = { t: 0, dur: 0.35, height: 10, from: 0 };
  }

  startScrollPull(len, delta) {
    this.lastActivity = Date.now();
    if (this.isBusyPose() || this.dragging || this.suppressed) return;
    this.state.set('scroll-pull', { duration: 0.7, next: 'idle' });
    const paws = this.pawAnchor();
    this.app.particles.startPaper(paws.cx, paws.cy, len, delta);
  }

  pawAnchor() {
    // Client-space point just under the paws for the paper roll.
    const v = this.visual();
    const s = this.scale * this.extraScale;
    const sc = this.app.toClient(v.x, v.feetY);
    return { cx: sc.x, cy: sc.y - 2 * s };
  }

  predictPounceTarget(cursor) {
    const trail = this.lastTrail;
    let tx = cursor.x;
    let ty = cursor.y;
    if (trail && trail.length >= 2) {
      const a = trail[0];
      const b = trail[trail.length - 1];
      tx = b.x + (b.x - a.x) * 0.6;
      ty = b.y + (b.y - a.y) * 0.6;
    }
    return { x: tx, y: ty };
  }

  queuePounce(target) {
    this._pendingPounce = target;
  }

  isBusyPose() {
    return [
      'pounce',
      'hunt-crouch',
      'stretch-tall',
      'jump-happy',
      'meow',
      'scroll-pull',
    ].includes(this.state.pose);
  }

  emitSteam(dt) {
    this._steamAcc += dt;
    if (this._steamAcc > 0.12) {
      this._steamAcc = 0;
      const h = this.headCenter();
      const c = this.app.toClient(h.x, h.y);
      this.app.particles.emitSteam(c.x, c.y - 8 * this.scale);
    }
  }

  startPurrSound() {
    this.app.sound.startPurr();
  }

  stopPurrSound() {
    this.app.sound.stopPurr();
  }

  // ---- reminders / status triggered ----
  triggerStretch(text) {
    this.wake();
    this.state.set('stretch-tall', { duration: 1.8, next: 'idle' });
    this._grow = { t: 0, dur: 1.8, peak: 1.35 };
    this.app.bubbles.showTransient(text, 4500);
    this.app.sound.chirp();
  }

  triggerMessage(text) {
    this.wake();
    this.state.set('meow', { duration: 1.1, next: 'idle' });
    this._hopAnim = { t: 0, dur: 0.5, height: 14, from: 0 };
    this.app.bubbles.showTransient(text, 6000);
    this.app.sound.meow();
  }

  jumpHappy() {
    this.wake();
    this.state.set('jump-happy', { duration: 0.7, next: 'idle' });
    this._hopAnim = { t: 0, dur: 0.6, height: 22, from: 0 };
    this.app.sound.chirp();
  }

  setThinking(on) {
    this._thinking = on;
    if (on) {
      this.app.bubbles.showTransient('…thinking', 100000);
      if (!this.isBusyPose()) this.state.set('thinking');
    } else {
      this.app.bubbles.hideTransient();
      if (this.state.is('thinking')) this.state.set('idle');
    }
  }

  wake() {
    this.lastActivity = Date.now();
    if (this.state.is('sleep')) this.state.set('idle');
  }

  clampPosition() {
    const vb = this.app.geometry.virtual;
    const margin = 40;
    this.sx = clamp(this.sx, vb.x + margin, vb.x + vb.width - margin);
    this.groundY = clamp(
      this.groundY,
      vb.y + margin,
      vb.y + vb.height - margin
    );
  }

  enterPeek(display) {
    this.suppressed = true;
    this.dragging = false;
    this._drag = null;
    // Dock at the nearest bottom corner of the fullscreen display.
    const nearRight = this.sx > display.x + display.width / 2;
    this.sx = nearRight ? display.x + display.width - 30 : display.x + 30;
    this.groundY = display.y + display.height - 20;
    this.state.mods.facing = nearRight ? -1 : 1;
    this.state.set('peek', { force: true });
  }

  leavePeek() {
    this.suppressed = false;
    this.state.set('idle', { force: true });
    this.clampPosition();
  }

  // ---- physics / per-frame ----
  update(dt) {
    const now = Date.now();

    // Enter pounce leap when the pose flips to 'pounce'.
    if (this.state.is('pounce') && !this._pounceAnim && this._pendingPounce) {
      const t = this._pendingPounce;
      this._pendingPounce = null;
      const dest = clamp(t.x, this.sx - 260, this.sx + 260);
      this._pounceAnim = { fromX: this.sx, toX: dest, t: 0, dur: 0.34, height: 26 };
      this.state.mods.facing = dest >= this.sx ? 1 : -1;
    }

    if (this._pounceAnim) {
      const a = this._pounceAnim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      this.sx = a.fromX + (a.toX - a.fromX) * k;
      this.hop = Math.sin(k * Math.PI) * a.height;
      if (k >= 1) {
        this._pounceAnim = null;
        this.hop = 0;
        this.clampPosition();
        this.state.set('idle', { force: true });
      }
    }

    // Generic hop arc (jump-happy / meow bounce).
    if (this._hopAnim) {
      const a = this._hopAnim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      this.hop = Math.sin(k * Math.PI) * a.height;
      if (k >= 1) {
        this._hopAnim = null;
        this.hop = 0;
      }
    }

    // Release wobble (drag snap-back).
    if (this._release) {
      const r = this._release;
      r.t += dt;
      const k = r.t / r.dur;
      const decay = Math.max(0, 1 - k);
      const osc = Math.sin(k * Math.PI * 6) * 0.25 * decay;
      this.state.mods.stretchY = 1 + osc;
      this.state.mods.squashY = 1 - osc * 0.6;
      if (k >= 1) {
        this._release = null;
        this.state.mods.stretchY = 1;
        this.state.mods.squashY = 1;
      }
    } else if (!this.dragging) {
      this.state.mods.stretchY = 1;
      this.state.mods.squashY = 1;
    }

    // Transient growth (stretch reminder).
    if (this._grow) {
      const g = this._grow;
      g.t += dt;
      const k = g.t / g.dur;
      this.extraScale = 1 + Math.sin(Math.min(Math.PI, k * Math.PI)) * (g.peak - 1);
      if (k >= 1) {
        this._grow = null;
        this.extraScale = 1;
      }
    }

    if (this.suppressed) return;

    // Idle -> sleep after inactivity (sooner during Pomodoro break).
    const idlePose = this.state.is('idle') || this.state.is('eyes-follow');
    const sleepAfter = this.pomoPhase === 'break' ? 12000 : 45000;
    if (idlePose && now - this.lastActivity > sleepAfter) {
      this.state.set('sleep');
    }

    // Sleepy floating z's.
    if (this.state.is('sleep')) {
      this._zAcc += dt;
      if (this._zAcc > 1.4) {
        this._zAcc = 0;
        const h = this.headCenter();
        const c = this.app.toClient(h.x, h.y);
        this.app.particles.emitZ(c.x + 10 * this.scale, c.y - 6 * this.scale);
      }
    }

    // Gentle idle wandering.
    this._maybeWander(dt, now);
  }

  _maybeWander(dt, now) {
    if (!this.state.is('idle')) {
      if (this.state.is('walk') && !this._wander.target) this.state.set('idle');
      return;
    }
    if (this._wander.target != null) {
      const dx = this._wander.target - this.sx;
      if (Math.abs(dx) < 3) {
        this._wander.target = null;
        this._wander.nextAt = now + 6000 + Math.random() * 10000;
        this.state.set('idle');
      } else {
        this.state.set('walk');
        this.state.mods.facing = dx >= 0 ? 1 : -1;
        this.sx += Math.sign(dx) * Math.min(Math.abs(dx), 40 * dt);
      }
      return;
    }
    if (now >= this._wander.nextAt && Date.now() - this.lastActivity < 40000) {
      const vb = this.app.geometry.virtual;
      const range = 180;
      let t = this.sx + (Math.random() - 0.5) * 2 * range;
      t = clamp(t, vb.x + 60, vb.x + vb.width - 60);
      this._wander.target = t;
    }
  }
}

function pointIn(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---------------------------------------------------------------------------

class App {
  constructor() {
    this.geometry = {
      virtual: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      displays: [],
      primary: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
    };
    this.settings = null;

    this.spriteCanvas = document.getElementById('sprite');
    this.spriteCanvas.width = BASE_W;
    this.spriteCanvas.height = BASE_H;
    this.baseCtx = this.spriteCanvas.getContext('2d');

    this.fxCanvas = document.getElementById('fx');
    this.fxCtx = this.fxCanvas.getContext('2d');
    this._resizeFx();

    this.bubbles = new Bubbles(document.getElementById('bubbles'));
    this.particles = new Particles(this.fxCtx);
    this.sound = new Sound();

    this.cat = new Cat(this);
    this.behaviors = new Behaviors(this.cat);
    this.reminders = new Reminders({
      onStretch: (msg) => this.cat.triggerStretch(msg),
      onMessage: (msg) => this.cat.triggerMessage(msg),
      onPomodoroPhase: (phase) => {
        this.cat.pomoPhase = phase;
      },
    });

    this._lastFrame = performance.now();
    this._reminderAcc = 0;
    this._lastHitbox = '';

    this._wireIpc();
    window.oyen.ready();
    requestAnimationFrame(() => this.loop());
    window.addEventListener('resize', () => this._resizeFx());
  }

  _resizeFx() {
    this.fxCanvas.width = window.innerWidth;
    this.fxCanvas.height = window.innerHeight;
  }

  // OS-screen -> window-client coordinates.
  toClient(sx, sy) {
    return { x: sx - this.geometry.virtual.x, y: sy - this.geometry.virtual.y };
  }

  _wireIpc() {
    window.oyen.onGeometry((g) => {
      this.geometry = g;
      // Position the cat on first geometry if it's still at the default.
      if (!this._placed) {
        this._placed = true;
        this.cat.sx = g.primary.x + g.primary.width / 2;
        this.cat.groundY = g.primary.y + g.primary.height - 90;
      }
    });

    window.oyen.onSettings((s) => {
      this.settings = s;
      this.cat.setScale(s.spriteScale || 5);
      this.sound.setMuted(!!s.muteSound);
      this.reminders.setSettings(s);
      this.bubbles.setPinned(
        s.pinnedEnabled ? this.reminders.interpolate(s.pinnedMessage) : ''
      );
    });

    window.oyen.onInput((e) => this._onInput(e));

    window.oyen.onFullscreen((data) => {
      if (data.fullscreen) this.cat.enterPeek(data.display);
      else this.cat.leavePeek();
    });

    window.oyen.onStatus((status) => {
      if (status === 'thinking') this.cat.setThinking(true);
      else if (status === 'done') {
        this.cat.setThinking(false);
        this.cat.jumpHappy();
        this.bubbles.showTransient('done! ✨', 3500);
      } else {
        this.cat.setThinking(false);
      }
    });

    window.oyen.onVisibility((v) => {
      document.body.style.display = v.visible ? '' : 'none';
    });
  }

  _onInput(e) {
    switch (e.type) {
      case 'mousemove':
        if (this.cat.dragging) this.cat.dragTo(e.x, e.y);
        this.behaviors.onMouseMove(e);
        if (e.speed > 30) this.cat.lastActivity = Date.now();
        break;
      case 'mousedown':
        // Left button only (libuiohook: 1 = left). Undefined => fallback poll.
        if (e.button === 1 || e.button === undefined) this.behaviors.onMouseDown(e);
        break;
      case 'mouseup':
        this.behaviors.onMouseUp(e);
        break;
      case 'wheel':
        this.behaviors.onWheel(e);
        break;
      case 'keydown':
        this.cat.lastActivity = Date.now();
        this.cat.wake();
        this.behaviors.onKeyDown(e);
        break;
      default:
        break;
    }
  }

  loop() {
    const now = performance.now();
    let dt = (now - this._lastFrame) / 1000;
    this._lastFrame = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab throttling

    // ~1Hz reminder tick.
    this._reminderAcc += dt;
    if (this._reminderAcc >= 1) {
      this._reminderAcc = 0;
      this.reminders.tick();
      const cd = this.reminders.countdownText();
      this.bubbles.setCountdown(cd ? cd.text : null, cd ? cd.phase : null);
    }

    this.behaviors.update(dt);
    this.cat.update(dt);
    this.cat.state.update(dt);

    this._render();
    this.particles.update(dt);
    this._renderFx();

    requestAnimationFrame(() => this.loop());
  }

  _render() {
    const cat = this.cat;
    const params = cat.state.params();
    OYEN.draw(this.baseCtx, params);

    const s = cat.scale * cat.extraScale;
    const v = cat.visual();
    const client = this.toClient(v.x, v.feetY);

    // Position the (CSS-scaled, pixelated) sprite canvas by its anchor.
    const left = client.x - ANCHOR_X * s;
    const top = client.y - ANCHOR_FEET * s;
    this.spriteCanvas.style.width = `${BASE_W * s}px`;
    this.spriteCanvas.style.height = `${BASE_H * s}px`;
    this.spriteCanvas.style.transform = `translate(${left}px, ${top}px)`;

    // Bubbles anchor to the head.
    const headClient = this.toClient(cat.headCenter().x, cat.headCenter().y);
    this.bubbles.position(headClient.x, headClient.y - 6 * s);

    // Report the interactive hit-box (screen coords) for click-through.
    const rect = cat.suppressed ? null : cat.bodyRect();
    this._reportHitbox(rect);
  }

  _reportHitbox(rect) {
    let payload = [];
    if (rect) {
      payload = [{ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }];
    }
    const key = JSON.stringify(payload);
    if (key !== this._lastHitbox) {
      this._lastHitbox = key;
      window.oyen.setHitbox(payload);
    }
  }

  _renderFx() {
    this.fxCtx.clearRect(0, 0, this.fxCanvas.width, this.fxCanvas.height);
    this.particles.draw();
    if (this.cat.state.is('purr')) {
      const h = this.toClient(this.cat.headCenter().x, this.cat.headCenter().y);
      this.particles.drawPurrLines(h.x, h.y - 4 * this.cat.scale);
    }
  }
}

// Surface any renderer failure to the main-process debug log (a blank overlay
// would otherwise be a silent mystery).
function reportError(where, err) {
  try {
    const info = {
      where,
      message: err && (err.message || String(err)),
      stack: err && err.stack,
    };
    if (window.oyen && window.oyen.logError) window.oyen.logError(info);
    // eslint-disable-next-line no-console
    console.error('[oyen]', where, err);
  } catch (e) {
    /* ignore */
  }
}

window.addEventListener('error', (e) =>
  reportError('window.error', e.error || e.message)
);
window.addEventListener('unhandledrejection', (e) =>
  reportError('unhandledrejection', e.reason)
);

window.addEventListener('DOMContentLoaded', () => {
  try {
    window._oyenApp = new App();
  } catch (err) {
    reportError('App init', err);
  }
});
