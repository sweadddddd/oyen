'use strict';

// Lightweight particle/effect layer drawn on its own canvas above the sprite:
// overheat steam puffs, the scroll "paper roll" unspooling under the paws,
// purr motion lines, and floating sleep "z"s. Positions are in client (window)
// coordinates.

class Particles {
  constructor(ctx) {
    this.ctx = ctx;
    this.steam = [];
    this.zzz = [];
    this.paper = null; // { x, y, len, target, life }
    this.purrLines = 0;
  }

  emitSteam(x, y) {
    if (this.steam.length > 40) return;
    this.steam.push({
      x: x + (Math.random() - 0.5) * 16,
      y,
      vy: -18 - Math.random() * 12,
      vx: (Math.random() - 0.5) * 8,
      r: 3 + Math.random() * 3,
      life: 1,
    });
  }

  emitZ(x, y) {
    this.zzz.push({ x, y, vy: -10, life: 1, size: 6 + Math.random() * 4 });
  }

  startPaper(x, y, targetLen, delta) {
    this.paper = { x, y, len: 0, target: targetLen, life: 1, dir: Math.sign(delta) || 1 };
  }

  update(dt) {
    for (const s of this.steam) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.r += dt * 4;
      s.life -= dt * 0.8;
    }
    this.steam = this.steam.filter((s) => s.life > 0);

    for (const z of this.zzz) {
      z.y += z.vy * dt;
      z.x += 6 * dt;
      z.life -= dt * 0.5;
    }
    this.zzz = this.zzz.filter((z) => z.life > 0);

    if (this.paper) {
      const p = this.paper;
      if (p.len < p.target) p.len += (p.target - p.len) * Math.min(1, dt * 8);
      else {
        p.life -= dt * 0.6;
        p.len = Math.max(0, p.len - dt * 30);
      }
      if (p.life <= 0) this.paper = null;
    }
  }

  draw() {
    const ctx = this.ctx;

    // Steam puffs.
    for (const s of this.steam) {
      ctx.globalAlpha = Math.max(0, s.life) * 0.6;
      ctx.fillStyle = '#e8e8ee';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Paper roll (pixel scroll) under the paws.
    if (this.paper) {
      const p = this.paper;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#f7f0dc';
      ctx.fillRect(Math.round(p.x - 10), Math.round(p.y), 20, Math.round(p.len));
      ctx.fillStyle = '#d9cba0';
      // faint ruled lines
      for (let ly = 6; ly < p.len; ly += 6) {
        ctx.fillRect(Math.round(p.x - 8), Math.round(p.y + ly), 16, 1);
      }
      // roller at top
      ctx.fillStyle = '#c9954f';
      ctx.fillRect(Math.round(p.x - 12), Math.round(p.y - 3), 24, 3);
      ctx.globalAlpha = 1;
    }

    // Floating z's (sleep).
    ctx.fillStyle = '#8fb0d0';
    for (const z of this.zzz) {
      ctx.globalAlpha = Math.max(0, z.life);
      ctx.font = `${Math.round(z.size)}px monospace`;
      ctx.fillText('z', z.x, z.y);
    }
    ctx.globalAlpha = 1;
  }

  drawPurrLines(x, y) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(120,120,120,0.5)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(x + i * 22, y - 6);
      ctx.lineTo(x + i * 28, y - 12);
      ctx.stroke();
    }
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Particles };
if (typeof window !== 'undefined') window.Particles = Particles;
