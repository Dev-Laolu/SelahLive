"use client";
// Single-canvas code-generated background motion (V1.2 §4.3 & §4.5).
// Uses one requestAnimationFrame loop, particle caps, 30 fps Performance mode, and pauses when hidden or reduceMotion.
import { useEffect, useRef } from "react";

function hexToRgb(hex = "#E8B84A") {
  const clean = String(hex).replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0").slice(0, 6);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export default function BackgroundCanvas({
  type = "none",
  speed = 50,
  intensity = 45,
  color = "#E8B84A",
  paused = false,
  performanceMode = false,
  reduceMotion = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (paused || reduceMotion || !type || type === "none" || type === "gradient-drift" || type === "ken-burns") {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Render at half-res (960x540) or 640x360 in Performance mode to keep OBS CPU < ~8%
    const W = performanceMode ? 640 : 960;
    const H = performanceMode ? 360 : 540;
    canvas.width = W;
    canvas.height = H;

    const rgb = hexToRgb(color);
    const spd = Math.max(0.15, (speed || 50) / 50);
    const alphaScale = Math.max(0.1, Math.min(1, (intensity || 45) / 100));
    const fpsInterval = 1000 / (performanceMode ? 30 : 45);

    // Deterministic-seed particle pool (capped for performance)
    const pCount = performanceMode ? 12 : 28;
    const particles = Array.from({ length: pCount }, (_, i) => ({
      x: ((i * 137.5) % 100) / 100 * W,
      y: ((i * 73.1) % 100) / 100 * H,
      r: (performanceMode ? 10 : 14) + (i % 5) * 8,
      vx: ((i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.06)) * spd,
      vy: -(0.18 + (i % 5) * 0.07) * spd,
      phase: i * 0.9,
    }));

    let rafId = 0;
    let lastTime = 0;
    let t = 0;

    const draw = (now) => {
      rafId = requestAnimationFrame(draw);
      if (now - lastTime < fpsInterval) return;
      const dt = Math.min(0.08, (now - (lastTime || now)) / 1000);
      lastTime = now;
      t += dt * spd;

      ctx.clearRect(0, 0, W, H);

      if (type === "particles") {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -p.r * 2) { p.y = H + p.r * 2; p.x = ((p.x + 190) % W); }
          if (p.x < -p.r * 2) p.x = W + p.r * 2;
          if (p.x > W + p.r * 2) p.x = -p.r * 2;
          const pulse = 0.55 + 0.45 * Math.sin(t * 0.9 + p.phase);
          const a = 0.22 * alphaScale * pulse;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${a.toFixed(3)})`);
          grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (type === "light-rays") {
        const rays = performanceMode ? 4 : 6;
        ctx.save();
        ctx.translate(W * 0.5, -H * 0.15);
        for (let i = 0; i < rays; i++) {
          const angle = -0.65 + (i / (rays - 1)) * 1.3 + Math.sin(t * 0.35 + i) * 0.08;
          ctx.save();
          ctx.rotate(angle);
          const grad = ctx.createLinearGradient(0, 0, 0, H * 1.35);
          grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.24 * alphaScale).toFixed(3)})`);
          grad.addColorStop(0.7, `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.06 * alphaScale).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(-W * 0.03, 0);
          ctx.lineTo(W * 0.03, 0);
          ctx.lineTo(W * 0.16, H * 1.35);
          ctx.lineTo(-W * 0.16, H * 1.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      } else if (type === "waves") {
        const layers = performanceMode ? 2 : 3;
        for (let l = 0; l < layers; l++) {
          ctx.beginPath();
          const baseY = H * (0.62 + l * 0.11);
          const amp = (18 + l * 10) * alphaScale;
          ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 24) {
            const y = baseY + Math.sin(x * 0.006 + t * (0.6 + l * 0.25) + l * 1.8) * amp;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(W, H);
          ctx.closePath();
          ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${((0.08 + l * 0.03) * alphaScale).toFixed(3)})`;
          ctx.fill();
        }
      } else if (type === "shimmer") {
        const x = ((t * 0.18) % 1.6 - 0.3) * W;
        const grad = ctx.createLinearGradient(x - W * 0.35, 0, x + W * 0.35, H);
        grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        grad.addColorStop(0.5, `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.18 * alphaScale).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      } else if (type === "grain" && !performanceMode) {
        const dots = 220;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${(0.08 * alphaScale).toFixed(3)})`;
        for (let i = 0; i < dots; i++) {
          const gx = Math.random() * W;
          const gy = Math.random() * H;
          ctx.fillRect(gx, gy, 2, 2);
        }
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [type, speed, intensity, color, paused, performanceMode, reduceMotion]);

  if (paused || reduceMotion || !type || type === "none" || type === "gradient-drift" || type === "ken-burns") {
    return null;
  }

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
