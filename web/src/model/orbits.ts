// Motion: planets circle their star, satellites (tracks) swarm around their planet. Pure maths over
// the galaxy and the loaded track chunks — the renderer and the picker both read positions from here.
import type { Chunk, Vec } from "../core/types";
import type { Galaxy } from "./galaxy";
import { lcg } from "../core/util";

/** Satellite orbits of one star system, one entry per track (zeros for belt tracks) */
export type Orbit = { d: Float32Array; th: Float32Array; ci: Float32Array; si: Float32Array; cO: Float32Array; sO: Float32Array; w: Float32Array };

const TAU = 6.2832;
/** a planet ring's period at the innermost orbit, seconds */
const PLANET_PERIOD = 360;
/** a satellite's period at the planet's surface, seconds (Kepler: farther = slower) */
const SAT_PERIOD = 46;

export const emptyOrbit = (n: number): Orbit => ({ d: new Float32Array(n), th: new Float32Array(n), ci: new Float32Array(n), si: new Float32Array(n), cO: new Float32Array(n), sO: new Float32Array(n), w: new Float32Array(n) });

/**
 * Satellites orbit their planet on tilted circular orbits with random orientations, which makes a
 * spherical swarm. Seeded per planet, so every visitor sees the same sky and planets can be filled
 * in any order (only the ones on screen, the first time they appear).
 */
export function fillPlanetOrbits(g: Galaxy, o: Orbit, pi: number, ch: Chunk) {
  const P = g.planets[pi], r1 = lcg(1 + pi * 7919);
  for (let i = P.t0; i < P.t1; i++) {
    const dx = ch.x[i] - P.x, dy = ch.y[i] - P.y, d = Math.hypot(dx, dy);
    const ci = 2 * r1() - 1, O = r1() * TAU;
    o.d[i] = d; o.th[i] = Math.atan2(dy, dx); o.ci[i] = ci; o.si[i] = Math.sqrt(1 - ci * ci); o.cO[i] = Math.cos(O); o.sO[i] = Math.sin(O);
    o.w[i] = (TAU / SAT_PERIOD) * Math.pow((P.r + 4) / Math.max(d, P.r + 4), 1.5);
  }
}

/** all satellite orbits of a star at once (tests, tools) */
export function buildOrbit(g: Galaxy, s: number, ch: Chunk): Orbit {
  const o = emptyOrbit(ch.x.length);
  for (const pi of g.planetsByStar[s]) fillPlanetOrbits(g, o, pi, ch);
  return o;
}

export class Motion {
  /** angular speed of each planet (rad/s); a whole band turns together, so planets never collide */
  readonly pOmega: number[];
  private readonly orbits: (Orbit | null)[];
  /** planets whose satellite orbits are computed */
  private readonly filled: Uint8Array;
  /** time used when a caller doesn't pass one (the current frame) */
  now = 0;
  private readonly PP: Vec = { x: 0, y: 0 };
  private readonly OP = { x: 0, y: 0, z: 0 };

  constructor(private g: Galaxy, private chunk: (s: number) => Chunk | null, private frozen = false) {
    this.orbits = g.stars.map(() => null);
    this.filled = new Uint8Array(g.planets.length);
    this.pOmega = g.planets.map((p) => {
      if (!p.o) return 0;
      const o0 = g.stars[p.s].orb?.[0] || p.o;
      return (p.s % 2 ? -1 : 1) * (TAU / PLANET_PERIOD) * Math.pow(o0 / (p.b ?? p.o), 0.9);
    });
  }

  private secs(t: number) { return this.frozen ? 0 : t / 1000; }

  /** where planet i is at time t (ms). Returns a shared object: copy it if you keep it. */
  planetPos(i: number, t = this.now): Vec {
    const p = this.g.planets[i], PP = this.PP;
    if (!p.o) { PP.x = p.x; PP.y = p.y; return PP; }
    const st = this.g.stars[p.s], a = (p.a ?? 0) + this.secs(t) * this.pOmega[i];
    PP.x = st.x + Math.cos(a) * p.o; PP.y = st.y + Math.sin(a) * p.o; return PP;
  }

  /** the star's satellite-orbit arrays (filled per planet on demand, see ensurePlanet) */
  orbitOf(s: number): Orbit | null {
    if (this.orbits[s]) return this.orbits[s];
    const ch = this.chunk(s); if (!ch) return null;
    return (this.orbits[s] = emptyOrbit(ch.x.length));
  }
  /** make sure planet pi's satellites have their orbits; false if its tracks aren't loaded */
  ensurePlanet(pi: number): boolean {
    if (this.filled[pi]) return true;
    const s = this.g.planets[pi].s, o = this.orbitOf(s), ch = this.chunk(s); if (!o || !ch) return false;
    fillPlanetOrbits(this.g, o, pi, ch); this.filled[pi] = 1; return true;
  }

  /** world position of track i of star s at time t; z > 0 means in front of its planet. Shared object. */
  trackPos(s: number, i: number, t = this.now) {
    const ch = this.chunk(s)!, o = this.orbitOf(s), OP = this.OP;
    if (o && ch.p[i] >= 0) this.ensurePlanet(ch.p[i]);
    if (!o || ch.p[i] < 0 || !o.d[i]) { OP.x = ch.x[i]; OP.y = ch.y[i]; OP.z = 1; return OP; }
    const P = this.planetPos(ch.p[i], t), th = o.th[i] + this.secs(t) * o.w[i], d = o.d[i];
    const X = d * Math.cos(th), Y = d * Math.sin(th) * o.ci[i];
    OP.x = P.x + X * o.cO[i] - Y * o.sO[i]; OP.y = P.y + X * o.sO[i] + Y * o.cO[i]; OP.z = d * Math.sin(th) * o.si[i];
    return OP;
  }

  /** a satellite on the far side, inside the planet's disc, can't be seen */
  hiddenBehind(s: number, i: number, q: { x: number; y: number; z: number }) {
    if (q.z >= 0) return false;
    const pi = this.chunk(s)!.p[i]; if (pi < 0) return false;
    const r = this.g.planets[pi].r, P = this.planetPos(pi);
    return (q.x - P.x) ** 2 + (q.y - P.y) ** 2 < r * r;
  }
}
