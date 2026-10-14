// SOLARIS: while a planet's orbit is playing, a small wireframe ship circles it just outside its
// satellites, turning slowly on its long axis like a schematic on a diagnostic screen. A listening
// dish leads the way, a ring of antennae turns round the hull, and a faint beam reaches down to the
// planet on the beat. Drawn as phosphor lines in the system's colour, like the rest of the map.
import { FONT_LBL, sc } from "./palette";
import { galaxy, motion, state } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS } from "./camera";
import { pulseOf } from "./pulsar";

type V3 = [number, number, number];

/** the ship as points and edges, nose along +x, length about 1 */
const SHIP = (() => {
  const pts: V3[] = [], edges: [number, number][] = [];
  const ring = (x: number, r: number, n: number, twist = 0) => {
    const first = pts.length;
    for (let k = 0; k < n; k++) { const a = twist + (k / n) * Math.PI * 2; pts.push([x, Math.cos(a) * r, Math.sin(a) * r]); }
    for (let k = 0; k < n; k++) edges.push([first + k, first + ((k + 1) % n)]);
    return first;
  };
  const join = (a: number, b: number, n: number) => { for (let k = 0; k < n; k++) edges.push([a + k, b + k]); };
  // tapered hull: tail spike to the shoulders, six-sided
  const tail = pts.length; pts.push([-0.55, 0, 0]);
  const hull = [ring(-0.36, 0.035, 6), ring(-0.12, 0.06, 6), ring(0.12, 0.075, 6), ring(0.26, 0.09, 6)];
  for (let k = 0; k < 6; k++) edges.push([tail, hull[0] + k]);
  for (let j = 1; j < hull.length; j++) join(hull[j - 1], hull[j], 6);
  // the listening dish: flares out at the bow, a shallow cone with a feed spike
  const lip = ring(0.38, 0.24, 12, Math.PI / 12), rim = ring(0.43, 0.27, 12, Math.PI / 12);
  for (let k = 0; k < 6; k++) edges.push([hull[3] + k, lip + 2 * k]);
  join(lip, rim, 12);
  const feed = pts.length; pts.push([0.62, 0, 0]);
  for (let k = 0; k < 12; k += 3) edges.push([rim + k, feed]);
  // antenna ring amidships on four struts
  const ant = ring(-0.02, 0.17, 8, Math.PI / 8), core = ring(-0.02, 0.068, 4, Math.PI / 8);
  for (let k = 0; k < 4; k++) edges.push([core + k, ant + 2 * k]);
  return { pts, edges, tail };
})();

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  const pi = state.orbit; if (pi === null || cam.s < LOD_PLANETS) return;
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y);
  const R = Math.max(orbitR(pl) * cam.s + 26, pl.r * cam.s + 46), a = (t / 16000) * Math.PI * 2;
  const x = c.x + Math.cos(a) * R, y = c.y + Math.sin(a) * R * 0.92;
  if (x < -90 || y < -90 || x > cam.W + 90 || y > cam.H + 90) return;
  const { bar } = pulseOf(pl.s, t), col = (al: number) => sc(pl.s, al);

  // its orbit, faintly, and the listening beam down to the planet
  ctx.strokeStyle = col(0.16); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  const pr = Math.max(2, pl.r * cam.s), dx = c.x - x, dy = c.y - y, dl = Math.hypot(dx, dy) || 1;
  ctx.strokeStyle = col(0.2 + 0.35 * (1 - bar));
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(c.x - dx / dl * pr, c.y - dy / dl * pr); ctx.stroke();

  // the ship: roll on its axis, a fixed three-quarter tilt, nose along the orbit
  const L = Math.max(46, Math.min(96, 30 + cam.s * 22)), roll = t / 2600, tilt = 0.55;
  const head = a + Math.PI / 2, ch = Math.cos(head), shd = Math.sin(head);
  const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = SHIP.pts.map(([px, py, pz]) => {
    const y1 = py * cr - pz * sr, z1 = py * sr + pz * cr; // roll about the long axis
    const x2 = px * ct + z1 * st, z2 = -px * st + z1 * ct; // tilt toward the viewer
    return { sx: x + (x2 * ch - y1 * shd) * L, sy: y + (x2 * shd + y1 * ch) * L * 0.92, z: z2 };
  });
  ctx.lineCap = "round";
  for (const [w, al] of [[3.2, 0.16], [1, 0.95]] as const) { // a soft phosphor glow, then the line
    ctx.lineWidth = w;
    for (const [i, j] of SHIP.edges) {
      const A = P[i], B = P[j], depth = (A.z + B.z) / 2; // edges at the back are dimmer
      ctx.strokeStyle = col(al * (0.55 + 0.45 * Math.max(0, Math.min(1, 0.5 - depth * 2))));
      ctx.beginPath(); ctx.moveTo(A.sx, A.sy); ctx.lineTo(B.sx, B.sy); ctx.stroke();
    }
  }
  // tail beacon on the beat
  if (bar > 0.7) { const T = P[SHIP.tail]; ctx.fillStyle = "#ff4d6d"; ctx.fillRect(Math.round(T.sx) - 1, Math.round(T.sy) - 1, 3, 3); }

  // a schematic call-out, like a diagnostic screen
  const lx = x + (x < c.x ? -1 : 1) * (L * 0.55 + 18), ly = y - L * 0.45 - 6;
  ctx.strokeStyle = col(0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - L * 0.12); ctx.lineTo(lx, ly); ctx.lineTo(lx + (x < c.x ? -46 : 46), ly); ctx.stroke();
  ctx.fillStyle = col(0.9); ctx.font = `9px ${FONT_LBL}`; ctx.textAlign = x < c.x ? "right" : "left";
  ctx.fillText("SOLARIS · LISTENING", lx + (x < c.x ? -2 : 2), ly - 3);
}
