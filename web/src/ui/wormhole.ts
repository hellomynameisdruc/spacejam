// The wormhole: a jump through interstellar space — stars stretch into streaks, a tunnel of rings
// pulls you in, the colour flows from the current system to the destination, a flash, and you're there.
import { pad } from "../core/util";
import { reduce } from "../core/dom";
import { state } from "../app/state";
import { cam } from "../render/camera";
import { FONT_LBL, SC } from "../render/palette";
import { viewportEl } from "../render/scene";
import { glitchUI } from "./glitch";
import { warpFx } from "./scopes";

let wf: HTMLCanvasElement, wg: CanvasRenderingContext2D;
export function initWormhole() {
  wf = document.createElement("canvas"); wf.className = "wormhole"; wf.setAttribute("aria-hidden", "true"); viewportEl().appendChild(wf);
  wg = wf.getContext("2d")!;
}

/** plays the transit; calls onPeak at the flash (move the camera there) */
export function wormhole(fromSi: number, toSi: number, dest: string, onPeak: () => void) {
  if (reduce) { onPeak(); return; }
  state.warping = true;
  const dpr = cam.DPR, w = cam.W, h = cam.H;
  wf.width = w * dpr; wf.height = h * dpr; wg.setTransform(dpr, 0, 0, dpr, 0, 0); wf.style.display = "block";
  const A = SC[fromSi], B = SC[toSi];
  const mix = (k: number, a: number) => { k = Math.max(0, Math.min(1, k)); return `rgba(${(A[0] + (B[0] - A[0]) * k) | 0},${(A[1] + (B[1] - A[1]) * k) | 0},${(A[2] + (B[2] - A[2]) * k) | 0},${a})`; };
  const R = Math.hypot(w, h) / 2;
  const parts = Array.from({ length: 280 }, () => ({ a: Math.random() * 6.283, z: 0.05 + Math.random() * 0.95, sp: 0.6 + Math.random() * 0.9 }));
  const T = 2600, t0 = performance.now();
  glitchUI(T);
  let peaked = false, last = t0;
  const code = `${pad(Math.floor(Math.random() * 9999), 4)}.${pad(Math.floor(Math.random() * 999), 3)}`;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / T), dt = Math.min(50, now - last) / 16.7; last = now;
    warpFx.k = k; warpFx.col = (a = 1) => mix(k * 1.3, a);
    const fadeIn = Math.min(1, k / 0.16), fadeOut = k > 0.84 ? 1 - (k - 0.84) / 0.16 : 1, vis = Math.min(fadeIn, fadeOut);
    const speed = Math.sin(Math.PI * Math.min(1, k * 1.12));
    const vx = w / 2 + Math.sin(k * 9) * w * 0.035 * speed, vy = h / 2 + Math.cos(k * 7) * h * 0.035 * speed;
    wg.globalCompositeOperation = "source-over"; wg.clearRect(0, 0, w, h);
    wg.fillStyle = `rgba(3,2,8,${0.94 * vis})`; wg.fillRect(0, 0, w, h);
    wg.globalCompositeOperation = "lighter";
    // зоряні штрихи
    const v = 0.004 + 0.05 * speed;
    wg.lineWidth = 1.4;
    for (const p of parts) {
      const z1 = p.z; p.z -= v * p.sp * dt;
      if (p.z <= 0.02) { p.z = 1; p.a = Math.random() * 6.283; continue; }
      const r0 = R * 0.05 / z1, r1 = R * 0.05 / p.z, ca = Math.cos(p.a), sa = Math.sin(p.a);
      wg.strokeStyle = mix(k * 1.3 - p.z * 0.3, (1 - p.z) * 0.95 * vis);
      wg.beginPath(); wg.moveTo(vx + ca * r0, vy + sa * r0); wg.lineTo(vx + ca * r1, vy + sa * r1); wg.stroke();
    }
    // тунель кілець
    const tunnel = Math.max(0, Math.min(1, (k - 0.1) / 0.18)) * vis;
    if (tunnel > 0) {
      const n = 16, flow = (now - t0) / 420;
      for (let i = 0; i < n; i++) {
        const z = (((i / n) - flow) % 1 + 1) % 1 + 0.015;
        const r = R * 0.07 / z; if (r > R * 1.8) continue;
        const twist = (1 - z) * 0.9 + k * 4;
        const ox = Math.sin(i * 1.7 + k * 8) * R * 0.025 * (1 - z), oy = Math.cos(i * 1.3 + k * 6) * R * 0.025 * (1 - z);
        wg.strokeStyle = mix(k * 1.4 - z * 0.4, (1 - z) * 0.85 * tunnel);
        wg.lineWidth = Math.max(1, 4 * (1 - z));
        wg.setLineDash([r * 0.22, r * 0.1]); wg.lineDashOffset = (i % 2 ? 1 : -1) * flow * 40;
        wg.beginPath(); wg.ellipse(vx + ox, vy + oy, r, r * 0.92, twist, 0, Math.PI * 2); wg.stroke();
      }
      wg.setLineDash([]);
    }
    // вихід: ядро росте й засліплює
    const grow = Math.max(0, (k - 0.5) / 0.32);
    const cr = R * (0.03 + 0.5 * grow ** 3);
    const gr = wg.createRadialGradient(vx, vy, 0, vx, vy, cr);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * vis})`); gr.addColorStop(0.4, mix(1, 0.7 * vis)); gr.addColorStop(1, mix(1, 0));
    wg.fillStyle = gr; wg.beginPath(); wg.arc(vx, vy, cr, 0, 7); wg.fill();
    if (k > 0.72 && k < 0.96) { wg.fillStyle = `rgba(255,255,255,${Math.sin(Math.PI * (k - 0.72) / 0.24) * 0.85})`; wg.fillRect(0, 0, w, h); }
    // телеметрія переходу
    wg.globalCompositeOperation = "source-over";
    const ta = Math.min(1, k / 0.1) * (k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.08) : 1);
    if (ta > 0) {
      const flick = Math.random() < 0.06 ? 0.35 : 1;
      wg.globalAlpha = ta * flick; wg.textAlign = "center"; wg.fillStyle = mix(k * 1.3, 1);
      wg.font = `${Math.round(Math.max(14, Math.min(26, w / 24)))}px ${FONT_LBL}`;
      wg.fillText("WORMHOLE // TRANSIT", w / 2, h * 0.2);
      wg.font = `12px ${FONT_LBL}`; wg.fillStyle = "rgba(255,255,255,0.8)";
      const shown = Math.floor(dest.length * Math.min(1, k / 0.55));
      wg.fillText(`→ ${dest.slice(0, shown)}${"▓▒░".charAt(Math.floor(now / 60) % 3).repeat(Math.max(0, Math.min(6, dest.length - shown)))}`, w / 2, h * 0.2 + 24);
      // смуга дистанції
      const bw = Math.min(320, w * 0.6), bx = w / 2 - bw / 2, by = h * 0.8;
      wg.strokeStyle = mix(k, 0.8); wg.lineWidth = 1; wg.strokeRect(bx, by, bw, 8);
      wg.fillStyle = mix(k, 1); wg.fillRect(bx + 2, by + 2, (bw - 4) * Math.min(1, k / 0.72), 4);
      wg.font = `11px ${FONT_LBL}`; wg.fillStyle = "rgba(255,255,255,0.7)";
      wg.fillText(`DISTANCE ${code} LY · ${Math.round(Math.min(1, k / 0.72) * 100)}%`, w / 2, by + 24);
      wg.globalAlpha = 1;
    }
    if (!peaked && k >= 0.8) { peaked = true; onPeak(); }
    if (k < 1) requestAnimationFrame(step);
    else { wf.style.display = "none"; state.warping = false; warpFx.k = -1; }
  };
  requestAnimationFrame(step);
}

