'use strict';

// Parametric hand-coded pixel-art cat. Everything is drawn with integer-aligned
// fillRects onto a small base canvas (BASE_W x BASE_H) which is then CSS-scaled
// with image-rendering: pixelated. All poses come from ONE draw routine driven
// by a parameter object, so animations are just parameter interpolation.

const OYEN = (() => {
  const BASE_W = 48;
  const BASE_H = 44;

  const C = {
    fur: '#f0c988',
    furDark: '#e3b56f',
    cream: '#faf1de',
    stripe: '#c9954f',
    eye: '#9fb08c',
    eyeLight: '#c2d0b3',
    pupil: '#2b2b2b',
    nose: '#e8a598',
    pink: '#f2c2b8',
    bell: '#e8935a',
    bellDark: '#c9743f',
    collar: '#b5813f',
    outline: '#a97b3d',
    whisker: 'rgba(255,255,255,0.75)',
  };

  // Default parameter set. Poses override a subset of these.
  function defaults() {
    return {
      facing: 1, // 1 = right-ish, -1 = flipped
      eyeOpen: 1, // 0 closed .. 1 open
      squint: 0, // 0..1 happy ^^ eyes
      pupilX: 0, // -1..1
      pupilY: 0, // -1..1
      mouthOpen: 0, // 0..1 (meow)
      tint: 0, // 0..1 red overheat overlay
      breathe: 1, // body vertical breathing scale
      stretchY: 1, // mochi / stretch vertical scale
      squashY: 1, // landing squash
      crouch: 0, // 0..1 lowers head, raises rear (hunt)
      legMode: 'sit', // sit|stand|walk|pounce|sleep|knead|scroll|peek|curl
      legPhase: 0, // 0..1
      tailPhase: 0, // 0..1
      earPerk: 0, // 0..1 ears up/back
      offsetX: 0,
      offsetY: 0,
      forePawReach: 0, // 0..1 front paws extended (pounce/scroll)
      blush: 0,
    };
  }

  // Draw the sprite for parameters `p` into ctx (base-resolution canvas).
  function draw(ctx, p) {
    ctx.clearRect(0, 0, BASE_W, BASE_H);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    // Facing flip about center.
    if (p.facing < 0) {
      ctx.translate(BASE_W, 0);
      ctx.scale(-1, 1);
    }
    ctx.translate(p.offsetX, p.offsetY);

    if (p.legMode === 'peek') {
      drawPeek(ctx, p);
    } else if (p.legMode === 'sleep' || p.legMode === 'curl') {
      drawSleeping(ctx, p);
    } else {
      drawUpright(ctx, p);
    }

    ctx.restore();

    if (p.tint > 0) drawTint(ctx, p.tint);
  }

  function R(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // ---- Curled-up sleeping pose ----
  function drawSleeping(ctx, p) {
    const cx = 24;
    const cy = 34;
    const b = p.breathe;
    // Rounded body blob.
    R(ctx, cx - 15, cy - 8 * b, 30, 12 * b, C.fur);
    R(ctx, cx - 17, cy - 4 * b, 34, 8 * b, C.fur);
    R(ctx, cx - 12, cy - 1, 24, 4, C.furDark);
    // Belly/chest lighter patch.
    R(ctx, cx - 6, cy - 3 * b, 16, 5 * b, C.cream);
    // Tail curled around front.
    R(ctx, cx + 10, cy - 2, 8, 4, C.fur);
    R(ctx, cx + 14, cy - 5, 4, 6, C.fur);
    R(ctx, cx + 15, cy - 7, 4, 3, C.stripe);
    // Tucked head.
    R(ctx, cx - 16, cy - 9, 12, 9, C.fur);
    // Ears.
    R(ctx, cx - 15, cy - 12, 3, 3, C.fur);
    R(ctx, cx - 10, cy - 12, 3, 3, C.fur);
    R(ctx, cx - 14, cy - 11, 1, 1, C.pink);
    R(ctx, cx - 9, cy - 11, 1, 1, C.pink);
    // Closed eye (a small arc).
    R(ctx, cx - 13, cy - 5, 3, 1, C.pupil);
    // little "z" motion is handled as a DOM/particle elsewhere.
    // Forehead stripes.
    R(ctx, cx - 13, cy - 9, 1, 3, C.stripe);
    R(ctx, cx - 11, cy - 9, 1, 3, C.stripe);
  }

  // ---- Peek pose: only head + paws poking in from an edge ----
  function drawPeek(ctx, p) {
    const cx = 24;
    const top = 20; // head sits low; edge crops above via container
    drawHead(ctx, cx, top, p, 0.9);
    // Two paws gripping.
    R(ctx, cx - 9, top + 12, 5, 4, C.cream);
    R(ctx, cx + 4, top + 12, 5, 4, C.cream);
  }

  // ---- Main upright body (sit / stand / walk / pounce / knead / scroll) ----
  function drawUpright(ctx, p) {
    const cx = 24;
    const feet = 41;
    const sy = p.stretchY;
    const qy = p.squashY;

    // Body height varies with pose.
    let bodyTop;
    if (p.legMode === 'sit' || p.legMode === 'knead') bodyTop = 22;
    else if (p.legMode === 'pounce') bodyTop = 18;
    else bodyTop = 20;

    // Apply crouch: lower the head region.
    const crouchDrop = p.crouch * 5;

    // ---- Tail ----
    drawTail(ctx, cx, feet - 6, p);

    // ---- Torso ----
    const torsoTop = bodyTop;
    const torsoH = (feet - torsoTop);
    const scaledH = torsoH * sy * qy * p.breathe;
    const torsoDrawTop = feet - scaledH;

    // Ginger sides.
    R(ctx, cx - 10, torsoDrawTop, 20, scaledH, C.fur);
    R(ctx, cx - 12, torsoDrawTop + scaledH * 0.4, 24, scaledH * 0.6, C.fur);
    // Cream chest/belly patch.
    R(ctx, cx - 5, torsoDrawTop + 2, 12, scaledH - 3, C.cream);
    // Tabby stripe accents on the sides.
    R(ctx, cx - 11, torsoDrawTop + scaledH * 0.5, 2, 4, C.stripe);
    R(ctx, cx + 9, torsoDrawTop + scaledH * 0.5, 2, 4, C.stripe);

    // ---- Legs / paws ----
    drawLegs(ctx, cx, feet, p);

    // ---- Head ----
    const headY = torsoDrawTop - 6 + crouchDrop;
    drawHead(ctx, cx, Math.max(2, headY), p, 1);

    // ---- Collar + bell (under the chin) ----
    const collarY = Math.max(2, headY) + 15;
    R(ctx, cx - 7, collarY, 14, 1, C.collar);
    R(ctx, cx - 1, collarY + 1, 3, 3, C.bell);
    R(ctx, cx - 1, collarY + 1, 3, 1, C.bellDark);
    R(ctx, cx, collarY + 4, 1, 1, C.bellDark);
  }

  function drawTail(ctx, cx, y, p) {
    // Sways with tailPhase (-1..1 mapped from 0..1).
    const sway = Math.sin(p.tailPhase * Math.PI * 2) * 4;
    const baseX = cx + 9;
    R(ctx, baseX, y, 4, 5, C.fur);
    R(ctx, baseX + 2, y - 4, 4, 5, C.fur);
    R(ctx, baseX + 4 + sway * 0.4, y - 8, 4, 5, C.fur);
    R(ctx, baseX + 5 + sway, y - 12, 4, 5, C.fur);
    // Striped tip.
    R(ctx, baseX + 5 + sway, y - 15, 4, 3, C.stripe);
    R(ctx, baseX + 5 + sway, y - 11, 4, 1, C.stripe);
  }

  function drawLegs(ctx, cx, feet, p) {
    const stripe = () => {};
    if (p.legMode === 'sit') {
      // Two front paws together at the bottom.
      R(ctx, cx - 6, feet - 3, 5, 3, C.cream);
      R(ctx, cx + 1, feet - 3, 5, 3, C.cream);
      R(ctx, cx - 6, feet - 4, 5, 1, C.stripe);
      R(ctx, cx + 1, feet - 4, 5, 1, C.stripe);
    } else if (p.legMode === 'knead') {
      // Alternating front paws pressing (legPhase).
      const up = Math.sin(p.legPhase * Math.PI * 2);
      R(ctx, cx - 7, feet - 3 - Math.max(0, up) * 3, 5, 3, C.cream);
      R(ctx, cx + 2, feet - 3 - Math.max(0, -up) * 3, 5, 3, C.cream);
      // little motion lines under paws
      R(ctx, cx - 6, feet, 3, 1, C.outline);
      R(ctx, cx + 3, feet, 3, 1, C.outline);
    } else if (p.legMode === 'walk') {
      // Shuffle: two paws offset by phase.
      const s = Math.sin(p.legPhase * Math.PI * 2) * 2;
      R(ctx, cx - 7 + s, feet - 3, 5, 3, C.cream);
      R(ctx, cx + 2 - s, feet - 3, 5, 3, C.cream);
      R(ctx, cx - 7 + s, feet - 4, 5, 1, C.stripe);
    } else if (p.legMode === 'pounce') {
      // Forelegs stretched forward, hindlegs back.
      const reach = 6 + p.forePawReach * 6;
      R(ctx, cx + 4, feet - 8, reach, 4, C.fur);
      R(ctx, cx + 4 + reach, feet - 8, 4, 4, C.cream);
      R(ctx, cx - 12, feet - 2, 6, 4, C.fur); // hind
      R(ctx, cx - 13, feet - 2, 3, 4, C.cream);
    } else if (p.legMode === 'scroll') {
      // Both paws up gripping (paper roll drawn separately by overlay).
      R(ctx, cx - 8, feet - 12 - p.forePawReach * 3, 5, 5, C.cream);
      R(ctx, cx + 3, feet - 12 - p.forePawReach * 3, 5, 5, C.cream);
      R(ctx, cx - 8, feet - 13 - p.forePawReach * 3, 5, 1, C.stripe);
      R(ctx, cx + 3, feet - 13 - p.forePawReach * 3, 5, 1, C.stripe);
      // standing legs
      R(ctx, cx - 6, feet - 3, 4, 3, C.fur);
      R(ctx, cx + 2, feet - 3, 4, 3, C.fur);
    } else {
      // stand: four little legs.
      R(ctx, cx - 8, feet - 4, 4, 4, C.fur);
      R(ctx, cx - 2, feet - 4, 4, 4, C.fur);
      R(ctx, cx + 4, feet - 4, 4, 4, C.fur);
      R(ctx, cx - 8, feet - 1, 4, 1, C.cream);
      R(ctx, cx + 4, feet - 1, 4, 1, C.cream);
    }
  }

  // Head with ears, tabby forehead stripes, eyes, nose, whiskers.
  // scale ~ overall head size factor.
  function drawHead(ctx, cx, top, p, scale) {
    const w = 20;
    const h = 16;
    const left = cx - w / 2;

    // Ears.
    const perk = p.earPerk;
    const earY = top - 4 + perk * 1;
    // left ear
    R(ctx, left + 1, earY, 5, 5, C.fur);
    R(ctx, left + 2, earY + 1, 3, 3, C.pink);
    R(ctx, left, earY + 1, 1, 4, C.stripe);
    // right ear
    R(ctx, left + w - 6, earY, 5, 5, C.fur);
    R(ctx, left + w - 5, earY + 1, 3, 3, C.pink);
    R(ctx, left + w - 1, earY + 1, 1, 4, C.stripe);

    // Head block (rounded by trimming corners).
    R(ctx, left + 1, top, w - 2, h, C.fur);
    R(ctx, left, top + 2, w, h - 4, C.fur);
    R(ctx, left + 2, top + h - 1, w - 4, 2, C.fur);
    // Muzzle / cheeks cream.
    R(ctx, cx - 6, top + 8, 12, 6, C.cream);

    // Forehead tabby stripes.
    R(ctx, cx - 1, top + 1, 1, 4, C.stripe);
    R(ctx, cx - 4, top + 1, 1, 3, C.stripe);
    R(ctx, cx + 2, top + 1, 1, 3, C.stripe);

    // Eyes.
    drawEyes(ctx, cx, top + 6, p);

    // Nose.
    R(ctx, cx - 1, top + 9, 2, 2, C.nose);
    // Mouth (meow opens it).
    if (p.mouthOpen > 0.3) {
      R(ctx, cx - 1, top + 11, 2, 2, C.pink);
    } else {
      R(ctx, cx - 2, top + 11, 1, 1, C.outline);
      R(ctx, cx + 1, top + 11, 1, 1, C.outline);
    }

    // Blush (petting).
    if (p.blush > 0) {
      ctx.globalAlpha = 0.5 * p.blush;
      R(ctx, cx - 8, top + 9, 2, 2, C.nose);
      R(ctx, cx + 6, top + 9, 2, 2, C.nose);
      ctx.globalAlpha = 1;
    }

    // Whiskers (thin light lines).
    R(ctx, cx - 11, top + 9, 4, 1, C.whisker);
    R(ctx, cx - 11, top + 11, 4, 1, C.whisker);
    R(ctx, cx + 7, top + 9, 4, 1, C.whisker);
    R(ctx, cx + 7, top + 11, 4, 1, C.whisker);
  }

  function drawEyes(ctx, cx, y, p) {
    const lx = cx - 5;
    const rx = cx + 2;
    const open = p.eyeOpen;

    if (p.squint > 0.5) {
      // Happy ^ ^ eyes.
      R(ctx, lx, y + 2, 1, 1, C.pupil);
      R(ctx, lx + 1, y + 1, 1, 1, C.pupil);
      R(ctx, lx + 2, y + 2, 1, 1, C.pupil);
      R(ctx, rx, y + 2, 1, 1, C.pupil);
      R(ctx, rx + 1, y + 1, 1, 1, C.pupil);
      R(ctx, rx + 2, y + 2, 1, 1, C.pupil);
      return;
    }

    const eh = Math.max(1, Math.round(3 * open));
    const eyeTop = y + (3 - eh);

    // Eye whites/iris (green-grey).
    R(ctx, lx, eyeTop, 3, eh, C.eye);
    R(ctx, rx, eyeTop, 3, eh, C.eye);

    if (open > 0.4) {
      // Pupils, offset by pupilX/pupilY (parallax follow), -1..1 both axes,
      // kept inside the 3px-wide / eh-tall eye white.
      const px = clampi(p.pupilX, -1, 1); // -1..1
      const py = clampi(p.pupilY, -1, 1);
      const ux = 1 + px; // 0..2 within the 3px eye
      const uy = eh <= 1 ? 0 : clampi(1 + py, 0, eh - 1);
      R(ctx, lx + ux, eyeTop + uy, 1, 1, C.pupil);
      R(ctx, rx + ux, eyeTop + uy, 1, 1, C.pupil);
      // catch-light
      R(ctx, lx, eyeTop, 1, 1, C.eyeLight);
      R(ctx, rx, eyeTop, 1, 1, C.eyeLight);
    }
  }

  function clampi(v, lo, hi) {
    v = Math.round(v);
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Red overheat overlay, multiplied only over drawn (non-transparent) pixels.
  function drawTint(ctx, amount) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.45 * amount;
    ctx.fillStyle = '#e0402a';
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.restore();
  }

  return { BASE_W, BASE_H, C, defaults, draw };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { OYEN };
if (typeof window !== 'undefined') window.OYEN = OYEN;
