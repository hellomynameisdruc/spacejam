import math
from PIL import Image
N = 16
BG = (7, 6, 14); PL = (190, 184, 255); HI = (255, 255, 255); SH = (98, 86, 210); DK = (42, 34, 110); RG = (255, 92, 214)
g = [[None] * N for _ in range(N)]
cx, cy, R = 7.5, 7.8, 4.1
tilt = -0.38
ca, sa = math.cos(tilt), math.sin(tilt)
def ringv(x, y):
    dx, dy = x - cx, y - cy
    u = dx * ca + dy * sa; v = -dx * sa + dy * ca
    return math.hypot(u / 6.7, v / 2.2), v
inside = lambda x, y: math.hypot(x - cx, y - cy) <= R
for y in range(N):
    for x in range(N):
        e, v = ringv(x, y)
        if abs(e - 1) < 0.16 and v < 0 and not inside(x, y): g[y][x] = RG
for y in range(N):
    for x in range(N):
        dx, dy = x - cx, y - cy
        if inside(x, y):
            l = (-dx - dy) / (R * 1.42)
            if l > 0.45 and math.hypot(dx + 1.6, dy + 1.6) < 1.3: c = HI
            elif l > 0.0: c = PL
            elif l > -0.45: c = PL if (x + y) % 2 else SH
            else: c = SH if (x + y) % 2 else DK
            g[y][x] = c
for y in range(N):
    for x in range(N):
        e, v = ringv(x, y)
        if abs(e - 1) < 0.16 and v >= 0: g[y][x] = RG
def png(size, bg=True, pad=0):
    cell = (size - 2 * pad) // N; off = (size - cell * N) // 2
    im = Image.new("RGBA", (size, size), BG + (255,) if bg else (0, 0, 0, 0))
    for y in range(N):
        for x in range(N):
            if g[y][x]:
                for yy in range(cell):
                    for xx in range(cell): im.putpixel((off + x * cell + xx, off + y * cell + yy), g[y][x] + (255,))
    return im
rects = "".join(f"<rect x='{x}' y='{y}' width='1' height='1' fill='#{c[0]:02x}{c[1]:02x}{c[2]:02x}'/>" for y in range(N) for x in range(N) if (c := g[y][x]))
open("favicon.svg", "w").write(f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'><rect width='16' height='16' rx='3' fill='#07060e'/>{rects}</svg>")
png(32).save("favicon-32.png"); png(180, pad=18).save("apple-touch-icon.png"); png(512, pad=48).save("icon-512.png")
png(256).resize((256, 256)).save("preview.png")
