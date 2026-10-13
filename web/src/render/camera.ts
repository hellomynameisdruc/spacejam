// The telescope: viewport size, zoom/pan, smooth flights between objects, following a moving planet.
import type { Vec } from "../core/types";
import { ease } from "../core/util";
import { reduce } from "../core/dom";
import { galaxy, motion } from "../app/state";

/** zoom levels where more detail appears: planets → satellites → track titles */
export const LOD_PLANETS = 0.12, LOD_TRACKS = 0.7, LOD_TITLES = 3.2;
export const MAX_SCALE = 14;

type Tween = { fx: number; fy: number; fs: number; tx: number; ty: number; ts: number; t0: number; dur: number };

class Camera {
  x = 0; y = 0; s = 1;
  /** viewport size in CSS px, and device pixel ratio (max 2) */
  W = 1; H = 1; DPR = 1;
  /** 0…1 while flying far: streaks the dust */
  warpFx = 0;
  private tween: Tween | null = null;
  private follow: number | null = null;
  private followP: Vec = { x: 0, y: 0 };

  homeScale() { const b = galaxy.bounds; return Math.min(this.W / b.w, this.H / b.h) * 0.94; }
  minS() { return this.homeScale() * 0.5; }
  clampS(s: number) { return Math.max(this.minS(), Math.min(MAX_SCALE, s)); }
  toScreen(x: number, y: number): Vec { return { x: (x - this.x) * this.s + this.W / 2, y: (y - this.y) * this.s + this.H / 2 }; }
  toWorld(x: number, y: number): Vec { return { x: (x - this.W / 2) / this.s + this.x, y: (y - this.H / 2) / this.s + this.y }; }

  fly(tx: number, ty: number, ts: number, dur = 1400) {
    this.tween = { fx: this.x, fy: this.y, fs: this.s, tx, ty, ts: this.clampS(ts), t0: performance.now(), dur: reduce ? 1 : dur };
  }
  stop() { this.tween = null; }
  get flying() { return !!this.tween; }

  /** ride along with planet i (or stop following with null) */
  setFollow(i: number | null) {
    this.follow = i !== null && i >= 0 ? i : null;
    if (this.follow !== null) { const q = motion.planetPos(this.follow, performance.now()); this.followP = { x: q.x, y: q.y }; }
  }
  unfollow() { this.follow = null; }

  /** advance follow + flight to time `now`; returns true when the view changed in a way that needs a repaint */
  update(now: number): boolean {
    if (this.follow !== null) {
      const q = motion.planetPos(this.follow, now), dx = q.x - this.followP.x, dy = q.y - this.followP.y;
      this.followP = { x: q.x, y: q.y };
      if (dx || dy) {
        const t = this.tween;
        if (t) { t.fx += dx; t.fy += dy; t.tx += dx; t.ty += dy; } else { this.x += dx; this.y += dy; }
        // no full repaint: the live layer slides the static one
      }
    }
    const t = this.tween; if (!t) return false;
    const k = Math.min(1, (now - t.t0) / t.dur), e = ease(k);
    this.x = t.fx + (t.tx - t.fx) * e; this.y = t.fy + (t.ty - t.fy) * e;
    const dist = Math.hypot(t.tx - t.fx, t.ty - t.fy) * Math.min(t.fs, t.ts);
    const bump = Math.min(2.2, dist / 500) * Math.sin(Math.PI * e);
    this.s = Math.exp(Math.log(t.fs) + (Math.log(t.ts) - Math.log(t.fs)) * e - bump);
    this.warpFx = reduce ? 0 : Math.min(1, bump);
    if (k >= 1) { this.tween = null; this.warpFx = 0; }
    return true;
  }

  /** zoom by factor k keeping the screen point (sx, sy) fixed */
  zoomAt(sx: number, sy: number, k: number) {
    const before = this.toWorld(sx, sy);
    this.s = this.clampS(this.s * k);
    const after = this.toWorld(sx, sy); this.x += before.x - after.x; this.y += before.y - after.y; this.tween = null;
  }
}

export const cam = new Camera();
