'use strict';

// Pose state machine. Each pose produces a fresh sprite-parameter object per
// frame (procedural animation over `t` seconds in the pose). One-shot poses
// declare a duration and a pose to fall back to; looping poses run until the
// behavior layer switches them.

const { OYEN } = typeof require !== 'undefined' ? require('./sprite') : window;

class OyenState {
  constructor() {
    this.pose = 'idle';
    this.t = 0; // seconds in current pose
    this.next = null; // fallback pose after a one-shot completes

    // Cross-pose modifiers set by the behavior layer each frame.
    this.mods = {
      pupilX: 0,
      pupilY: 0,
      facing: 1,
      tint: 0, // overheat
      blush: 0, // petting
      offsetX: 0, // hop / drag
      offsetY: 0,
      stretchY: 1, // mochi drag
      squashY: 1,
      extraSquint: 0,
    };

    this._blinkTimer = this._randBlink();
    this._blinking = 0;
  }

  _randBlink() {
    return 2 + Math.random() * 4;
  }

  // Switch pose. `opts.duration` (s) makes it a one-shot returning to
  // `opts.next` (default 'idle'). Re-entering the same looping pose is a no-op.
  set(pose, opts = {}) {
    if (pose === this.pose && !opts.force && !opts.duration) return;
    this.pose = pose;
    this.t = 0;
    this.duration = opts.duration || 0;
    this.next = opts.next || 'idle';
  }

  is(pose) {
    return this.pose === pose;
  }

  update(dt) {
    this.t += dt;

    // Idle spontaneous blinking.
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0) {
      this._blinking = 0.14; // blink length
      this._blinkTimer = this._randBlink();
    }
    if (this._blinking > 0) this._blinking -= dt;

    // One-shot completion.
    if (this.duration && this.t >= this.duration) {
      const nxt = this.next;
      this.duration = 0;
      this.set(nxt, { force: true });
    }
  }

  // Build the sprite parameters for this frame.
  params() {
    const p = OYEN.defaults();
    const t = this.t;
    const m = this.mods;

    p.facing = m.facing;
    p.pupilX = m.pupilX;
    p.pupilY = m.pupilY;
    p.tint = m.tint;
    p.blush = m.blush;

    switch (this.pose) {
      case 'idle':
        p.legMode = 'sit';
        p.breathe = 1 + Math.sin(t * 2.2) * 0.015;
        p.tailPhase = (t * 0.18) % 1;
        if (this._blinking > 0) p.eyeOpen = 0.1;
        break;

      case 'eyes-follow':
        p.legMode = 'sit';
        p.breathe = 1 + Math.sin(t * 2.2) * 0.015;
        p.tailPhase = (t * 0.12) % 1;
        // pupils come from mods (set by behavior)
        break;

      case 'sit':
        p.legMode = 'sit';
        p.breathe = 1 + Math.sin(t * 1.8) * 0.02;
        if (this._blinking > 0) p.eyeOpen = 0.1;
        break;

      case 'walk':
        p.legMode = 'walk';
        p.legPhase = (t * 3.2) % 1;
        p.breathe = 1 + Math.sin(t * 6) * 0.02;
        p.tailPhase = (t * 0.8) % 1;
        break;

      case 'sleep':
        p.legMode = 'sleep';
        p.eyeOpen = 0;
        // slow breathing scale
        p.breathe = 1 + Math.sin(t * 0.9) * 0.06;
        break;

      case 'stretch-tall':
        p.legMode = 'stand';
        // grow then settle
        p.stretchY = 1 + Math.sin(Math.min(Math.PI, t * 2.2)) * 0.5;
        p.earPerk = 1;
        p.eyeOpen = 0.3;
        p.mouthOpen = t < 0.6 ? 1 : 0;
        break;

      case 'hunt-crouch':
        p.legMode = 'stand';
        p.crouch = 1;
        p.earPerk = 1;
        p.eyeOpen = 1;
        // butt wiggle
        p.offsetX = Math.sin(t * 18) * 1;
        p.tailPhase = (t * 1.5) % 1;
        break;

      case 'pounce': {
        p.legMode = 'pounce';
        p.earPerk = 1;
        p.eyeOpen = 1;
        // quick forepaw reach
        p.forePawReach = Math.min(1, t * 6);
        break;
      }

      case 'purr':
        p.legMode = 'sit';
        p.squint = 1;
        p.breathe = 1 + Math.sin(t * 12) * 0.03; // fast purr vibration
        p.blush = Math.max(p.blush, 0.6);
        break;

      case 'knead':
        p.legMode = 'knead';
        p.squint = 0.7;
        p.legPhase = (t * 4) % 1;
        p.breathe = 1 + Math.sin(t * 8) * 0.02;
        break;

      case 'overheat':
        p.legMode = 'sit';
        p.tint = Math.max(p.tint, 1);
        p.eyeOpen = 0.5;
        p.squint = 0.3;
        p.offsetX = Math.sin(t * 24) * 0.6; // jitter
        break;

      case 'scroll-pull':
        p.legMode = 'scroll';
        p.forePawReach = (Math.sin(t * 10) + 1) / 2; // gripping pull
        p.eyeOpen = 0.8;
        break;

      case 'peek':
        p.legMode = 'peek';
        p.eyeOpen = 1;
        break;

      case 'jump-happy':
        p.legMode = 'stand';
        p.squint = 1;
        // handled with arc offset in behavior; small squash on land
        break;

      case 'thinking':
        p.legMode = 'sit';
        p.eyeOpen = 0.6;
        p.pupilY = 1; // look up
        p.breathe = 1 + Math.sin(t * 2) * 0.02;
        break;

      case 'meow':
        p.legMode = 'sit';
        p.mouthOpen = (Math.sin(t * 14) + 1) / 2 > 0.5 ? 1 : 0.2;
        p.eyeOpen = 0.7;
        break;

      default:
        p.legMode = 'sit';
    }

    // Apply drag/hop overrides last.
    if (m.stretchY !== 1) p.stretchY = m.stretchY;
    if (m.squashY !== 1) p.squashY = m.squashY;
    if (m.offsetX) p.offsetX += m.offsetX;
    if (m.offsetY) p.offsetY += m.offsetY;
    if (m.extraSquint) p.squint = Math.max(p.squint, m.extraSquint);

    return p;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { OyenState };
if (typeof window !== 'undefined') window.OyenState = OyenState;
