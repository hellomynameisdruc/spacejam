// Stars as pulsars: a dithered sphere lit from within, a dotted halo, a flash on every beat at the
// style's tempo, and a nova shell once per bar.
import { reduce } from "../core/dom";
import { galaxy } from "../app/state";
import { BG, glowS, sc, starDither } from "./palette";
import { cam } from "./camera";

export function pulseOf(si: number, t: number) {
  const beat = (t / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si];
  return { p: reduce ? 0.4 : Math.exp(-(beat % 1) * 6), bar: reduce ? 0.3 : (beat / 4) % 1 };
}

/** on-screen star radius: popularity sets it, zoom scales it within limits */
export const starSize = (si: number) => { const k = galaxy.starRel[si]; return Math.max(3.5 + 8 * k, Math.min(54, (12 + 44 * k) * cam.s)); };

export function drawPulsar(c: CanvasRenderingContext2D, si: number, x: number, y: number, s: number, t: number) {
  const { p, bar } = pulseOf(si, t), lum = galaxy.lum[si];
  const prev = c.globalCompositeOperation;
  // nova shell — once per bar
  c.strokeStyle = sc(si, 0.55 * (1 - bar) ** 2); c.lineWidth = Math.max(1, s * 0.1 * (1 - bar));
  c.beginPath(); c.arc(x, y, s * (1.3 + 6 * bar), 0, 7); c.stroke();
  // dotted halo, like a planet's satellite ring; breathes with the beat
  const hr = s * (1.75 + 0.18 * p), rot = (reduce ? 0 : t / 1000) * 0.2 * (si % 2 ? 1 : -1) + galaxy.phase0[si] * 6.283;
  const nDots = Math.max(16, Math.min(48, Math.round(hr * 1.4))), dsz = Math.max(1, Math.round(s * 0.09));
  c.fillStyle = sc(si, 0.3 + 0.35 * lum + 0.3 * p);
  for (let k = 0; k < nDots; k++) { const a = rot + k * 6.283 / nDots; c.fillRect(Math.round(x + Math.cos(a) * hr - dsz / 2), Math.round(y + Math.sin(a) * hr - dsz / 2), dsz, dsz); }
  // glow
  c.globalCompositeOperation = "lighter";
  const gR = s * (1.8 + 1.4 * lum + 2.2 * p); c.globalAlpha = Math.min(1, 0.2 + 0.45 * lum + 0.45 * p); c.drawImage(glowS[si], x - gR, y - gR, gR * 2, gR * 2); c.globalAlpha = 1;
  c.globalCompositeOperation = prev;
  // dithered sphere, lit from inside
  const r = s * (1 + 0.1 * p);
  c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
  c.fillStyle = BG; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = c.createPattern(starDither[si], "repeat")!; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.85 + 0.15 * p})`); g.addColorStop(0.35 + 0.15 * p, sc(si, 0.9)); g.addColorStop(1, sc(si, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
  // outline, like the planets
  c.strokeStyle = sc(si, 0.95); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
}
