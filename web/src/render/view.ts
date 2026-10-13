// What part of the world is on screen. The static layer is drawn with a margin around the view
// (so it can slide), the live layer only covers the view itself.
import type { Vec } from "../core/types";
import { cam } from "./camera";

export const MARGIN = 200;
export const view = {
  /** static layer bounds (with margin), world coords */
  V0: { x: 0, y: 0 } as Vec, V1: { x: 0, y: 0 } as Vec,
  /** visible right now, world coords */
  LV0: { x: 0, y: 0 } as Vec, LV1: { x: 0, y: 0 } as Vec,
};
export const inView = (x: number, y: number, r: number) => x + r > view.V0.x && x - r < view.V1.x && y + r > view.V0.y && y - r < view.V1.y;
export const inLive = (x: number, y: number, r: number) => x + r > view.LV0.x && x - r < view.LV1.x && y + r > view.LV0.y && y - r < view.LV1.y;
export function updateStaticView() { view.V0 = cam.toWorld(-MARGIN, -MARGIN); view.V1 = cam.toWorld(cam.W + MARGIN, cam.H + MARGIN); }
export function updateLiveView() { view.LV0 = cam.toWorld(0, 0); view.LV1 = cam.toWorld(cam.W, cam.H); }
