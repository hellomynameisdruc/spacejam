// Text labels with collision avoidance, shared by the static and the live layer within one frame.
import { BG, FONT_LBL } from "./palette";

type Box = { x0: number; y0: number; x1: number; y1: number };

class Labels {
  /** canvas the labels currently draw on (static layer, or the live frame) */
  g!: CanvasRenderingContext2D;
  private placed: Box[] = [];
  private textW = new Map<string, number>(); // measureText is slow

  reset() { this.placed.length = 0; }
  /** remember how many labels are placed, to roll back the live layer's ones after the frame */
  mark() { return this.placed.length; }
  rollback(n: number) { this.placed.length = n; }

  /** draws unless it overlaps an earlier label (or `force`); `inv` = inverted tag. Returns whether drawn. */
  label(txt: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", force = false, inv = false) {
    const G = this.g;
    G.font = `${size}px ${FONT_LBL}`;
    const key = size + "|" + txt; let w = this.textW.get(key);
    if (w === undefined) { w = G.measureText(txt).width; if (this.textW.size > 20000) this.textW.clear(); this.textW.set(key, w); }
    const h = size + 2;
    const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const r = { x0: x0 - 3, y0: y - h, x1: x0 + w + 3, y1: y + 4 };
    if (!force && this.placed.some((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0)) return false;
    this.placed.push(r);
    G.textAlign = align;
    if (inv) { G.fillStyle = color; G.fillRect(r.x0 - 2, r.y0 + 1, r.x1 - r.x0 + 4, h + 4); G.fillStyle = BG; }
    else G.fillStyle = color;
    G.fillText(txt, x, y);
    return true;
  }

  /** selection corners */
  brackets(x: number, y: number, r: number, color: string, len = 6) {
    const G = this.g;
    G.strokeStyle = color; G.lineWidth = 1.2; G.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * r, cy = y + sy * r;
      G.moveTo(cx, cy - sy * len); G.lineTo(cx, cy); G.lineTo(cx - sx * len, cy);
    }
    G.stroke();
  }
}

export const labels = new Labels();
