'use strict';

// Reactive behavior layer. Consumes the global input events (forwarded from the
// main process) and drives the pose state machine + cat physics accordingly.
// Operates on a `cat` context provided by overlay.js.

const HUNT_SPEED = 850; // px/s cursor speed to trigger a hunt
const HUNT_RADIUS = 340; // must be this close to bother hunting
const EYE_RADIUS = 320; // pupils track cursor within this range
const NEAR_RADIUS = 70; // closer than this and other reactions take over
const PET_RADIUS = 46; // cursor within head region
const PET_SUSTAIN = 0.7; // s of petting motion before purring
const OVERHEAT_KPS = 7; // keystrokes/sec (rolling) to overheat
const OVERHEAT_TIME = 3.2; // s to stay overheated after cooldown

class Behaviors {
  constructor(cat) {
    this.cat = cat;
    this.lastCursor = { x: 0, y: 0, t: 0, speed: 0 };

    // Petting detection.
    this._petAccum = 0;
    this._lastPetMoveAt = 0;

    // Kneading (keyboard) sync.
    this._keyTimes = [];
    this._lastKeyAt = 0;

    // Cooldowns so reactions don't thrash.
    this._huntCooldown = 0;
    this._pounceUntil = 0;
    this._overheatUntil = 0;
  }

  // ---- input handlers ----
  onMouseMove(e) {
    this.lastCursor = { x: e.x, y: e.y, t: Date.now(), speed: e.speed };
    this.cat.lastTrail = e.trail || this.cat.lastTrail;

    if (this.cat.suppressed || this.cat.dragging) return;

    const dist = this.cat.distanceTo(e.x, e.y);

    // Petting: gentle movement over the head region. Tracked as "last time
    // this happened" rather than a per-frame counter, since the render loop
    // can run faster than input events arrive - a counter reset every frame
    // would mostly see zero and never accumulate toward PET_SUSTAIN.
    if (dist < PET_RADIUS && this.cat.overHead(e.x, e.y)) {
      const gentle = e.speed > 15 && e.speed < 650;
      if (gentle) {
        this._lastPetMoveAt = Date.now();
      }
    }
  }

  onMouseDown(e) {
    if (this.cat.suppressed) return;
    if (this.cat.overBody(e.x, e.y)) {
      this.cat.beginDrag(e.x, e.y);
    }
  }

  onMouseUp() {
    if (this.cat.dragging) this.cat.endDrag();
  }

  onWheel(e) {
    if (this.cat.suppressed) return;
    // Only react when the cursor is reasonably near the cat.
    if (this.cat.distanceTo(e.x, e.y) > HUNT_RADIUS) return;
    const len = Math.min(40, Math.abs(e.delta) * 6 + 8);
    this.cat.startScrollPull(len, e.delta);
  }

  onKeyDown() {
    const now = Date.now();
    this._keyTimes.push(now);
    // Keep 1s window.
    while (this._keyTimes.length && now - this._keyTimes[0] > 1000) {
      this._keyTimes.shift();
    }
    this._lastKeyAt = now;

    if (this.cat.suppressed || this.cat.dragging) return;

    const kps = this._keyTimes.length;
    if (kps >= OVERHEAT_KPS) {
      this._overheatUntil = now + OVERHEAT_TIME * 1000;
    }

    // Knead if idle/sitting (and not busy with a stronger reaction).
    if (this._canKnead()) {
      this.cat.state.set('knead');
      this.cat.kneadingUntil = now + 900;
    }
  }

  _canKnead() {
    const p = this.cat.state.pose;
    return (
      ['idle', 'sit', 'eyes-follow', 'knead'].includes(p) &&
      Date.now() > this._pounceUntil &&
      Date.now() > this._overheatUntil
    );
  }

  // ---- per-frame update ----
  update(dt) {
    const cat = this.cat;
    const now = Date.now();
    if (this._huntCooldown > 0) this._huntCooldown -= dt;

    if (cat.suppressed || cat.dragging) {
      this._resetPet();
      return;
    }

    // Overheat has top priority (except drag/suppress).
    if (now < this._overheatUntil) {
      cat.state.mods.tint = 1;
      if (!cat.state.is('overheat')) cat.state.set('overheat');
      cat.emitSteam(dt);
      return;
    } else if (cat.state.is('overheat')) {
      cat.state.mods.tint = 0;
      cat.state.set('idle');
    }

    // Active one-shots (pounce / scroll / stretch / jump / meow) run their course.
    if (cat.isBusyPose()) {
      this._resetPet();
      return;
    }

    // Petting -> purr. "Currently petting" is a recency window on the last
    // qualifying move rather than a per-frame counter, so this works
    // regardless of how the render-loop rate compares to input-event rate.
    const petting = now - this._lastPetMoveAt < 150;
    if (petting) {
      this._petAccum += dt;
      if (this._petAccum > PET_SUSTAIN) {
        if (!cat.state.is('purr')) {
          cat.state.set('purr');
          cat.startPurrSound();
        }
        cat.state.mods.blush = Math.min(1, cat.state.mods.blush + dt * 2);
        return;
      }
    } else {
      this._petAccum = Math.max(0, this._petAccum - dt * 1.5);
      if (this._petAccum <= 0 && cat.state.is('purr')) {
        cat.stopPurrSound();
        cat.state.set('idle');
      }
      cat.state.mods.blush = Math.max(0, cat.state.mods.blush - dt);
    }
    if (cat.state.is('purr')) return;

    // Kneading window.
    if (cat.kneadingUntil && now < cat.kneadingUntil) {
      return;
    } else if (cat.state.is('knead')) {
      cat.state.set('idle');
    }

    const c = this.lastCursor;
    const dist = cat.distanceTo(c.x, c.y);
    const cursorFresh = now - c.t < 600;

    // Mouse hunt.
    if (
      cursorFresh &&
      c.speed > HUNT_SPEED &&
      dist < HUNT_RADIUS &&
      dist > NEAR_RADIUS * 0.5 &&
      this._huntCooldown <= 0
    ) {
      this._startHuntSequence();
      return;
    }

    // Eye follow (pupils only) when cursor is in range.
    if (cursorFresh && dist < EYE_RADIUS && dist > NEAR_RADIUS) {
      cat.faceToward(c.x);
      const off = cat.pupilOffsetToward(c.x, c.y);
      cat.state.mods.pupilX = off.x;
      cat.state.mods.pupilY = off.y;
      if (!cat.state.is('eyes-follow') && !cat.state.is('walk')) {
        cat.state.set('eyes-follow');
      }
    } else {
      cat.state.mods.pupilX *= 0.8;
      cat.state.mods.pupilY *= 0.8;
      if (cat.state.is('eyes-follow')) cat.state.set('idle');
    }
  }

  _startHuntSequence() {
    const cat = this.cat;
    this._huntCooldown = 2.5;
    cat.faceToward(this.lastCursor.x);
    cat.state.set('hunt-crouch', { duration: 0.5, next: 'pounce' });
    // Predict target from the recent cursor trail.
    const target = cat.predictPounceTarget(this.lastCursor);
    cat.queuePounce(target, 0.5);
    this._pounceUntil = Date.now() + 1400;
  }

  _resetPet() {
    this._petAccum = 0;
    this._lastPetMoveAt = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Behaviors };
if (typeof window !== 'undefined') window.Behaviors = Behaviors;
