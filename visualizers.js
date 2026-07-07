/*
 * Visualization modes for SonicTrance.
 * Each visualizer is a function (frame) => void, where `frame` is:
 *   ctx    CanvasRenderingContext2D
 *   w, h   canvas size in CSS pixels
 *   freq   Uint8Array of frequency magnitudes (0..255)
 *   wave   Uint8Array of time-domain samples (0..255, 128 = silence)
 *   energy smoothed overall loudness 0..1
 *   bass   smoothed low-frequency loudness 0..1
 *   beat   true on detected beat frames
 *   theme  {hue(t), glow} — hue(t) maps t in 0..1 to a hue in degrees
 *   time   seconds since start
 */
(function () {
  'use strict';

  const THEMES = {
    aurora: { hue: t => 160 + t * 140, glow: 0.9 },   // teal → violet
    sunset: { hue: t => 350 + t * 70,  glow: 0.8 },   // magenta → orange
    neon:   { hue: t => (t * 360) % 360, glow: 1.0 }, // full rainbow
    mono:   { hue: () => 210, glow: 0.6 },            // ice blue
  };

  function color(theme, t, sat, light, alpha) {
    return `hsla(${theme.hue(t) % 360}, ${sat}%, ${light}%, ${alpha})`;
  }

  // Fade the previous frame instead of clearing, for motion trails.
  function fade(f, amount) {
    f.ctx.fillStyle = `rgba(5, 6, 10, ${amount})`;
    f.ctx.fillRect(0, 0, f.w, f.h);
  }

  /* ---------------- Bars: classic mirrored spectrum ---------------- */

  function bars(f) {
    fade(f, 0.38);
    const { ctx, w, h, freq, theme } = f;
    const n = 96;                       // bars on screen
    const usable = Math.floor(freq.length * 0.75); // top bins are ~empty
    const bw = w / n;
    const mid = h * 0.72;

    for (let i = 0; i < n; i++) {
      // log-ish sampling so bass doesn't hog the whole screen
      const bin = Math.floor(Math.pow(i / n, 1.6) * usable);
      const v = freq[bin] / 255;
      const bh = v * v * h * 0.62 * (1 + f.bass * 0.3);
      const t = i / n;
      const x = i * bw;

      ctx.fillStyle = color(theme, t, 90, 45 + v * 25, 0.95);
      ctx.fillRect(x + 1, mid - bh, bw - 2, bh);
      // reflection
      ctx.fillStyle = color(theme, t, 90, 40, 0.18);
      ctx.fillRect(x + 1, mid + 2, bw - 2, bh * 0.35);

      if (f.beat && v > 0.5) {
        ctx.fillStyle = color(theme, t, 100, 80, 0.9);
        ctx.fillRect(x + 1, mid - bh - 6, bw - 2, 4);
      }
    }
  }

  /* ---------------- Radial: rotating circular spectrum ---------------- */

  function radial(f) {
    fade(f, 0.3);
    const { ctx, w, h, freq, theme } = f;
    const cx = w / 2, cy = h / 2;
    const base = Math.min(w, h) * (0.16 + f.bass * 0.05);
    const rays = 180;
    const usable = Math.floor(freq.length * 0.7);
    const rot = f.time * 0.15;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.lineCap = 'round';

    for (let i = 0; i < rays; i++) {
      // mirror the spectrum so the circle is symmetric
      const half = i < rays / 2 ? i / (rays / 2) : (rays - i) / (rays / 2);
      const bin = Math.floor(Math.pow(half, 1.5) * usable);
      const v = freq[bin] / 255;
      const a = (i / rays) * Math.PI * 2;
      const len = base + v * v * Math.min(w, h) * 0.33;

      ctx.strokeStyle = color(theme, half, 90, 42 + v * 33, 0.85);
      ctx.lineWidth = 2 + v * 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * base, Math.sin(a) * base);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();

    // pulsing core
    const core = base * (0.55 + f.energy * 0.35 + (f.beat ? 0.15 : 0));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    g.addColorStop(0, color(theme, 0.5, 95, 70, 0.9 * theme.glow));
    g.addColorStop(1, color(theme, 0.5, 95, 50, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, core, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------------- Waves: layered oscilloscope with trails ---------------- */

  function wave(f) {
    fade(f, 0.16);
    const { ctx, w, h, wave: buf, theme } = f;
    const layers = 3;

    for (let L = 0; L < layers; L++) {
      const amp = (h * 0.22) * (1 - L * 0.25) * (0.4 + f.energy * 1.2);
      const yOff = h / 2 + (L - 1) * h * 0.04 * Math.sin(f.time * 0.7 + L);
      ctx.strokeStyle = color(theme, L / layers, 90, 55 + L * 8, 0.8 - L * 0.2);
      ctx.lineWidth = 2.5 - L * 0.6;
      ctx.beginPath();
      const step = Math.max(1, Math.floor(buf.length / w));
      for (let x = 0, i = 0; i < buf.length; i += step, x++) {
        const v = (buf[i] - 128) / 128;
        const y = yOff + v * amp;
        if (x === 0) ctx.moveTo(0, y);
        else ctx.lineTo((i / buf.length) * w, y);
      }
      ctx.stroke();
    }

    if (f.beat) {
      ctx.fillStyle = color(theme, 0.8, 100, 60, 0.06);
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* ---------------- Particles: beat-reactive particle field ---------------- */

  const MAX_P = 900;
  const parts = [];

  function spawn(f, count, burst) {
    const { w, h } = f;
    for (let i = 0; i < count && parts.length < MAX_P; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = burst ? 60 + Math.random() * 260 : 8 + Math.random() * 40;
      parts.push({
        x: w / 2 + (Math.random() - 0.5) * (burst ? 30 : w * 0.9),
        y: h / 2 + (Math.random() - 0.5) * (burst ? 30 : h * 0.9),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.15 + Math.random() * 0.35,
        size: burst ? 3 + Math.random() * 4.5 : 1.8 + Math.random() * 2.6,
        t: Math.random(),
      });
    }
  }

  function particles(f) {
    fade(f, 0.22);
    const { ctx, theme, dt } = f;

    spawn(f, 3 + Math.floor(f.energy * 10), false);
    if (f.beat) spawn(f, 40 + Math.floor(f.bass * 80), true);

    const drag = Math.pow(0.4, dt);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      // gentle swirl, stronger when loud
      const dx = p.x - f.w / 2, dy = p.y - f.h / 2;
      const swirl = 0.3 + f.energy * 1.2;
      p.vx += -dy * swirl * dt * 0.5;
      p.vy += dx * swirl * dt * 0.5;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.x < -20 || p.x > f.w + 20 || p.y < -20 || p.y > f.h + 20) {
        parts.splice(i, 1);
        continue;
      }
      const s = p.size * (0.75 + f.energy) * p.life;
      ctx.fillStyle = color(theme, p.t, 95, 60 + p.life * 20, Math.min(1, p.life * 1.3));
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
    }

    // faint spectrum ring behind the swarm
    const { freq } = f;
    const cx = f.w / 2, cy = f.h / 2;
    const base = Math.min(f.w, f.h) * 0.3;
    ctx.strokeStyle = color(theme, 0.5, 80, 50, 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const v = freq[Math.floor((i % 128) / 128 * freq.length * 0.5)] / 255;
      const a = (i / 128) * Math.PI * 2;
      const r = base + v * 40;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  window.SonicViz = {
    THEMES,
    modes: { bars, radial, wave, particles },
    reset() { parts.length = 0; },
  };
})();
